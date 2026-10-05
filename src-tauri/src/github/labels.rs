use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use specta::Type;

use super::client::{enc, GitHubClient};
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub struct Label {
    pub name: String,

    pub color: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Milestone {
    pub number: u32,
    pub title: String,
    pub description: Option<String>,

    pub state: String,
    pub due_on: Option<String>,
    pub open_issues: u32,
    pub closed_issues: u32,
}

pub async fn list(c: &GitHubClient, repo: &str) -> AppResult<Vec<Label>> {
    c.paginate_with(&format!("/repos/{repo}/labels?per_page=100"), true).await
}

pub async fn get(c: &GitHubClient, repo: &str, name: &str) -> AppResult<Label> {
    c.get_json(&format!("/repos/{repo}/labels/{}", enc(name))).await
}

fn body(l: &Label) -> Value {
    json!({ "name": l.name, "color": l.color.trim_start_matches('#'), "description": l.description.clone().unwrap_or_default() })
}

pub async fn create(c: &GitHubClient, repo: &str, l: &Label) -> AppResult<()> {
    c.send_json(Method::POST, &format!("/repos/{repo}/labels"), Some(&body(l))).await?;
    Ok(())
}


pub async fn update(c: &GitHubClient, repo: &str, name: &str, l: &Label) -> AppResult<()> {
    let mut b = body(l);
    b["new_name"] = b["name"].take();
    c.send_json(Method::PATCH, &format!("/repos/{repo}/labels/{}", enc(name)), Some(&b)).await?;
    Ok(())
}

pub async fn delete(c: &GitHubClient, repo: &str, name: &str) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/labels/{}", enc(name)), None).await?;
    Ok(())
}


pub fn same(a: &Label, b: &Label) -> bool {
    a.name.eq_ignore_ascii_case(&b.name)
        && a.color.trim_start_matches('#').eq_ignore_ascii_case(b.color.trim_start_matches('#'))
        && a.description.as_deref().unwrap_or("") == b.description.as_deref().unwrap_or("")
}

pub async fn milestones(c: &GitHubClient, repo: &str, state: &str) -> AppResult<Vec<Milestone>> {
    c.paginate_with(&format!("/repos/{repo}/milestones?state={state}&per_page=100&sort=due_on"), true).await
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct MilestoneInput {
    pub title: Option<String>,
    pub description: Option<String>,

    pub due_on: Option<String>,
    pub clear_due_on: bool,

    pub state: Option<String>,
}

impl MilestoneInput {
    fn to_json(&self) -> Value {
        let mut m = Map::new();
        if let Some(v) = &self.title {
            m.insert("title".into(), json!(v));
        }
        if let Some(v) = &self.description {
            m.insert("description".into(), json!(v));
        }
        if self.clear_due_on {
            m.insert("due_on".into(), Value::Null);
        } else if let Some(v) = &self.due_on {
            m.insert("due_on".into(), json!(v));
        }
        if let Some(v) = &self.state {
            m.insert("state".into(), json!(v));
        }
        Value::Object(m)
    }
}

pub async fn create_milestone(c: &GitHubClient, repo: &str, input: &MilestoneInput) -> AppResult<()> {
    c.send_json(Method::POST, &format!("/repos/{repo}/milestones"), Some(&input.to_json())).await?;
    Ok(())
}

pub async fn update_milestone(c: &GitHubClient, repo: &str, number: u32, input: &MilestoneInput) -> AppResult<()> {
    c.send_json(Method::PATCH, &format!("/repos/{repo}/milestones/{number}"), Some(&input.to_json())).await?;
    Ok(())
}

pub async fn delete_milestone(c: &GitHubClient, repo: &str, number: u32) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/milestones/{number}"), None).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn label_equality_ignores_case_and_hash() {
        let a = Label { name: "Bug".into(), color: "#D73A4A".into(), description: None };
        let b = Label { name: "bug".into(), color: "d73a4a".into(), description: Some(String::new()) };
        assert!(same(&a, &b));
        let c = Label { description: Some("x".into()), ..b.clone() };
        assert!(!same(&a, &c));
    }
}
