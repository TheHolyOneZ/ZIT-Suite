import { save } from "@tauri-apps/plugin-dialog";
import { commands, unwrap, type Issue } from "@/core/ipc";

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function issuesToCsv(issues: Issue[]): string {
  const head = [
    "repo",
    "number",
    "title",
    "state",
    "state_reason",
    "author",
    "assignees",
    "labels",
    "milestone",
    "comments",
    "created_at",
    "updated_at",
    "closed_at",
    "url",
  ];
  const rows = issues.map((i) =>
    [
      i.repo,
      i.number,
      i.title,
      i.state,
      i.state_reason,
      i.user.login,
      i.assignees.map((a) => a.login).join(";"),
      i.labels.map((l) => l.name).join(";"),
      i.milestone?.title ?? "",
      i.comments,
      i.created_at,
      i.updated_at,
      i.closed_at,
      i.html_url,
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...rows].join("\n") + "\n";
}

export async function exportIssues(issues: Issue[], format: "csv" | "json"): Promise<boolean> {
  const path = await save({
    defaultPath: `issues.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (!path) return false;
  const contents = format === "csv" ? issuesToCsv(issues) : JSON.stringify(issues, null, 2);
  await unwrap(commands.exportTextFile(path, contents));
  return true;
}
