import { describe, expect, it } from "vitest";
import { sameSignature, signPayload } from "./signature";

describe("webhook signatures", () => {
  it("matches GitHub's documented example", async () => {

    const sig = await signPayload("It's a Secret to Everybody", "Hello, World!");
    expect(sig).toBe("sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17");
    expect(sameSignature(sig, sig.toUpperCase().replace("SHA256", "sha256"))).toBe(true);
    expect(sameSignature(sig, "sha256=00")).toBe(false);
  });
});
