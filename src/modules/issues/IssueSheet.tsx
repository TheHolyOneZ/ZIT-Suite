import type { Issue } from "@/core/ipc";
import { queryClient } from "@/core/query";
import { sheets, type SheetParams } from "@/core/sheets/store";
import { IssueDetail } from "./IssueDetail";
import { issueKey } from "./query";


export function IssueSheet({ params }: { params: SheetParams }) {
  const key = issueKey(String(params.repo), Number(params.number));
  const cached = queryClient.getQueryData<Issue>(["issues", "one", params.repo, params.number]);
  return <IssueDetail issueKey={key} fallback={cached} />;
}

export function openIssue(issue: Issue) {
  queryClient.setQueryData(
    ["issues", "one", issue.repo, issue.number],
    (old: Issue | undefined) => old ?? issue,
  );
  sheets.push("issues", "issue", { repo: issue.repo, number: issue.number, title: issue.title });
}
