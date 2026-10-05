import { beforeEach, describe, expect, it } from "vitest";
import { useSheets } from "./store";

const st = () => useSheets.getState();
const stack = () => st().stacks[st().active];

beforeEach(() => useSheets.setState({ active: "repos", stacks: {} }));

describe("sheet stacks", () => {
  it("pushes, replaces same-view tops, pops", () => {
    st().open("issues");
    st().push("issues", "issue", { number: 1 });
    st().push("issues", "issue", { number: 2 });
    expect(stack().map((s) => s.view)).toEqual(["root", "issue"]);
    expect(stack()[1].params.number).toBe(2);
    st().pop();
    expect(stack().map((s) => s.view)).toEqual(["root"]);
    st().pop();
    expect(stack().length).toBe(1);
  });

  it("keeps each module's stack when switching, and re-clicking returns to root", () => {
    st().open("repos");
    st().push("repos", "repo", { name: "a" });
    st().open("issues");
    st().open("repos");
    expect(stack().map((s) => s.view)).toEqual(["root", "repo"]);
    st().open("repos");
    expect(stack().map((s) => s.view)).toEqual(["root"]);
  });

  it("popTo keeps at least the root", () => {
    st().push("repos", "repo", {});
    st().push("issues", "issue", {});
    st().popTo(0);
    expect(stack().length).toBe(1);
  });
});
