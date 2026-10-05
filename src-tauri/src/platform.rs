use std::fs;
use std::io;
use std::path::Path;


pub fn init() {
    #[cfg(target_os = "linux")]
    linux::init();
    #[cfg(windows)]
    windows::init();
}


pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    restrict_permissions(&tmp);

    let mut tries = 0;
    loop {
        match fs::rename(&tmp, path) {
            Err(e) if cfg!(windows) && e.kind() == io::ErrorKind::PermissionDenied && tries < 5 => {
                tries += 1;
                std::thread::sleep(std::time::Duration::from_millis(40 * tries));
            }
            r => return r,
        }
    }
}


#[allow(unused_variables)]
pub fn restrict_permissions(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
}


const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1",
    "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];


pub fn sanitize_file_name(name: &str) -> Option<String> {
    let mut s: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();

    while s.ends_with('.') || s.ends_with(' ') {
        s.pop();
    }
    if s.is_empty() || s == "." || s == ".." {
        return None;
    }
    let stem = s.split('.').next().unwrap_or("").to_ascii_uppercase();
    if RESERVED.contains(&stem.as_str()) {
        s.insert(0, '_');
    }

    if s.len() > 200 {
        let mut cut = 200;
        while !s.is_char_boundary(cut) {
            cut -= 1;
        }
        s.truncate(cut);
    }
    Some(s)
}


pub fn keyring_hint() -> &'static str {
    #[cfg(target_os = "linux")]
    return "No Secret Service provider is running. Install/unlock GNOME Keyring or KWallet (with the Secret Service API enabled).";
    #[cfg(windows)]
    return "Windows Credential Manager rejected the request.";
    #[cfg(target_os = "macos")]
    return "The macOS Keychain rejected the request.";
    #[allow(unreachable_code)]
    ""
}


pub fn find_program(prog: &str) -> Option<std::path::PathBuf> {
    let p = Path::new(prog);
    if p.is_absolute() {
        return p.is_file().then(|| p.to_path_buf());
    }
    let exts: &[&str] = if cfg!(windows) { &["", ".exe", ".cmd", ".bat"] } else { &[""] };
    std::env::split_paths(&std::env::var_os("PATH")?).find_map(|dir| exts.iter().map(|e| dir.join(format!("{prog}{e}"))).find(|f| present(f)))
}


fn present(f: &Path) -> bool {
    f.is_file() || (cfg!(windows) && f.extension().is_some() && fs::symlink_metadata(f).is_ok_and(|m| !m.is_dir()))
}


fn spawn_first(dir: &Path, candidates: &[(String, Vec<String>, bool)]) -> io::Result<String> {
    use std::process::{Command, Stdio};
    for (prog, args, console) in candidates {
        let Some(exe) = find_program(prog) else { continue };


        let mut cmd = Command::new(&exe);
        cmd.args(args).current_dir(dir);
        if !(cfg!(windows) && *console) {
            cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            let script = exe.extension().is_some_and(|e| e.eq_ignore_ascii_case("cmd") || e.eq_ignore_ascii_case("bat"));
            if *console {
                cmd.creation_flags(CREATE_NEW_CONSOLE);
            } else if script {
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
        }
        cmd.spawn()?;
        return Ok(prog.clone());
    }
    Err(io::Error::new(io::ErrorKind::NotFound, "no program found"))
}

fn args(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
}


pub fn open_terminal(dir: &Path) -> io::Result<String> {
    let d = dir.to_string_lossy().into_owned();
    #[allow(unused_mut)]
    let mut list: Vec<(String, Vec<String>, bool)> = Vec::new();
    #[cfg(target_os = "linux")]
    {

        if let Ok(t) = std::env::var("TERMINAL") {
            list.push((t, vec![], false));
        }
        list.extend([
            ("konsole".into(), args(&["--workdir", &d]), false),
            ("gnome-terminal".into(), vec![format!("--working-directory={d}")], false),
            ("kgx".into(), vec![format!("--working-directory={d}")], false),
            ("xfce4-terminal".into(), vec![format!("--working-directory={d}")], false),
            ("kitty".into(), args(&["--directory", &d]), false),
            ("alacritty".into(), args(&["--working-directory", &d]), false),
            ("wezterm".into(), args(&["start", "--cwd", &d]), false),
            ("foot".into(), args(&["-D", &d]), false),
            ("x-terminal-emulator".into(), vec![], false),
            ("xterm".into(), vec![], false),
        ]);
    }
    #[cfg(windows)]
    list.extend([("wt".into(), args(&["-d", &d]), false), ("pwsh".into(), args(&["-NoExit"]), true), ("powershell".into(), args(&["-NoExit"]), true), ("cmd".into(), args(&["/K"]), true)]);
    #[cfg(target_os = "macos")]
    list.push(("open".into(), args(&["-a", "Terminal", &d]), false));
    spawn_first(dir, &list)
}


pub fn open_editor(dir: &Path) -> io::Result<String> {
    let d = dir.to_string_lossy().into_owned();
    let list: Vec<(String, Vec<String>, bool)> = ["code", "codium", "zed", "zeditor", "subl"].iter().map(|p| (p.to_string(), vec![d.clone()], false)).collect();
    spawn_first(dir, &list)
}

#[cfg(target_os = "linux")]
mod linux {
    pub fn init() {


        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
}

#[cfg(windows)]
mod windows {
    pub fn init() {


    }
}

#[cfg(test)]
mod tests {
    use super::sanitize_file_name as s;

    #[test]
    fn finds_programs_on_path() {
        let found = super::find_program(if cfg!(windows) { "cmd" } else { "sh" });
        assert!(found.is_some());
        assert!(super::find_program("zit-no-such-program-xyz").is_none());
    }

    #[test]
    fn keeps_normal_names() {
        assert_eq!(s("app-v1.2.0-x86_64.AppImage").as_deref(), Some("app-v1.2.0-x86_64.AppImage"));
    }

    #[test]
    fn replaces_windows_invalid_chars() {
        assert_eq!(s(r#"a<b>c:d"e|f?g*h/i\j"#).as_deref(), Some("a_b_c_d_e_f_g_h_i_j"));
    }

    #[test]
    fn handles_reserved_and_trailing() {
        assert_eq!(s("CON").as_deref(), Some("_CON"));
        assert_eq!(s("nul.txt").as_deref(), Some("_nul.txt"));
        assert_eq!(s("name. ").as_deref(), Some("name"));
        assert_eq!(s(".."), None);
        assert_eq!(s(""), None);
    }

    #[test]
    fn write_atomic_replaces_existing() {
        let dir = std::env::temp_dir().join(format!("zit-atomic-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("f.json");
        super::write_atomic(&p, b"one").unwrap();
        super::write_atomic(&p, b"two").unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"two");
        assert!(!p.with_extension("tmp").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
