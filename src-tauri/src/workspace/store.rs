use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AutoMode {

    #[default]
    Manual,

    Interval,

    Idle,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,

    pub push_repo: Option<String>,


    pub reference_repo: Option<String>,

    pub watch: bool,

    pub interval_secs: u32,
    pub auto: AutoMode,
    pub auto_minutes: u32,

    pub auto_push: bool,

    pub message_template: String,
    pub added_at: String,
}

pub const DEFAULT_TEMPLATE: &str = "Auto-save: {summary}";

impl Workspace {
    pub fn new(id: String, name: String, path: String) -> Self {
        Self {
            id,
            name,
            path,
            push_repo: None,
            reference_repo: None,
            watch: true,
            interval_secs: 2,
            auto: AutoMode::Manual,
            auto_minutes: 10,
            auto_push: false,
            message_template: DEFAULT_TEMPLATE.into(),
            added_at: chrono::Utc::now().to_rfc3339(),
        }
    }


    pub fn distinct_reference(&self) -> Option<&str> {
        self.reference_repo.as_deref().filter(|r| !self.push_repo.as_deref().is_some_and(|p| p.eq_ignore_ascii_case(r)))
    }


    pub fn normalized(mut self) -> Self {
        self.interval_secs = self.interval_secs.clamp(1, 300);
        self.auto_minutes = self.auto_minutes.clamp(1, 24 * 60);
        if self.message_template.trim().is_empty() {
            self.message_template = DEFAULT_TEMPLATE.into();
        }
        let tidy = |r: Option<String>| r.and_then(|s| crate::workspace::git::parse_slug(&s));
        self.push_repo = tidy(self.push_repo.take());
        self.reference_repo = tidy(self.reference_repo.take());
        self
    }
}


pub fn render_template(template: &str, summary: &str, count: usize) -> String {
    let time = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
    template.replace("{summary}", summary).replace("{count}", &count.to_string()).replace("{time}", &time)
}

pub struct WorkspaceStore {
    path: PathBuf,
    items: Vec<Workspace>,
}

impl WorkspaceStore {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join("workspaces.json");
        let items = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Self { path, items }
    }

    fn save(&self) -> AppResult<()> {
        let bytes = serde_json::to_vec_pretty(&self.items)?;
        crate::platform::write_atomic(&self.path, &bytes)?;
        Ok(())
    }

    pub fn all(&self) -> &[Workspace] {
        &self.items
    }

    pub fn get(&self, id: &str) -> AppResult<Workspace> {
        self.items.iter().find(|w| w.id == id).cloned().ok_or_else(|| AppError::new("workspace.unknown"))
    }

    pub fn by_path(&self, path: &str) -> Option<&Workspace> {
        let norm = |p: &str| p.trim_end_matches(['/', '\\']).to_string();
        self.items.iter().find(|w| norm(&w.path) == norm(path))
    }

    pub fn upsert(&mut self, ws: Workspace) -> AppResult<Workspace> {
        let ws = ws.normalized();
        match self.items.iter_mut().find(|w| w.id == ws.id) {
            Some(w) => *w = ws.clone(),
            None => self.items.push(ws.clone()),
        }
        self.save()?;
        Ok(ws)
    }

    pub fn remove(&mut self, id: &str) -> AppResult<()> {
        self.items.retain(|w| w.id != id);
        self.save()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_settings_and_reference() {
        let mut w = Workspace::new("1".into(), "n".into(), "/p".into());
        w.interval_secs = 0;
        w.auto_minutes = 99_999;
        w.message_template = " ".into();
        w.push_repo = Some("https://github.com/o/r.git".into());
        w.reference_repo = Some("O/R".into());
        let w = w.normalized();
        assert_eq!((w.interval_secs, w.auto_minutes), (1, 1440));
        assert_eq!(w.message_template, DEFAULT_TEMPLATE);
        assert_eq!(w.push_repo.as_deref(), Some("o/r"));
        assert_eq!(w.distinct_reference(), None, "same repo (case-insensitive) = just one");
        let w2 = Workspace { reference_repo: Some("up/r".into()), ..w };
        assert_eq!(w2.distinct_reference(), Some("up/r"));
        assert!(render_template("Auto: {summary} ({count})", "Update a.txt", 1).starts_with("Auto: Update a.txt (1)"));
    }
}
