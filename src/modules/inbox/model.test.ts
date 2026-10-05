import { describe, expect, it } from "vitest";
import type { Thread } from "@/core/ipc";
import { filterThreads, groupThreads, isUrgent, newlyUrgent, noisiest } from "./model";

const th = (p: Partial<Thread>): Thread => ({
  id: "1",
  unread: true,
  reason: "subscribed",
  updated_at: "2026-10-01T00:00:00Z",
  last_read_at: null,
  repo: "o/a",
  repo_private: false,
  owner_avatar: "",
  kind: "Issue",
  title: "Bug",
  number: 1,
  web_url: "u",
  ...p,
});

describe("inbox model", () => {
  const list = [
    th({ id: "1", reason: "review_requested", kind: "PullRequest", repo: "o/b" }),
    th({ id: "2", reason: "subscribed" }),
    th({ id: "3", reason: "mention", unread: false }),
    th({ id: "4", reason: "subscribed", repo: "o/b", title: "Release v2", kind: "Release" }),
  ];

  it("groups by reason, most urgent first; by repo, most unread first", () => {
    expect(groupThreads(list, "reason").map((g) => g.key)).toEqual([
      "review_requested",
      "mention",
      "subscribed",
    ]);
    expect(groupThreads(list, "repo").map((g) => [g.key, g.unread])).toEqual([
      ["o/b", 2],
      ["o/a", 1],
    ]);
    expect(groupThreads(list, "none")[0].threads).toHaveLength(4);
  });

  it("filters", () => {
    expect(
      filterThreads(list, { search: "release", reasons: [], kinds: [], repo: null }).map((t) => t.id),
    ).toEqual(["4"]);
    expect(
      filterThreads(list, { search: "", reasons: ["subscribed"], kinds: [], repo: "o/a" }).map((t) => t.id),
    ).toEqual(["2"]);
    expect(
      filterThreads(list, { search: "", reasons: [], kinds: ["PullRequest"], repo: null }).map((t) => t.id),
    ).toEqual(["1"]);
  });

  it("urgency and new arrivals", () => {
    expect(list.filter(isUrgent).map((t) => t.id)).toEqual(["1"]);
    expect(newlyUrgent(undefined, list)).toEqual([]);
    const next = [...list, th({ id: "9", reason: "mention" })];
    expect(newlyUrgent(list, next).map((t) => t.id)).toEqual(["9"]);
    expect(newlyUrgent(list, [{ ...list[0], updated_at: "2026-10-02T00:00:00Z" }]).map((t) => t.id)).toEqual([
      "1",
    ]);
  });

  it("noisiest repos", () => {
    expect(noisiest(list, 1)).toEqual([{ repo: "o/a", count: 2 }]);
  });
});
