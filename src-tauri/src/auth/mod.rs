pub mod device;
pub mod store;

pub use store::{Account, AccountStore, AuthMethod};


pub const REQUESTED_SCOPES: &[&str] = &[
    "repo",
    "delete_repo",
    "workflow",
    "read:org",
    "read:user",
    "notifications",
    "gist",
    "admin:repo_hook",
];
