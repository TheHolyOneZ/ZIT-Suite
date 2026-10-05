use crate::error::AppResult;


#[tauri::command]
#[specta::specta]
pub fn export_text_file(path: String, contents: String) -> AppResult<()> {

    std::fs::write(&path, contents)?;
    Ok(())
}


#[tauri::command]
#[specta::specta]
pub fn read_secret_file(path: String) -> AppResult<String> {
    use crate::error::AppError;
    let meta = std::fs::metadata(&path)?;
    if meta.len() as usize > crate::github::secrets::MAX_SECRET_BYTES {
        return Err(AppError::new("secrets.too_large"));
    }
    String::from_utf8(std::fs::read(&path)?).map_err(|_| AppError::new("secrets.not_text"))
}


#[tauri::command]
#[specta::specta]
pub fn read_text_file(path: String) -> AppResult<String> {
    use crate::error::AppError;
    if std::fs::metadata(&path)?.len() > 1024 * 1024 {
        return Err(AppError::new("files.too_large"));
    }
    String::from_utf8(std::fs::read(&path)?).map_err(|_| AppError::new("files.not_text"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str, bytes: &[u8]) -> String {
        let p = std::env::temp_dir().join(format!("zit-{}-{name}", std::process::id()));
        std::fs::write(&p, bytes).unwrap();
        p.to_string_lossy().into_owned()
    }

    #[test]
    fn reads_small_text_files_only() {
        let ok = tmp("key.pem", b"-----BEGIN KEY-----\nabc\n-----END KEY-----\n");
        assert_eq!(read_secret_file(ok.clone()).unwrap().lines().count(), 3);
        let big = tmp("big", &vec![b'a'; crate::github::secrets::MAX_SECRET_BYTES + 1]);
        assert_eq!(read_secret_file(big.clone()).unwrap_err().code, "secrets.too_large");
        let bin = tmp("bin", &[0xff, 0xfe, 0x00, 0x80]);
        assert_eq!(read_secret_file(bin.clone()).unwrap_err().code, "secrets.not_text");
        for p in [ok, big, bin] {
            let _ = std::fs::remove_file(p);
        }
    }
}
