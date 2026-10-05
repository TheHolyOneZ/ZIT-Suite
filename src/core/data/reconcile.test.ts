import { describe, expect, it, vi } from "vitest";
import { createReconciled, sameBody } from "./reconcile";

const timeout = { code: "network.timeout", detail: null, status: null };
type C = { id: number; body: string };
const mine = (c: C) => sameBody(c.body, "hi");

describe("createReconciled", () => {
  it("returns the created item normally", async () => {
    const list = vi.fn();
    await expect(createReconciled(async () => ({ id: 3, body: "hi" }), list, mine, [])).resolves.toEqual({ id: 3, body: "hi" });
    expect(list).not.toHaveBeenCalled();
  });

  it("finds the item that landed despite a timeout, ignoring known ids", async () => {
    const send = () => Promise.reject(timeout);
    const list = async () => [{ id: 1, body: "hi" }, { id: 5, body: "hi\r\n" }, { id: 6, body: "other" }];
    await expect(createReconciled(send, list, mine, [1])).resolves.toEqual({ id: 5, body: "hi\r\n" });
  });

  it("rethrows when the item did not land or the error is not a network one", async () => {
    await expect(createReconciled(() => Promise.reject(timeout), async () => [{ id: 1, body: "hi" }], mine, [1])).rejects.toBe(timeout);
    const forbidden = { code: "github.forbidden", detail: null, status: 403 };
    const list = vi.fn();
    await expect(createReconciled(() => Promise.reject(forbidden), list, mine, [])).rejects.toBe(forbidden);
    expect(list).not.toHaveBeenCalled();
  });
});
