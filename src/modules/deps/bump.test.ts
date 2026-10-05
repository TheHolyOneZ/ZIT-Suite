import { describe, expect, it } from "vitest";
import { bumpManifest, canBump } from "./bump";

describe("bumping a dependency", () => {
  it("package.json keeps the range and the formatting", () => {
    const pkg = `{\n  "dependencies": {\n    "react": "^18.3.1",\n    "react-dom": "^18.3.1",\n    "ui": "workspace:*"\n  }\n}\n`;
    expect(bumpManifest(pkg, "npm", "package.json", "react", "19.2.0")).toBe(
      pkg.replace(`"react": "^18.3.1"`, `"react": "^19.2.0"`),
    );
    expect(bumpManifest(pkg, "npm", "package.json", "ui", "2.0.0")).toBeNull();
    expect(bumpManifest(pkg, "npm", "package.json", "nope", "1.0.0")).toBeNull();
  });
  it("Cargo.toml plain and table forms", () => {
    const toml = `[dependencies]\nserde = "1.0"\ntokio = { version = "1.40", features = ["full"] }\nlocal = { path = "../x" }\n`;
    const out = bumpManifest(toml, "cargo", "Cargo.toml", "tokio", "1.47.1")!;
    expect(out).toContain(`tokio = { version = "1.47.1", features = ["full"] }`);
    expect(out).toContain(`serde = "1.0"`);
    expect(bumpManifest(toml, "cargo", "Cargo.toml", "local", "2.0.0")).toBeNull();
  });
  it("requirements.txt", () => {
    expect(
      bumpManifest(
        "flask==2.0.0\nrequests>=2.0 ; python_version > '3'\n",
        "pypi",
        "requirements.txt",
        "requests",
        "2.32.3",
      ),
    ).toBe("flask==2.0.0\nrequests>=2.32.3 ; python_version > '3'\n");
    expect(canBump("pypi", "pyproject.toml")).toBe(false);
  });
});
