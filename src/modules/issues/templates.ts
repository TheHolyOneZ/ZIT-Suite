import { parse } from "yaml";


export interface IssueTemplate {
  file: string;
  name: string;
  about: string;
  title: string;
  labels: string[];
  assignees: string[];
  body: string;
}

const list = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map(String).filter(Boolean)
    : typeof v === "string"
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];


function fromMarkdown(file: string, text: string): IssueTemplate | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  let meta: Record<string, unknown> = {};
  let body = text;
  if (m) {
    try {
      meta = (parse(m[1]) as Record<string, unknown>) ?? {};
    } catch {
      meta = {};
    }
    body = m[2];
  }
  return {
    file,
    name: String(meta.name ?? file.replace(/\.md$/i, "")),
    about: String(meta.about ?? ""),
    title: String(meta.title ?? ""),
    labels: list(meta.labels),
    assignees: list(meta.assignees),
    body: body.trim(),
  };
}

type FormItem = { type?: string; attributes?: Record<string, unknown> };


function fromForm(file: string, text: string): IssueTemplate | null {
  let doc: Record<string, unknown>;
  try {
    doc = parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.body)) return null;
  const parts: string[] = [];
  for (const item of doc.body as FormItem[]) {
    const a = item.attributes ?? {};
    const label = String(a.label ?? "");
    switch (item.type) {
      case "markdown":
        parts.push(String(a.value ?? "").trim());
        break;
      case "checkboxes": {
        const opts = Array.isArray(a.options) ? (a.options as { label?: string }[]) : [];
        parts.push(`### ${label}\n\n${opts.map((o) => `- [ ] ${o.label ?? ""}`).join("\n")}`);
        break;
      }
      case "dropdown": {
        const opts = Array.isArray(a.options) ? a.options.map(String) : [];
        parts.push(`### ${label}\n\n${opts.length ? `<!-- ${opts.join(" / ")} -->\n` : ""}`);
        break;
      }
      default:
        if (label) parts.push(`### ${label}\n\n${String(a.value ?? "")}`.trimEnd());
    }
  }
  return {
    file,
    name: String(doc.name ?? file),
    about: String(doc.description ?? ""),
    title: String(doc.title ?? ""),
    labels: list(doc.labels),
    assignees: list(doc.assignees),
    body: parts.filter(Boolean).join("\n\n"),
  };
}

export function parseTemplate(file: string, text: string): IssueTemplate | null {
  if (/\.md$/i.test(file)) return fromMarkdown(file, text);
  if (/\.ya?ml$/i.test(file) && !/^config\.ya?ml$/i.test(file)) return fromForm(file, text);
  return null;
}
