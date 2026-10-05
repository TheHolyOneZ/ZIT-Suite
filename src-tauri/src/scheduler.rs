use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use chrono::{DateTime, Datelike, Duration as ChronoDuration, Local, NaiveDate, NaiveTime, TimeZone, Weekday};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_specta::Event;

use crate::error::{AppError, AppResult};
use crate::queue::QueueAction;

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub struct Cadence {

    pub every: String,

    pub hours: u32,

    pub at: String,

    pub weekday: u8,

    pub day: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RunRecord {
    pub at: String,

    pub trigger: String,
    pub matched: u32,
    pub ready: u32,
    pub noop: u32,
    pub blocked: u32,
    pub queued: u32,

    pub outcome: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Schedule {
    pub id: String,
    pub name: String,
    pub enabled: bool,

    pub account_id: String,

    pub target: serde_json::Value,
    pub action: QueueAction,
    pub cadence: Cadence,

    pub mode: String,
    pub created_at: String,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    #[serde(default)]
    pub history: Vec<RunRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DueRun {
    pub schedule: Schedule,
    pub trigger: String,
}


#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ScheduleNudge {}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct SchedulesChanged {
    pub schedules: Vec<Schedule>,
}

const HISTORY: usize = 30;

const CLAIM_TIMEOUT: Duration = Duration::from_secs(15 * 60);

const CATCH_UP_AFTER: i64 = 10 * 60;

fn time_of(c: &Cadence) -> NaiveTime {
    NaiveTime::parse_from_str(&c.at, "%H:%M").unwrap_or_else(|_| NaiveTime::from_hms_opt(9, 0, 0).unwrap())
}

fn local(date: NaiveDate, t: NaiveTime) -> Option<DateTime<Local>> {
    let ndt = date.and_time(t);

    Local.from_local_datetime(&ndt).earliest().or_else(|| Local.from_local_datetime(&(ndt + ChronoDuration::hours(1))).earliest())
}

fn days_in_month(y: i32, m: u32) -> u32 {
    let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
    NaiveDate::from_ymd_opt(ny, nm, 1).and_then(|d| d.pred_opt()).map(|d| d.day()).unwrap_or(28)
}


pub fn next_after(c: &Cadence, from: DateTime<Local>) -> DateTime<Local> {
    let t = time_of(c);
    match c.every.as_str() {
        "hours" => from + ChronoDuration::hours(c.hours.max(1) as i64),
        "week" => {
            let want = Weekday::try_from(c.weekday.min(6)).unwrap_or(Weekday::Mon);
            (0..=7).filter_map(|i| from.date_naive().checked_add_days(chrono::Days::new(i))).filter(|d| d.weekday() == want).filter_map(|d| local(d, t)).find(|dt| *dt > from).unwrap_or(from + ChronoDuration::weeks(1))
        }
        "month" => {
            let (mut y, mut m) = (from.year(), from.month());
            for _ in 0..14 {
                let d = (c.day.max(1) as u32).min(days_in_month(y, m));
                if let Some(dt) = NaiveDate::from_ymd_opt(y, m, d).and_then(|d| local(d, t)) {
                    if dt > from {
                        return dt;
                    }
                }
                (y, m) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
            }
            from + ChronoDuration::days(30)
        }
        _ => (0..=1).filter_map(|i| from.date_naive().checked_add_days(chrono::Days::new(i))).filter_map(|d| local(d, t)).find(|dt| *dt > from).unwrap_or(from + ChronoDuration::days(1)),
    }
}

pub struct Scheduler {
    path: PathBuf,
    list: Mutex<Vec<Schedule>>,
    claimed: Mutex<HashMap<String, Instant>>,
}

impl Scheduler {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join("schedules.json");
        let list = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Self { path, list: Mutex::new(list), claimed: Mutex::default() }
    }

    fn save(&self, list: &[Schedule]) {
        let tmp = self.path.with_extension("tmp");
        let ok = serde_json::to_vec_pretty(list).map_err(|e| e.to_string()).and_then(|b| std::fs::write(&tmp, b).map_err(|e| e.to_string())).and_then(|_| std::fs::rename(&tmp, &self.path).map_err(|e| e.to_string()));
        if let Err(e) = ok {
            log::warn!("couldn't save schedules: {e}");
        }
    }

    fn changed(&self, app: &AppHandle, list: &[Schedule]) {
        self.save(list);
        let _ = SchedulesChanged { schedules: list.to_vec() }.emit(app);
    }

    pub fn all(&self) -> Vec<Schedule> {
        self.list.lock().unwrap().clone()
    }


    pub fn upsert(&self, app: &AppHandle, mut s: Schedule) -> AppResult<Schedule> {
        if s.name.trim().is_empty() {
            return Err(AppError::new("scheduler.no_name"));
        }
        let mut list = self.list.lock().unwrap();
        let now = Local::now();
        if s.id.is_empty() {
            s.id = format!("s{}", now.timestamp_millis());
            s.created_at = now.to_rfc3339();
            s.history.clear();
            s.last_run = None;
        } else if let Some(old) = list.iter().find(|x| x.id == s.id) {
            s.history = old.history.clone();
            s.last_run = old.last_run.clone();
            s.created_at = old.created_at.clone();
        }
        s.next_run = s.enabled.then(|| next_after(&s.cadence, now).to_rfc3339());
        match list.iter_mut().find(|x| x.id == s.id) {
            Some(x) => *x = s.clone(),
            None => list.push(s.clone()),
        }
        self.changed(app, &list);
        Ok(s)
    }

    pub fn delete(&self, app: &AppHandle, id: &str) {
        let mut list = self.list.lock().unwrap();
        list.retain(|s| s.id != id);
        self.changed(app, &list);
    }

    pub fn set_enabled(&self, app: &AppHandle, id: &str, on: bool) -> AppResult<Schedule> {
        let mut list = self.list.lock().unwrap();
        let s = list.iter_mut().find(|s| s.id == id).ok_or_else(|| AppError::new("scheduler.not_found"))?;
        s.enabled = on;
        s.next_run = on.then(|| next_after(&s.cadence, Local::now()).to_rfc3339());
        let out = s.clone();
        self.changed(app, &list);
        Ok(out)
    }


    pub fn claim_due(&self, now: DateTime<Local>) -> Vec<DueRun> {
        let list = self.list.lock().unwrap();
        let mut claimed = self.claimed.lock().unwrap();
        let mut out = vec![];
        for s in list.iter().filter(|s| s.enabled) {
            let Some(next) = s.next_run.as_deref().and_then(|n| DateTime::parse_from_rfc3339(n).ok()) else { continue };
            if next > now {
                continue;
            }
            if claimed.get(&s.id).is_some_and(|at| at.elapsed() < CLAIM_TIMEOUT) {
                continue;
            }
            claimed.insert(s.id.clone(), Instant::now());
            let trigger = if (now.fixed_offset() - next).num_seconds() > CATCH_UP_AFTER { "catch_up" } else { "schedule" };
            out.push(DueRun { schedule: s.clone(), trigger: trigger.into() });
        }
        out
    }

    pub fn any_due(&self, now: DateTime<Local>) -> bool {
        let list = self.list.lock().unwrap();
        let claimed = self.claimed.lock().unwrap();
        list.iter().filter(|s| s.enabled && !claimed.get(&s.id).is_some_and(|at| at.elapsed() < CLAIM_TIMEOUT)).any(|s| s.next_run.as_deref().and_then(|n| DateTime::parse_from_rfc3339(n).ok()).is_some_and(|n| n <= now))
    }


    pub fn claim_now(&self, id: &str) -> AppResult<DueRun> {
        let list = self.list.lock().unwrap();
        let s = list.iter().find(|s| s.id == id).ok_or_else(|| AppError::new("scheduler.not_found"))?;
        self.claimed.lock().unwrap().insert(id.to_string(), Instant::now());
        Ok(DueRun { schedule: s.clone(), trigger: "manual".into() })
    }


    pub fn record(&self, app: &AppHandle, id: &str, rec: RunRecord) -> AppResult<Schedule> {
        let mut list = self.list.lock().unwrap();
        self.claimed.lock().unwrap().remove(id);
        let s = list.iter_mut().find(|s| s.id == id).ok_or_else(|| AppError::new("scheduler.not_found"))?;
        s.last_run = Some(rec.at.clone());
        s.history.insert(0, rec);
        s.history.truncate(HISTORY);
        s.next_run = s.enabled.then(|| next_after(&s.cadence, Local::now()).to_rfc3339());
        let out = s.clone();
        self.changed(app, &list);
        Ok(out)
    }
}


pub fn spawn_timer(app: AppHandle) {
    use tauri::Manager;
    tauri::async_runtime::spawn(async move {

        tokio::time::sleep(Duration::from_secs(8)).await;
        loop {
            let st = app.state::<crate::state::AppState>();
            if st.scheduler.any_due(Local::now()) {
                let _ = ScheduleNudge {}.emit(&app);
            }
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(s: &str) -> DateTime<Local> {
        Local.from_local_datetime(&chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap()).earliest().unwrap()
    }
    fn cad(every: &str, at: &str, weekday: u8, day: u8, hours: u32) -> Cadence {
        Cadence { every: every.into(), hours, at: at.into(), weekday, day }
    }
    fn fmt(d: DateTime<Local>) -> String {
        d.format("%Y-%m-%d %H:%M").to_string()
    }

    #[test]
    fn daily_weekly_monthly_hourly() {

        assert_eq!(fmt(next_after(&cad("day", "09:00", 0, 1, 0), at("2026-10-05 08:00"))), "2026-10-05 09:00");
        assert_eq!(fmt(next_after(&cad("day", "09:00", 0, 1, 0), at("2026-10-05 09:00"))), "2026-10-06 09:00");
        assert_eq!(fmt(next_after(&cad("week", "07:30", 4, 1, 0), at("2026-10-05 12:00"))), "2026-10-09 07:30");
        assert_eq!(fmt(next_after(&cad("week", "07:30", 0, 1, 0), at("2026-10-05 12:00"))), "2026-10-12 07:30");
        assert_eq!(fmt(next_after(&cad("month", "10:00", 0, 31, 0), at("2026-11-05 12:00"))), "2026-11-30 10:00");
        assert_eq!(fmt(next_after(&cad("month", "10:00", 0, 1, 0), at("2026-12-05 12:00"))), "2027-01-01 10:00");
        assert_eq!(fmt(next_after(&cad("hours", "", 0, 1, 6), at("2026-10-05 22:00"))), "2026-10-06 04:00");
        assert_eq!(fmt(next_after(&cad("day", "bad", 0, 1, 0), at("2026-10-05 10:00"))), "2026-10-06 09:00");
    }

    #[test]
    fn claims_once_and_tells_catch_up() {
        let dir = std::env::temp_dir().join(format!("zit-sched-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let s = Scheduler::load(&dir);
        let now = at("2026-10-05 12:00");
        let mk = |id: &str, next: &str| Schedule {
            id: id.into(),
            name: id.into(),
            enabled: true,
            account_id: "a".into(),
            target: serde_json::Value::Null,
            action: QueueAction::Archive,
            cadence: cad("day", "09:00", 0, 1, 0),
            mode: "review".into(),
            created_at: String::new(),
            last_run: None,
            next_run: Some(at(next).to_rfc3339()),
            history: vec![],
        };
        *s.list.lock().unwrap() = vec![mk("missed", "2026-10-04 09:00"), mk("now", "2026-10-05 11:58"), mk("later", "2026-10-06 09:00")];
        let due = s.claim_due(now);
        assert_eq!(due.iter().map(|d| (d.schedule.id.as_str(), d.trigger.as_str())).collect::<Vec<_>>(), vec![("missed", "catch_up"), ("now", "schedule")]);
        assert!(s.claim_due(now).is_empty(), "claimed runs aren't handed out twice");
        assert!(!s.any_due(now));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
