const ECOSYSTEMS: [RegExp, string][] = [
  [/(^|\/)package\.json$/, "npm"],
  [/(^|\/)Cargo\.toml$/, "cargo"],
  [/(^|\/)(requirements[^/]*\.txt|pyproject\.toml|Pipfile)$/, "pip"],
  [/(^|\/)go\.mod$/, "gomod"],
  [/(^|\/)(pom\.xml)$/, "maven"],
  [/(^|\/)build\.gradle(\.kts)?$/, "gradle"],
  [/(^|\/)composer\.json$/, "composer"],
  [/(^|\/)Gemfile$/, "bundler"],
  [/(^|\/)Dockerfile$/, "docker"],
  [/(^|\/)[^/]+\.csproj$/, "nuget"],
];
const SKIP = /(^|\/)(node_modules|vendor|target|dist|build|\.venv)\//;

export interface UpdateTarget {
  ecosystem: string;
  directory: string;
}


export function detectTargets(paths: string[]): UpdateTarget[] {
  const seen = new Set<string>();
  const out: UpdateTarget[] = [];
  const add = (ecosystem: string, directory: string) => {
    const k = `${ecosystem}@${directory}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ ecosystem, directory });
  };
  for (const p of paths) {
    if (SKIP.test(p)) continue;
    for (const [re, eco] of ECOSYSTEMS) {
      if (re.test(p)) {
        const dir = p.includes("/") ? `/${p.slice(0, p.lastIndexOf("/"))}` : "/";
        add(eco, dir);
      }
    }
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)) add("github-actions", "/");
  }
  return out.sort((a, b) => a.ecosystem.localeCompare(b.ecosystem) || a.directory.localeCompare(b.directory));
}

export type Interval = "daily" | "weekly" | "monthly";


export function dependabotYml(targets: UpdateTarget[], interval: Interval, group: boolean): string {
  const lines = ["version: 2", "updates:"];
  for (const t of targets) {
    lines.push(
      `  - package-ecosystem: "${t.ecosystem}"`,
      `    directory: "${t.directory}"`,
      "    schedule:",
      `      interval: "${interval}"`,
    );
    if (group)
      lines.push(
        "    groups:",
        `      ${t.ecosystem.replace(/[^a-z0-9]+/g, "-")}:`,
        "        patterns:",
        '          - "*"',
      );
  }
  return `${lines.join("\n")}\n`;
}
