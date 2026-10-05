import {
  buildQuery,
  DEFAULT_ISSUE_FILTER,
  parseQuery,
  tokenize,
  type IssueFilter,
} from "@/modules/issues/query";

export type PullState = "open" | "closed" | "merged" | "all";
export type ReviewFilter = "any" | "none" | "required" | "approved" | "changes_requested";
export type ChecksFilter = "any" | "success" | "failure" | "pending";
export type DraftFilter = "any" | "draft" | "ready";
export type PullSort = "updated" | "created" | "comments" | "best";

export interface PullFilter extends Omit<IssueFilter, "state" | "reason"> {
  state: PullState;
  review: ReviewFilter;
  checks: ChecksFilter;
  draft: DraftFilter;

  reviewRequested: string;
  sort: PullSort;
}

export const DEFAULT_PULL_FILTER: PullFilter = {
  ...DEFAULT_ISSUE_FILTER,
  labels: [],
  excludeLabels: [],
  state: "open",
  review: "any",
  checks: "any",
  draft: "any",
  reviewRequested: "",
  sort: "updated",
};

export function buildPullQuery(f: PullFilter, login: string, now = Date.now()): string {
  const base = buildQuery(
    { ...f, state: f.state === "merged" ? "closed" : f.state, reason: "any" },
    login,
    now,
  );
  const t = base
    .replace(/^is:issue/, "is:pr")
    .replace(f.state === "merged" ? "is:closed" : "\u0000", "is:merged")
    .split(" ");

  const extra: string[] = [];
  if (f.review !== "any") extra.push(`review:${f.review}`);
  if (f.checks !== "any") extra.push(`status:${f.checks}`);
  if (f.draft !== "any") extra.push(`draft:${f.draft === "draft"}`);
  if (f.reviewRequested) extra.push(`review-requested:${f.reviewRequested}`);
  if (f.sort !== "best") extra.push(`sort:${f.sort}-desc`);
  const textIdx = f.text.trim() ? t.length - f.text.trim().split(/\s+/).length : t.length;
  t.splice(textIdx, 0, ...extra);
  return t.join(" ");
}

export function parsePullQuery(q: string, login: string, now = Date.now()): PullFilter {
  const prTokens: string[] = [];
  let state: PullState | null = null;
  const rest: string[] = [];
  for (const tok of tokenize(q)) {
    if (tok === "is:pr") continue;
    if (tok === "is:merged") state = "merged";
    else if (/^(review|status|draft|review-requested|sort):/.test(tok)) prTokens.push(tok);
    else rest.push(tok);
  }
  const base = parseQuery(rest.join(" "), login, now);
  const f: PullFilter = {
    ...DEFAULT_PULL_FILTER,
    ...base,
    state: state ?? base.state,
    review: "any",
    checks: "any",
    draft: "any",
    reviewRequested: "",
    sort: "best",
  };
  for (const tok of prTokens) {
    const [k, v] = [tok.slice(0, tok.indexOf(":")), tok.slice(tok.indexOf(":") + 1)];
    if (k === "review" && ["none", "required", "approved", "changes_requested"].includes(v))
      f.review = v as ReviewFilter;
    else if (k === "status" && ["success", "failure", "pending"].includes(v)) f.checks = v as ChecksFilter;
    else if (k === "draft") f.draft = v === "true" ? "draft" : "ready";
    else if (k === "review-requested") f.reviewRequested = v;
    else if (k === "sort")
      f.sort = (["updated", "created", "comments"].find((x) => v.startsWith(x)) as PullSort) ?? "best";
  }
  return f;
}

export type PullView =
  | "reviewRequested"
  | "mine"
  | "myRepos"
  | "assigned"
  | "failing"
  | "readyToMerge"
  | "drafts"
  | "recentlyMerged";

export const PULL_VIEWS: Record<PullView, Partial<PullFilter>> = {
  reviewRequested: { scope: { kind: "everywhere" }, state: "open", reviewRequested: "@me" },
  mine: { scope: { kind: "everywhere" }, state: "open", author: "@me" },
  myRepos: { scope: { kind: "mine" }, state: "open" },
  assigned: { scope: { kind: "everywhere" }, state: "open", assignee: "@me" },
  failing: { scope: { kind: "mine" }, state: "open", checks: "failure" },
  readyToMerge: {
    scope: { kind: "mine" },
    state: "open",
    draft: "ready",
    review: "approved",
    checks: "success",
  },
  drafts: { scope: { kind: "mine" }, state: "open", draft: "draft" },
  recentlyMerged: { scope: { kind: "mine" }, state: "merged" },
};

export const pullViewFilter = (v: PullView): PullFilter => ({
  ...DEFAULT_PULL_FILTER,
  labels: [],
  excludeLabels: [],
  ...PULL_VIEWS[v],
});
export const pullKey = (repo: string, number: number) => `${repo}#${number}`;
