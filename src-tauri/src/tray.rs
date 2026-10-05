use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime, Window, WindowEvent, Wry};

use crate::error::{AppError, AppResult};

pub const HIDDEN_ARG: &str = "--hidden";

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub struct TrayPrefs {

    pub close_to_tray: bool,

    pub start_hidden: bool,
}

impl Default for TrayPrefs {
    fn default() -> Self {
        Self { close_to_tray: true, start_hidden: true }
    }
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TrayLabels {
    pub show: String,
    pub hide: String,
    pub quit: String,
    pub tooltip: String,

    pub hidden_title: String,
    pub hidden_body: String,
}

impl Default for TrayLabels {
    fn default() -> Self {
        Self {
            show: "Show ZIT-Suite".into(),
            hide: "Hide ZIT-Suite".into(),
            quit: "Quit ZIT-Suite".into(),
            tooltip: "ZIT-Suite".into(),
            hidden_title: "ZIT-Suite is still running".into(),
            hidden_body: "Schedules and automatic uploads keep going. Click the tray icon to open it again.".into(),
        }
    }
}

pub struct Tray {
    path: PathBuf,
    prefs: Mutex<TrayPrefs>,
    labels: Mutex<TrayLabels>,
    toggle: Mutex<Option<MenuItem<Wry>>>,
    status: Mutex<Option<MenuItem<Wry>>>,
    quit: Mutex<Option<MenuItem<Wry>>>,

    quitting: AtomicBool,
    told: AtomicBool,
}

impl Tray {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join("tray.json");
        let prefs = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Self { path, prefs: Mutex::new(prefs), labels: Mutex::default(), toggle: Mutex::default(), status: Mutex::default(), quit: Mutex::default(), quitting: AtomicBool::new(false), told: AtomicBool::new(false) }
    }

    pub fn prefs(&self) -> TrayPrefs {
        self.prefs.lock().unwrap().clone()
    }

    pub fn set_prefs(&self, p: TrayPrefs) -> AppResult<()> {
        std::fs::write(&self.path, serde_json::to_vec_pretty(&p)?)?;
        *self.prefs.lock().unwrap() = p;
        Ok(())
    }
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<tauri::WebviewWindow<R>> {
    app.get_webview_window("main")
}

pub fn show(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    set_toggle(app, true);
}

fn toggle(app: &AppHandle) {
    match main_window(app) {
        Some(w) if w.is_visible().unwrap_or(false) => {
            let _ = w.hide();
            set_toggle(app, false);
        }
        _ => show(app),
    }
}


fn refresh_toggle(app: &AppHandle) {
    let visible = main_window(app).and_then(|w| w.is_visible().ok()).unwrap_or(false);
    set_toggle(app, visible);
}


fn set_toggle(app: &AppHandle, visible: bool) {
    let st = app.state::<crate::state::AppState>();
    let labels = st.tray.labels.lock().unwrap().clone();
    let item = st.tray.toggle.lock().unwrap().clone();
    if let Some(item) = item {
        let _ = item.set_text(if visible { labels.hide } else { labels.show });
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let labels = TrayLabels::default();
    let toggle_item = MenuItem::with_id(app, "toggle", &labels.hide, true, None::<&str>)?;
    let status_item = MenuItem::with_id(app, "status", "", false, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", &labels.quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle_item, &status_item, &PredefinedMenuItem::separator(app)?, &quit_item])?;
    let mut builder = TrayIconBuilder::with_id("main").tooltip(&labels.tooltip).menu(&menu).show_menu_on_left_click(false);
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder
        .on_menu_event(|app, e| match e.id.as_ref() {
            "toggle" => toggle(app),
            "quit" => {
                app.state::<crate::state::AppState>().tray.quitting.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                toggle(tray.app_handle());
            }
        })
        .build(app)?;
    let st = app.state::<crate::state::AppState>();
    *st.tray.toggle.lock().unwrap() = Some(toggle_item);
    *st.tray.status.lock().unwrap() = Some(status_item);
    *st.tray.quit.lock().unwrap() = Some(quit_item);
    Ok(())
}


pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        let app = window.app_handle();
        let st = app.state::<crate::state::AppState>();
        if st.tray.quitting.load(Ordering::SeqCst) || !st.tray.prefs().close_to_tray {
            return;
        }
        api.prevent_close();
        let _ = window.hide();
        set_toggle(app, false);
        if !st.tray.told.swap(true, Ordering::SeqCst) {
            use tauri_plugin_notification::NotificationExt;
            let l = st.tray.labels.lock().unwrap().clone();
            let _ = app.notification().builder().title(l.hidden_title).body(l.hidden_body).show();
        }
    }
}


pub fn hide_on_start(app: &AppHandle) {
    let st = app.state::<crate::state::AppState>();
    let hidden = std::env::args().any(|a| a == HIDDEN_ARG) && st.tray.prefs().start_hidden;
    if hidden {
        if let Some(w) = main_window(app) {
            let _ = w.hide();
        }
    }
    set_toggle(app, !hidden);
}


use crate::state::AppState;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub fn tray_get_prefs(state: State<'_, AppState>) -> TrayPrefs {
    state.tray.prefs()
}

#[tauri::command]
#[specta::specta]
pub fn tray_set_prefs(state: State<'_, AppState>, prefs: TrayPrefs) -> AppResult<()> {
    state.tray.set_prefs(prefs)
}


#[tauri::command]
#[specta::specta]
pub fn tray_set_labels(app: AppHandle, state: State<'_, AppState>, labels: TrayLabels) {
    if let Some(t) = app.tray_by_id("main") {
        let _ = t.set_tooltip(Some(&labels.tooltip));
    }
    if let Some(q) = state.tray.quit.lock().unwrap().as_ref() {
        let _ = q.set_text(&labels.quit);
    }
    *state.tray.labels.lock().unwrap() = labels;
    refresh_toggle(&app);
}


#[tauri::command]
#[specta::specta]
pub fn tray_set_status(state: State<'_, AppState>, text: String) {
    if let Some(s) = state.tray.status.lock().unwrap().as_ref() {
        let _ = s.set_text(if text.is_empty() { " " } else { &text });
    }
}

#[tauri::command]
#[specta::specta]
pub fn autostart_get(app: AppHandle) -> AppResult<bool> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| AppError::new("tray.autostart").detail(e.to_string()))
}

#[tauri::command]
#[specta::specta]
pub fn autostart_set(app: AppHandle, enabled: bool) -> AppResult<()> {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    let r = if enabled { m.enable() } else { m.disable() };
    r.map_err(|e| AppError::new("tray.autostart").detail(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefs_persist() {
        let dir = std::env::temp_dir().join(format!("zit-tray-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let t = Tray::load(&dir);
        assert_eq!(t.prefs(), TrayPrefs::default());
        t.set_prefs(TrayPrefs { close_to_tray: false, start_hidden: false }).unwrap();
        assert!(!Tray::load(&dir).prefs().close_to_tray);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
