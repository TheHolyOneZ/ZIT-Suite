import { describe, expect, it } from "vitest";
import { parseTemplate } from "./templates";

describe("issue templates", () => {
  it("reads markdown front matter", () => {
    const t = parseTemplate(
      "bug.md",
      "---\nname: Bug report\nabout: Something broke\ntitle: '[Bug] '\nlabels: bug, triage\nassignees: ''\n---\n\n**Describe the bug**\n",
    )!;
    expect(t).toMatchObject({
      name: "Bug report",
      title: "[Bug] ",
      labels: ["bug", "triage"],
      assignees: [],
      body: "**Describe the bug**",
    });
  });
  it("turns issue forms into markdown sections", () => {
    const yml = `name: Feature
description: Ask for something
labels: [enhancement]
body:
  - type: markdown
    attributes: { value: "Thanks!" }
  - type: textarea
    attributes: { label: What should happen? }
  - type: checkboxes
    attributes:
      label: Checks
      options: [{ label: I searched first }]
`;
    const t = parseTemplate("feature.yml", yml)!;
    expect(t.labels).toEqual(["enhancement"]);
    expect(t.body).toBe("Thanks!\n\n### What should happen?\n\n### Checks\n\n- [ ] I searched first");
    expect(parseTemplate("config.yml", "blank_issues_enabled: false")).toBeNull();
  });
});
