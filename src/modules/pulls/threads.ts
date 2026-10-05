import type { ReviewComment } from "@/core/ipc";

export interface Thread {
  root: ReviewComment;
  replies: ReviewComment[];
}


export function buildThreads(comments: ReviewComment[]): Thread[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c: ReviewComment): ReviewComment => {
    let cur = c;
    const seen = new Set<number>();
    while (cur.in_reply_to_id && byId.has(cur.in_reply_to_id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.in_reply_to_id)!;
    }
    return cur;
  };
  const threads = new Map<number, Thread>();
  for (const c of [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const root = rootOf(c);
    if (!threads.has(root.id)) threads.set(root.id, { root, replies: [] });
    if (c.id !== root.id) threads.get(root.id)!.replies.push(c);
  }
  return [...threads.values()];
}


export const anchorKey = (side: string | null | undefined, line: number | null | undefined) =>
  `${side ?? "RIGHT"}:${line}`;
