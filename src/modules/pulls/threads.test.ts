import { describe, expect, it } from "vitest";
import type { ReviewComment } from "@/core/ipc";
import { buildThreads } from "./threads";

const c = (id: number, reply: number | null, at: string): ReviewComment => ({
  id,
  in_reply_to_id: reply,
  pull_request_review_id: null,
  created_at: at,
  updated_at: at,
  body: String(id),
  path: "a",
  line: 1,
  start_line: null,
  original_line: 1,
  side: "RIGHT",
  html_url: "",
  user: { login: "u", avatar_url: "" },
});

describe("buildThreads", () => {
  it("groups replies (including replies to replies) under their root, in time order", () => {
    const t = buildThreads([c(3, 1, "3"), c(1, null, "1"), c(2, null, "2"), c(4, 3, "4")]);
    expect(t.map((x) => [x.root.id, x.replies.map((r) => r.id)])).toEqual([
      [1, [3, 4]],
      [2, []],
    ]);
  });
});
