export interface Suggestion {
  before: string;
  after: string;

  code: string;
}

export function findSuggestion(body: string): Suggestion | null {
  const m = /```suggestion[^\n]*\r?\n([\s\S]*?)\r?\n?```/.exec(body);
  if (!m) return null;
  return {
    before: body.slice(0, m.index).trim(),
    after: body.slice(m.index + m[0].length).trim(),
    code: m[1],
  };
}


export function applySuggestion(text: string, start: number, end: number, code: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const trailing = text.endsWith(eol);
  const lines = (trailing ? text.slice(0, -eol.length) : text).split(eol);
  const repl = code === "" ? [] : code.replace(/\r\n/g, "\n").split("\n");
  lines.splice(start - 1, end - start + 1, ...repl);
  return lines.join(eol) + (trailing ? eol : "");
}


export const suggestionBlock = (lines: string[]) => `\`\`\`suggestion\n${lines.join("\n")}\n\`\`\``;
