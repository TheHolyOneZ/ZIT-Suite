use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

use super::client::GitHubClient;
use super::files::{self, TreeItem};
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub struct Dep {
    pub name: String,

    pub spec: String,

    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Manifest {
    pub path: String,

    pub ecosystem: String,


    pub manager: String,

    pub manager_from: String,
    pub deps: Vec<Dep>,

    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RepoDeps {
    pub repo: String,
    pub branch: String,
    pub manifests: Vec<Manifest>,

    pub truncated: bool,
    pub error: Option<AppError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DepsTarget {
    pub repo: String,
    pub branch: String,
}

const MAX_MANIFESTS: usize = 40;

const SKIP: &[&str] = &["node_modules", "vendor", "target", "dist", "build", "out", ".git", "third_party", "third-party", "bower_components", ".venv", "venv", "site-packages", ".next", ".nuxt"];


pub fn manifest_kind(path: &str) -> Option<&'static str> {
    if path.split('/').any(|seg| SKIP.contains(&seg)) {
        return None;
    }
    let name = path.rsplit('/').next().unwrap_or(path);
    Some(match name {
        "package.json" => "npm",
        "Cargo.toml" => "cargo",
        "pyproject.toml" => "pypi",
        "go.mod" => "go",
        "pom.xml" => "maven",
        n if n.starts_with("requirements") && n.ends_with(".txt") => "pypi",
        _ => return None,
    })
}

fn dir_of(path: &str) -> &str {
    path.rsplit_once('/').map(|(d, _)| d).unwrap_or("")
}


const LOCKFILES: &[(&str, &str, &str)] = &[
    ("npm", "pnpm-lock.yaml", "pnpm"),
    ("npm", "pnpm-workspace.yaml", "pnpm"),
    ("npm", "bun.lockb", "bun"),
    ("npm", "bun.lock", "bun"),
    ("npm", "yarn.lock", "yarn"),
    ("npm", ".yarnrc.yml", "yarn"),
    ("npm", "deno.lock", "deno"),
    ("npm", "package-lock.json", "npm"),
    ("npm", "npm-shrinkwrap.json", "npm"),
    ("pypi", "poetry.lock", "poetry"),
    ("pypi", "uv.lock", "uv"),
    ("pypi", "pdm.lock", "pdm"),
    ("pypi", "Pipfile.lock", "pipenv"),
    ("pypi", "Pipfile", "pipenv"),
    ("maven", "build.gradle", "gradle"),
    ("maven", "build.gradle.kts", "gradle"),
];


pub fn default_manager(ecosystem: &str) -> &'static str {
    match ecosystem {
        "npm" => "npm",
        "pypi" => "pip",
        "cargo" => "cargo",
        "go" => "go",
        _ => "maven",
    }
}


fn lockfile_manager(items: &[TreeItem], manifest: &str, ecosystem: &str) -> Option<&'static str> {
    let paths: std::collections::HashSet<&str> = items.iter().map(|i| i.path.as_str()).collect();
    let mut dir = dir_of(manifest);
    loop {
        for (eco, file, tool) in LOCKFILES {
            if *eco == ecosystem && paths.contains(if dir.is_empty() { (*file).to_string() } else { format!("{dir}/{file}") }.as_str()) {
                return Some(tool);
            }
        }
        if dir.is_empty() {
            return None;
        }
        dir = dir_of(dir);
    }
}


pub fn declared_manager(ecosystem: &str, path: &str, text: &str) -> Option<String> {
    match ecosystem {
        "npm" => {
            let v: Value = serde_json::from_str(text).ok()?;
            let pm = v["packageManager"].as_str()?;
            let tool = pm.split('@').next()?.trim().to_lowercase();
            ["pnpm", "yarn", "npm", "bun", "deno"].contains(&tool.as_str()).then_some(tool)
        }
        "pypi" if path.ends_with("pyproject.toml") => {
            let v: toml::Table = text.parse().ok()?;
            let tool = v.get("tool")?.as_table()?;
            ["poetry", "uv", "pdm", "hatch", "flit", "pixi"].into_iter().find(|t| tool.contains_key(*t)).map(str::to_string)
        }
        _ => None,
    }
}


pub fn manager_of(items: &[TreeItem], manifest: &str, ecosystem: &str, text: Option<&str>) -> (String, String) {
    if let Some(m) = text.and_then(|t| declared_manager(ecosystem, manifest, t)) {
        return (m, "declared".into());
    }
    if let Some(m) = lockfile_manager(items, manifest, ecosystem) {
        return (m.into(), "lockfile".into());
    }
    (default_manager(ecosystem).into(), "default".into())
}

pub fn parse(ecosystem: &str, path: &str, text: &str) -> Result<Vec<Dep>, String> {
    let name = path.rsplit('/').next().unwrap_or(path);
    match (ecosystem, name) {
        ("npm", _) => parse_package_json(text),
        ("cargo", _) => parse_cargo(text),
        ("pypi", "pyproject.toml") => parse_pyproject(text),
        ("pypi", _) => Ok(parse_requirements(text)),
        ("go", _) => Ok(parse_go_mod(text)),
        ("maven", _) => Ok(parse_pom(text)),
        _ => Ok(vec![]),
    }
}

fn dep(name: &str, spec: &str, kind: &str) -> Dep {
    Dep { name: name.trim().to_string(), spec: spec.trim().to_string(), kind: kind.to_string() }
}

pub fn parse_package_json(text: &str) -> Result<Vec<Dep>, String> {
    let v: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for (section, kind) in [("dependencies", "normal"), ("devDependencies", "dev"), ("peerDependencies", "peer"), ("optionalDependencies", "optional")] {
        for (name, spec) in v[section].as_object().into_iter().flatten() {
            let spec = spec.as_str().unwrap_or("");

            let spec = if spec.starts_with("workspace:") { "workspace" } else if spec.starts_with("file:") || spec.starts_with("link:") { "path" } else { spec };
            out.push(dep(name, spec, kind));
        }
    }
    Ok(out)
}

fn cargo_entry(name: &str, v: &toml::Value, kind: &str) -> Dep {
    match v {
        toml::Value::String(s) => dep(name, s, kind),
        toml::Value::Table(t) => {
            let real = t.get("package").and_then(|p| p.as_str()).unwrap_or(name);
            let spec = if t.get("workspace").and_then(|w| w.as_bool()) == Some(true) {
                "workspace".to_string()
            } else if let Some(v) = t.get("version").and_then(|v| v.as_str()) {
                v.to_string()
            } else if t.contains_key("path") {
                "path".to_string()
            } else if t.contains_key("git") {
                "git".to_string()
            } else {
                String::new()
            };
            dep(real, &spec, kind)
        }
        _ => dep(name, "", kind),
    }
}

pub fn parse_cargo(text: &str) -> Result<Vec<Dep>, String> {
    let v: toml::Table = text.parse().map_err(|e: toml::de::Error| e.message().to_string())?;
    let mut out = vec![];
    let sections = [("dependencies", "normal"), ("dev-dependencies", "dev"), ("build-dependencies", "build")];
    let mut add = |t: &toml::Table| {
        for (section, kind) in sections {
            for (name, val) in t.get(section).and_then(|s| s.as_table()).into_iter().flatten() {
                out.push(cargo_entry(name, val, kind));
            }
        }
    };
    add(&v);
    for (_, target) in v.get("target").and_then(|t| t.as_table()).into_iter().flatten() {
        if let Some(t) = target.as_table() {
            add(t);
        }
    }
    for (name, val) in v.get("workspace").and_then(|w| w.get("dependencies")).and_then(|d| d.as_table()).into_iter().flatten() {
        out.push(cargo_entry(name, val, "workspace"));
    }
    Ok(out)
}


fn pep508(line: &str) -> Option<(String, String)> {
    let line = line.split(';').next()?.trim();
    let end = line.find(|c: char| !(c.is_ascii_alphanumeric() || "-_.".contains(c))).unwrap_or(line.len());
    let name = &line[..end];
    if name.is_empty() {
        return None;
    }
    let mut rest = line[end..].trim();
    if rest.starts_with('[') {
        rest = rest.split_once(']').map(|(_, r)| r.trim()).unwrap_or("");
    }
    let rest = rest.trim_start_matches('(').trim_end_matches(')').trim();
    if rest.starts_with('@') {
        return Some((name.to_string(), "git".to_string()));
    }
    Some((name.to_string(), rest.to_string()))
}

pub fn parse_requirements(text: &str) -> Vec<Dep> {
    text.lines()
        .map(|l| l.split(" #").next().unwrap_or("").trim())
        .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with('-') && !l.contains("://"))
        .filter_map(pep508)
        .map(|(n, s)| dep(&n, &s, "normal"))
        .collect()
}

pub fn parse_pyproject(text: &str) -> Result<Vec<Dep>, String> {
    let v: toml::Table = text.parse().map_err(|e: toml::de::Error| e.message().to_string())?;
    let mut out = vec![];
    let list = |val: Option<&toml::Value>, kind: &str, out: &mut Vec<Dep>| {
        for s in val.and_then(|x| x.as_array()).into_iter().flatten().filter_map(|x| x.as_str()) {
            if let Some((n, sp)) = pep508(s) {
                out.push(dep(&n, &sp, kind));
            }
        }
    };
    let project = v.get("project");
    list(project.and_then(|p| p.get("dependencies")), "normal", &mut out);
    for (_, extra) in project.and_then(|p| p.get("optional-dependencies")).and_then(|x| x.as_table()).into_iter().flatten() {
        list(Some(extra), "optional", &mut out);
    }
    for (_, group) in v.get("dependency-groups").and_then(|x| x.as_table()).into_iter().flatten() {
        list(Some(group), "dev", &mut out);
    }
    let poetry = v.get("tool").and_then(|t| t.get("poetry"));
    let table = |val: Option<&toml::Value>, kind: &str, out: &mut Vec<Dep>| {
        for (name, spec) in val.and_then(|x| x.as_table()).into_iter().flatten() {
            if name == "python" {
                continue;
            }
            let s = match spec {
                toml::Value::String(s) => s.clone(),
                toml::Value::Table(t) if t.contains_key("path") => "path".into(),
                toml::Value::Table(t) if t.contains_key("git") => "git".into(),
                toml::Value::Table(t) => t.get("version").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                _ => String::new(),
            };
            out.push(dep(name, &s, kind));
        }
    };
    table(poetry.and_then(|p| p.get("dependencies")), "normal", &mut out);
    table(poetry.and_then(|p| p.get("dev-dependencies")), "dev", &mut out);
    for (_, g) in poetry.and_then(|p| p.get("group")).and_then(|x| x.as_table()).into_iter().flatten() {
        table(g.get("dependencies"), "dev", &mut out);
    }
    Ok(out)
}

pub fn parse_go_mod(text: &str) -> Vec<Dep> {
    let mut out = vec![];
    let mut block = false;
    for raw in text.lines() {
        let indirect = raw.contains("// indirect");
        let line = raw.split("//").next().unwrap_or("").trim();
        let entry = if block {
            if line == ")" {
                block = false;
                continue;
            }
            line
        } else if line == "require (" {
            block = true;
            continue;
        } else if let Some(rest) = line.strip_prefix("require ") {
            rest.trim()
        } else {
            continue;
        };
        let mut parts = entry.split_whitespace();
        if let (Some(name), Some(ver)) = (parts.next(), parts.next()) {
            out.push(dep(name, ver, if indirect { "indirect" } else { "normal" }));
        }
    }
    out
}

fn xml_tag<'a>(s: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{tag}>");
    let start = s.find(&open)? + open.len();
    let end = s[start..].find(&format!("</{tag}>"))? + start;
    Some(s[start..end].trim())
}

pub fn parse_pom(text: &str) -> Vec<Dep> {

    let props: HashMap<String, String> = xml_tag(text, "properties")
        .map(|p| {
            p.split('<')
                .filter_map(|chunk| {
                    let (tag, val) = chunk.split_once('>')?;
                    (!tag.starts_with('/') && !tag.is_empty() && !tag.ends_with('/')).then(|| (tag.to_string(), val.trim().to_string()))
                })
                .collect()
        })
        .unwrap_or_default();
    let mut out = vec![];
    for block in text.split("<dependency>").skip(1) {
        let Some(body) = block.split("</dependency>").next() else { continue };
        let (Some(g), Some(a)) = (xml_tag(body, "groupId"), xml_tag(body, "artifactId")) else { continue };
        let mut version = xml_tag(body, "version").unwrap_or("").to_string();
        if let Some(key) = version.strip_prefix("${").and_then(|v| v.strip_suffix('}')) {
            version = props.get(key).cloned().unwrap_or(version);
        }
        let kind = match xml_tag(body, "scope") {
            Some("test") => "dev",
            Some("provided") | Some("runtime") | Some("compile") | None => "normal",
            Some(_) => "normal",
        };
        out.push(dep(&format!("{g}:{a}"), &version, kind));
    }
    out
}


pub async fn scan(c: &GitHubClient, target: &DepsTarget, fresh: bool) -> RepoDeps {
    let mut out = RepoDeps { repo: target.repo.clone(), branch: target.branch.clone(), manifests: vec![], truncated: false, error: None };
    let tree = match files::tree(c, &target.repo, &target.branch, fresh).await {
        Ok(t) => t,
        Err(e) => {
            out.error = Some(e);
            return out;
        }
    };
    let found: Vec<(&TreeItem, &'static str)> = tree.items.iter().filter(|i| i.kind == "blob").filter_map(|i| manifest_kind(&i.path).map(|k| (i, k))).collect();
    out.truncated = found.len() > MAX_MANIFESTS || tree.truncated;
    for (item, eco) in found.into_iter().take(MAX_MANIFESTS) {
        let (manager, from) = manager_of(&tree.items, &item.path, eco, None);
        let mut m = Manifest { path: item.path.clone(), ecosystem: eco.to_string(), manager, manager_from: from, deps: vec![], error: None };
        match files::blob(c, &target.repo, &item.sha).await {
            Ok(b) => match b.text {
                Some(text) => {
                    (m.manager, m.manager_from) = manager_of(&tree.items, &item.path, eco, Some(&text));
                    match parse(eco, &item.path, &text) {
                        Ok(d) => m.deps = d,
                        Err(e) => m.error = Some(e),
                    }
                }
                None => m.error = Some("not text".into()),
            },
            Err(e) => m.error = Some(e.code),
        }
        out.manifests.push(m);
    }
    out
}


#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
pub struct PackageRef {
    pub ecosystem: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Latest {
    pub ecosystem: String,
    pub name: String,
    pub version: Option<String>,

    pub error: Option<String>,
}

const TTL: Duration = Duration::from_secs(6 * 3600);

fn cache() -> &'static Mutex<HashMap<PackageRef, (Instant, Latest)>> {
    static C: OnceLock<Mutex<HashMap<PackageRef, (Instant, Latest)>>> = OnceLock::new();
    C.get_or_init(Default::default)
}

fn registry_client() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("ZIT-Suite dependency scanner (https://github.com/TheHolyOneZ)")
            .timeout(Duration::from_secs(20))
            .build()
            .expect("http client")
    })
}

fn pct(s: &str) -> String {
    s.bytes()
        .map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") })
        .collect()
}


pub fn go_escape(module: &str) -> String {
    module.chars().map(|c| if c.is_ascii_uppercase() { format!("!{}", c.to_ascii_lowercase()) } else { c.to_string() }).collect()
}


pub fn registry_url(p: &PackageRef) -> Option<(String, &'static str)> {
    Some(match p.ecosystem.as_str() {
        "npm" => (format!("https://registry.npmjs.org/-/package/{}/dist-tags", p.name.replace('/', "%2f")), "/latest"),
        "cargo" => (format!("https://crates.io/api/v1/crates/{}", pct(&p.name)), "/crate/max_stable_version"),
        "pypi" => (format!("https://pypi.org/pypi/{}/json", pct(&p.name)), "/info/version"),
        "go" => (format!("https://proxy.golang.org/{}/@latest", go_escape(&p.name)), "/Version"),
        "maven" => {
            let (g, a) = p.name.split_once(':')?;
            (format!("https://repo1.maven.org/maven2/{}/{}/maven-metadata.xml", g.split('.').map(pct).collect::<Vec<_>>().join("/"), pct(a)), "xml:release")
        }
        _ => return None,
    })
}

async fn lookup(p: PackageRef) -> Latest {
    if let Some((at, hit)) = cache().lock().unwrap().get(&p) {
        if at.elapsed() < TTL {
            return hit.clone();
        }
    }
    let mut out = Latest { ecosystem: p.ecosystem.clone(), name: p.name.clone(), version: None, error: None };
    match registry_url(&p) {
        None => out.error = Some("unsupported".into()),
        Some((url, pointer)) => match registry_client().get(&url).send().await {
            Ok(r) if r.status().is_success() => {
                if let Some(tag) = pointer.strip_prefix("xml:") {
                    let text = r.text().await.unwrap_or_default();
                    out.version = xml_tag(&text, tag).or_else(|| xml_tag(&text, "latest")).filter(|s| !s.is_empty()).map(str::to_string);
                } else {
                    match r.json::<Value>().await {
                        Ok(v) => {
                            out.version = v.pointer(pointer).and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_string);

                            if out.version.is_none() && p.ecosystem == "cargo" {
                                out.version = v.pointer("/crate/max_version").and_then(Value::as_str).map(str::to_string);
                            }
                        }
                        Err(e) => out.error = Some(e.to_string()),
                    }
                }
                if out.version.is_none() && out.error.is_none() {
                    out.error = Some("not_found".into());
                }
            }
            Ok(r) if r.status().as_u16() == 404 || r.status().as_u16() == 410 => out.error = Some("not_found".into()),
            Ok(r) => out.error = Some(format!("http {}", r.status().as_u16())),
            Err(_) => out.error = Some("unreachable".into()),
        },
    }

    if out.error.as_deref().is_none_or(|e| e == "not_found") {
        cache().lock().unwrap().insert(p, (Instant::now(), out.clone()));
    }
    out
}

pub async fn latest(packages: Vec<PackageRef>, progress: impl FnMut(u32, u32)) -> Vec<Latest> {
    crate::commands::scan::bounded(packages, lookup, progress).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_manifests_but_not_vendored_ones() {
        assert_eq!(manifest_kind("package.json"), Some("npm"));
        assert_eq!(manifest_kind("apps/web/package.json"), Some("npm"));
        assert_eq!(manifest_kind("node_modules/x/package.json"), None);
        assert_eq!(manifest_kind("src-tauri/Cargo.toml"), Some("cargo"));
        assert_eq!(manifest_kind("requirements-dev.txt"), Some("pypi"));
        assert_eq!(manifest_kind("target/debug/Cargo.toml"), None);
        assert_eq!(manifest_kind("README.md"), None);
    }

    #[test]
    fn package_managers() {
        let item = |p: &str| TreeItem { path: p.into(), kind: "blob".into(), mode: "100644".into(), sha: String::new(), size: 0.0 };
        let tree = vec![item("pnpm-lock.yaml"), item("apps/web/package.json"), item("package.json"), item("tools/py/pyproject.toml"), item("tools/py/uv.lock"), item("legacy/package.json"), item("legacy/yarn.lock")];

        assert_eq!(manager_of(&tree, "apps/web/package.json", "npm", None), ("pnpm".into(), "lockfile".into()));

        assert_eq!(manager_of(&tree, "legacy/package.json", "npm", None).0, "yarn");

        assert_eq!(manager_of(&tree, "package.json", "npm", Some(r#"{"packageManager":"bun@1.1.0"}"#)), ("bun".into(), "declared".into()));
        assert_eq!(manager_of(&tree, "tools/py/pyproject.toml", "pypi", None).0, "uv");
        assert_eq!(manager_of(&tree, "x/pyproject.toml", "pypi", Some("[tool.poetry]\nname='x'")), ("poetry".into(), "declared".into()));
        assert_eq!(manager_of(&[], "requirements.txt", "pypi", None), ("pip".into(), "default".into()));
        assert_eq!(manager_of(&[], "package.json", "npm", None), ("npm".into(), "default".into()));
    }

    #[test]
    fn package_json() {
        let d = parse_package_json(r#"{"dependencies":{"react":"^19.0.0","ui":"workspace:*"},"devDependencies":{"vite":"7.1.0"}}"#).unwrap();
        assert_eq!(d, vec![dep("react", "^19.0.0", "normal"), dep("ui", "workspace", "normal"), dep("vite", "7.1.0", "dev")]);
        assert!(parse_package_json("{").is_err());
    }

    #[test]
    fn cargo_toml() {
        let d = parse_cargo(
            r#"
[dependencies]
serde = { version = "1", features = ["derive"] }
tokio = "1.40"
local = { path = "../local" }
shared = { workspace = true }
rq = { package = "reqwest", version = "0.12" }
[dev-dependencies]
tempfile = "3"
[target.'cfg(windows)'.dependencies]
winapi = "0.3"
[workspace.dependencies]
anyhow = "1"
"#,
        )
        .unwrap();
        let names: Vec<_> = d.iter().map(|x| (x.name.as_str(), x.spec.as_str(), x.kind.as_str())).collect();
        assert!(names.contains(&("serde", "1", "normal")));
        assert!(names.contains(&("local", "path", "normal")));
        assert!(names.contains(&("shared", "workspace", "normal")));
        assert!(names.contains(&("reqwest", "0.12", "normal")));
        assert!(names.contains(&("tempfile", "3", "dev")));
        assert!(names.contains(&("winapi", "0.3", "normal")));
        assert!(names.contains(&("anyhow", "1", "workspace")));
    }

    #[test]
    fn python() {
        let r = parse_requirements("# c\nrequests[socks]>=2.31 ; python_version > '3.8'\n-r base.txt\nflask==3.0.0  # web\nnumpy\ngit+https://x/y\n");
        assert_eq!(r, vec![dep("requests", ">=2.31", "normal"), dep("flask", "==3.0.0", "normal"), dep("numpy", "", "normal")]);
        let p = parse_pyproject(
            r#"
[project]
dependencies = ["httpx>=0.27", "rich"]
[project.optional-dependencies]
cli = ["typer>=0.12"]
[tool.poetry.dependencies]
python = "^3.11"
django = "^5.0"
"#,
        )
        .unwrap();
        assert_eq!(p, vec![dep("httpx", ">=0.27", "normal"), dep("rich", "", "normal"), dep("typer", ">=0.12", "optional"), dep("django", "^5.0", "normal")]);
    }

    #[test]
    fn go_and_maven() {
        let g = parse_go_mod("module x\n\ngo 1.22\n\nrequire github.com/a/b v1.2.3\nrequire (\n\tgithub.com/c/d v0.4.0\n\tgolang.org/x/sys v0.20.0 // indirect\n)\n");
        assert_eq!(g, vec![dep("github.com/a/b", "v1.2.3", "normal"), dep("github.com/c/d", "v0.4.0", "normal"), dep("golang.org/x/sys", "v0.20.0", "indirect")]);
        let m = parse_pom("<project><properties><junit.version>5.10.0</junit.version></properties><dependencies><dependency><groupId>org.junit</groupId><artifactId>junit</artifactId><version>${junit.version}</version><scope>test</scope></dependency><dependency><groupId>com.google</groupId><artifactId>guava</artifactId><version>33.0</version></dependency></dependencies></project>");
        assert_eq!(m, vec![dep("org.junit:junit", "5.10.0", "dev"), dep("com.google:guava", "33.0", "normal")]);
    }

    #[test]
    fn registry_urls() {
        assert_eq!(go_escape("github.com/Azure/sdk"), "github.com/!azure/sdk");
        let npm = registry_url(&PackageRef { ecosystem: "npm".into(), name: "@tauri-apps/api".into() }).unwrap();
        assert_eq!(npm.0, "https://registry.npmjs.org/-/package/@tauri-apps%2fapi/dist-tags");
        assert!(registry_url(&PackageRef { ecosystem: "maven".into(), name: "nogroup".into() }).is_none());
    }
}
