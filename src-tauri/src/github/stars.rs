use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::GitHubClient;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Starred {

    pub id: String,
    pub repo: String,
    pub description: String,
    pub url: String,
    pub language: Option<String>,
    pub language_color: Option<String>,
    pub stars: u32,
    pub forks: u32,
    pub archived: bool,
    pub fork: bool,
    pub private: bool,
    pub pushed_at: Option<String>,
    pub starred_at: String,
    pub topics: Vec<String>,
    pub avatar: String,
}

const STARS_QUERY: &str = r#"query($after: String) {
  viewer { starredRepositories(first: 100, after: $after, orderBy: {field: STARRED_AT, direction: DESC}) {
    pageInfo { hasNextPage endCursor }
    edges { starredAt node {
      id nameWithOwner description url isArchived isFork isPrivate stargazerCount forkCount pushedAt
      primaryLanguage { name color }
      repositoryTopics(first: 8) { nodes { topic { name } } }
      owner { avatarUrl }
    } }
  } }
}"#;

fn starred_of(edge: &Value) -> Starred {
    let n = &edge["node"];
    let s = |p: &str| n.pointer(p).and_then(Value::as_str).unwrap_or_default().to_string();
    let o = |p: &str| n.pointer(p).and_then(Value::as_str).map(str::to_string);
    Starred {
        id: s("/id"),
        repo: s("/nameWithOwner"),
        description: s("/description"),
        url: s("/url"),
        language: o("/primaryLanguage/name"),
        language_color: o("/primaryLanguage/color"),
        stars: n["stargazerCount"].as_u64().unwrap_or(0) as u32,
        forks: n["forkCount"].as_u64().unwrap_or(0) as u32,
        archived: n["isArchived"].as_bool().unwrap_or(false),
        fork: n["isFork"].as_bool().unwrap_or(false),
        private: n["isPrivate"].as_bool().unwrap_or(false),
        pushed_at: o("/pushedAt"),
        starred_at: edge["starredAt"].as_str().unwrap_or_default().to_string(),
        topics: n
            .pointer("/repositoryTopics/nodes")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|t| t.pointer("/topic/name").and_then(Value::as_str).map(str::to_string)).collect())
            .unwrap_or_default(),
        avatar: s("/owner/avatarUrl"),
    }
}


pub async fn list(c: &GitHubClient) -> AppResult<Vec<Starred>> {
    let mut out = Vec::new();
    let mut after: Option<String> = None;
    loop {
        let d = c.graphql(STARS_QUERY, json!({ "after": after })).await?;
        let conn = &d["viewer"]["starredRepositories"];
        out.extend(conn["edges"].as_array().into_iter().flatten().map(starred_of));
        match (conn.pointer("/pageInfo/hasNextPage").and_then(Value::as_bool), conn.pointer("/pageInfo/endCursor").and_then(Value::as_str)) {
            (Some(true), Some(cur)) => after = Some(cur.to_string()),
            _ => break,
        }
    }
    Ok(out)
}

pub async fn set_starred(c: &GitHubClient, repo: &str, on: bool) -> AppResult<()> {
    let m = if on { Method::PUT } else { Method::DELETE };
    c.send_json::<()>(m, &format!("/user/starred/{repo}"), None).await.map(drop)
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StarList {
    pub id: String,
    pub name: String,
    pub description: String,
    pub private: bool,

    pub items: Vec<String>,
}

const LISTS_QUERY: &str = r#"query { viewer { lists(first: 50) { nodes {
  id name description isPrivate items(first: 100) { nodes { ... on Repository { id } } }
} } } }"#;

pub async fn lists(c: &GitHubClient) -> AppResult<Vec<StarList>> {
    let d = c.graphql(LISTS_QUERY, json!({})).await?;
    Ok(d.pointer("/viewer/lists/nodes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|l| StarList {
            id: l["id"].as_str().unwrap_or_default().to_string(),
            name: l["name"].as_str().unwrap_or_default().to_string(),
            description: l["description"].as_str().unwrap_or_default().to_string(),
            private: l["isPrivate"].as_bool().unwrap_or(false),
            items: l.pointer("/items/nodes").and_then(Value::as_array).into_iter().flatten().filter_map(|i| i["id"].as_str().map(str::to_string)).collect(),
        })
        .collect())
}

pub async fn create_list(c: &GitHubClient, name: &str, description: &str, private: bool) -> AppResult<String> {
    let q = "mutation($i: CreateUserListInput!) { createUserList(input: $i) { list { id } } }";
    let d = c.graphql(q, json!({ "i": { "name": name.trim(), "description": description, "isPrivate": private } })).await?;
    Ok(d.pointer("/createUserList/list/id").and_then(Value::as_str).unwrap_or_default().to_string())
}

pub async fn delete_list(c: &GitHubClient, id: &str) -> AppResult<()> {
    let q = "mutation($i: DeleteUserListInput!) { deleteUserList(input: $i) { clientMutationId } }";
    c.graphql(q, json!({ "i": { "listId": id } })).await.map(drop)
}


pub async fn set_lists(c: &GitHubClient, item_id: &str, list_ids: &[String]) -> AppResult<()> {
    let q = "mutation($i: UpdateUserListsForItemInput!) { updateUserListsForItem(input: $i) { clientMutationId } }";
    c.graphql(q, json!({ "i": { "itemId": item_id, "listIds": list_ids } })).await.map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_an_edge() {
        let s = starred_of(&json!({ "starredAt": "2026-01-01T00:00:00Z", "node": {
            "id": "R_1", "nameWithOwner": "o/r", "description": null, "url": "u", "isArchived": true, "isFork": false, "isPrivate": false,
            "stargazerCount": 42, "forkCount": 3, "pushedAt": null, "primaryLanguage": { "name": "Rust", "color": "#dea584" },
            "repositoryTopics": { "nodes": [{ "topic": { "name": "cli" } }] }, "owner": { "avatarUrl": "a" } } }));
        assert_eq!((s.repo.as_str(), s.stars, s.archived), ("o/r", 42, true));
        assert_eq!(s.description, "");
        assert_eq!(s.language.as_deref(), Some("Rust"));
        assert_eq!(s.topics, ["cli"]);
    }
}
