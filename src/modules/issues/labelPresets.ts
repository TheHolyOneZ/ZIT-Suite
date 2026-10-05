import type { Label } from "@/core/ipc";


export const STARTER_LABELS: Label[] = [
  { name: "bug", color: "d73a4a", description: "Something isn't working" },
  { name: "enhancement", color: "a2eeef", description: "New feature or request" },
  { name: "documentation", color: "0075ca", description: "Improvements or additions to documentation" },
  { name: "question", color: "d876e3", description: "Further information is requested" },
  { name: "duplicate", color: "cfd3d7", description: "This issue or pull request already exists" },
  { name: "invalid", color: "e4e669", description: "This doesn't seem right" },
  { name: "wontfix", color: "ffffff", description: "This will not be worked on" },
  { name: "good first issue", color: "7057ff", description: "Good for newcomers" },
  { name: "help wanted", color: "008672", description: "Extra attention is needed" },
  { name: "needs triage", color: "fbca04", description: "Not yet reviewed" },
  { name: "priority: high", color: "b60205", description: null },
  { name: "priority: low", color: "c5def5", description: null },
  { name: "security", color: "ee0701", description: "Security-relevant change or report" },
  { name: "dependencies", color: "0366d6", description: "Dependency updates" },
];
