export type IssueScope =
  { kind: "mine" } | { kind: "org"; org: string } | { kind: "repo"; repo: string } | { kind: "everywhere" };

export type IssueState = "open" | "closed" | "all";
export type ClosedReason = "any" | "completed" | "not_planned";
export type IssueSort = "updated" | "created" | "comments" | "reactions" | "interactions";

export interface IssueFilter {
  scope: IssueScope;
  state: IssueState;
  reason: ClosedReason;
  text: string;
  labels: string[];
  excludeLabels: string[];
  noLabels: boolean;

  assignee: string;
  author: string;
  involves: string;
  mentions: string;

  milestone: string;

  staleDays: number | null;

  extra: string;
}

export const DEFAULT_ISSUE_FILTER: IssueFilter = {
  scope: { kind: "mine" },
  state: "open",
  reason: "any",
  text: "",
  labels: [],
  excludeLabels: [],
  noLabels: false,
  assignee: "",
  author: "",
  involves: "",
  mentions: "",
  milestone: "",
  staleDays: null,
  extra: "",
};

const quote = (v: string) => (/[\s"]/.test(v) ? `"${v.replace(/"/g, "")}"` : v);
const DAY = 86_400_000;

export function isoDaysAgo(days: number, now = Date.now()) {
  return new Date(now - days * DAY).toISOString().slice(0, 10);
}

export function buildQuery(f: IssueFilter, login: string, now = Date.now()): string {
  const t: string[] = ["is:issue"];
  if (f.state !== "all") t.push(`is:${f.state}`);
  if (f.state !== "open" && f.reason !== "any")
    t.push(`reason:${f.reason === "not_planned" ? '"not planned"' : "completed"}`);
  switch (f.scope.kind) {
    case "mine":
      t.push(`user:${login}`);
      break;
    case "org":
      t.push(`org:${f.scope.org}`);
      break;
    case "repo":
      if (f.scope.repo) t.push(`repo:${f.scope.repo}`);
      break;
  }
  for (const l of f.labels) t.push(`label:${quote(l)}`);
  for (const l of f.excludeLabels) t.push(`-label:${quote(l)}`);
  if (f.noLabels) t.push("no:label");
  if (f.assignee === "none") t.push("no:assignee");
  else if (f.assignee) t.push(`assignee:${f.assignee}`);
  if (f.author) t.push(`author:${f.author}`);
  if (f.involves) t.push(`involves:${f.involves}`);
  if (f.mentions) t.push(`mentions:${f.mentions}`);
  if (f.milestone === "none") t.push("no:milestone");
  else if (f.milestone) t.push(`milestone:${quote(f.milestone)}`);
  if (f.staleDays) t.push(`updated:<${isoDaysAgo(f.staleDays, now)}`);
  if (f.extra.trim()) t.push(f.extra.trim());
  if (f.text.trim()) t.push(f.text.trim());
  return t.join(" ");
}

export function tokenize(q: string): string[] {
  return q.match(/-?[\w.-]+:"[^"]*"|"[^"]*"|\S+/g) ?? [];
}

const unquote = (v: string) => v.replace(/^"(.*)"$/, "$1");

export function parseQuery(q: string, login: string, now = Date.now()): IssueFilter {
  const f: IssueFilter = {
    ...DEFAULT_ISSUE_FILTER,
    scope: { kind: "everywhere" },
    state: "all",
    labels: [],
    excludeLabels: [],
  };
  const extra: string[] = [];
  const text: string[] = [];
  for (const tok of tokenize(q)) {
    const m = tok.match(/^(-?)([\w.-]+):(.*)$/);
    if (!m) {
      text.push(tok);
      continue;
    }
    const [, neg, key, raw] = m;
    const v = unquote(raw);
    const k = key.toLowerCase();
    if (neg && k === "label") f.excludeLabels.push(v);
    else if (neg) extra.push(tok);
    else if (k === "is" && v === "issue") continue;
    else if (k === "is" && (v === "open" || v === "closed")) f.state = v;
    else if (k === "reason") f.reason = v.replace(" ", "_") === "not_planned" ? "not_planned" : "completed";
    else if (k === "user" && v === login) f.scope = { kind: "mine" };
    else if (k === "org") f.scope = { kind: "org", org: v };
    else if (k === "repo") f.scope = { kind: "repo", repo: v };
    else if (k === "label") f.labels.push(v);
    else if (k === "no" && v === "label") f.noLabels = true;
    else if (k === "no" && v === "assignee") f.assignee = "none";
    else if (k === "no" && v === "milestone") f.milestone = "none";
    else if (k === "assignee") f.assignee = v;
    else if (k === "author") f.author = v;
    else if (k === "involves") f.involves = v;
    else if (k === "mentions") f.mentions = v;
    else if (k === "milestone") f.milestone = v;
    else if (k === "updated" && v.startsWith("<")) {
      const days = Math.round((now - Date.parse(v.slice(1))) / DAY);
      if (Number.isFinite(days) && days > 0) f.staleDays = days;
      else extra.push(tok);
    } else extra.push(tok);
  }
  f.extra = extra.join(" ");
  f.text = text.join(" ");
  return f;
}

export type BuiltinView =
  "myOpen" | "involving" | "assigned" | "created" | "mentioned" | "unassigned" | "stale" | "recentlyClosed";

export const BUILTIN_VIEWS: Record<BuiltinView, Partial<IssueFilter>> = {
  myOpen: { scope: { kind: "mine" }, state: "open" },
  involving: { scope: { kind: "everywhere" }, state: "open", involves: "@me" },
  assigned: { scope: { kind: "everywhere" }, state: "open", assignee: "@me" },
  created: { scope: { kind: "everywhere" }, state: "open", author: "@me" },
  mentioned: { scope: { kind: "everywhere" }, state: "open", mentions: "@me" },
  unassigned: { scope: { kind: "mine" }, state: "open", assignee: "none" },
  stale: { scope: { kind: "mine" }, state: "open", staleDays: 90 },
  recentlyClosed: { scope: { kind: "mine" }, state: "closed" },
};

export function viewFilter(v: BuiltinView): IssueFilter {
  return { ...DEFAULT_ISSUE_FILTER, labels: [], excludeLabels: [], ...BUILTIN_VIEWS[v] };
}

export const issueKey = (repo: string, number: number) => `${repo}#${number}`;
export const parseKey = (key: string) => {
  const i = key.lastIndexOf("#");
  return { repo: key.slice(0, i), number: Number(key.slice(i + 1)) };
};
