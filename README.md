<div align="center">

<img src="docs/logo.png" alt="ZIT-Suite logo — GitHub repository manager desktop app" width="128" height="128">

# ZIT-Suite

### Build. Manage. Ship. — every GitHub repository you own, in one desktop app.

**ZIT-Suite** is a free, open-source **GitHub desktop client and repository manager** for Linux and Windows.
Manage hundreds of repositories at once, triage issues and pull requests across all of them, run
**bulk actions with a real dry run**, edit files, ship releases, watch CI and keep your projects in sync with
**built-in Git** — no terminal, no installed `git` needed.

<p>
  <a href="https://zsync.eu/zit-suite/#download"><img alt="Version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-FF7A1A?style=for-the-badge&labelColor=0f1115"></a>
  <a href="LICENSE"><img alt="License: GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-FF7A1A?style=for-the-badge&labelColor=0f1115"></a>
  <img alt="Platforms: Linux and Windows" src="https://img.shields.io/badge/platform-Linux%20%7C%20Windows-FF7A1A?style=for-the-badge&labelColor=0f1115">
</p>
<p>
  <img alt="Built with Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white&labelColor=0f1115">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-backend-DEA584?style=flat-square&logo=rust&logoColor=white&labelColor=0f1115">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white&labelColor=0f1115">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=0f1115">
  <img alt="Languages: English and German" src="https://img.shields.io/badge/i18n-EN%20%7C%20DE-9B7BFF?style=flat-square&labelColor=0f1115">
  <img alt="Light and dark theme" src="https://img.shields.io/badge/theme-light%20%2B%20dark-3BD18A?style=flat-square&labelColor=0f1115">
</p>

<p>
  <a href="https://zsync.eu/zit-suite/"><b>⬇ Official downloads only at zsync.eu/zit-suite</b></a>
</p>

<p>
  <a href="#-features">Features</a> ·
  <a href="#-screenshots">Screenshots</a> ·
  <a href="#-install">Install</a> ·
  <a href="#-safety-first">Safety</a> ·
  <a href="#-build-from-source">Build from source</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-faq">FAQ</a> ·
  <a href="ROADMAP.md">Roadmap</a>
</p>

<img src="docs/screenshots/repositories.png" alt="ZIT-Suite Repositories tab: all GitHub repositories with health score, language, stars, size and last push, filtered by lifecycle (active, dormant, dead, empty, archived)" width="100%">

</div>

---

## ✦ Why ZIT-Suite?

GitHub's website is built around **one repository at a time**. The moment you own 30, 100 or 200 repositories,
simple chores become afternoons: archiving dead projects, finding every failing workflow, rotating a secret
everywhere, adding a license, cleaning up merged branches, answering issues spread over a dozen repos.

ZIT-Suite turns those chores into a few clicks:

<table>
  <tr>
    <td width="33%" valign="top"><b>⚡ Bulk everything</b><br>Archive, delete, change visibility, rename, transfer, label, protect, add topics or set secrets on many repos at once — always through a <b>queue with a real dry run</b>.</td>
    <td width="33%" valign="top"><b>🗂 Cross-repo views</b><br>One inbox for issues, one for pull requests, one CI board, one release board, one security overview — across <b>every repository you own</b>.</td>
    <td width="33%" valign="top"><b>🏠 Git without the terminal</b><br>Home turns any folder into a project: save versions, upload, get latest, branches, diffs, park changes, undo — with <b>built-in libgit2</b>.</td>
  </tr>
  <tr>
    <td valign="top"><b>🔐 Safe by design</b><br>Tokens in the <b>OS keychain</b>, typed confirmation for destructive actions, a grace countdown, pushes never forced, secrets sealed on-device.</td>
    <td valign="top"><b>📊 Insight, not noise</b><br>Health scores, tidy checks with one-click fixes, custom rules, traffic history beyond GitHub's 14 days, contributor stats and a code audit.</td>
    <td valign="top"><b>🎨 A real workbench</b><br>A distinctive blueprint design, light + dark, accent colors, command palette, keyboard-first, English + German, Linux + Windows.</td>
  </tr>
</table>

---

## ✦ Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/repo-sheet.png" alt="Repository detail sheet with stars, forks, size, health bar, language breakdown, topics and quick operations"><br><sub><b>Repositories</b> — detail sheet with health, languages, topics and queue-backed operations</sub></td>
    <td width="50%"><img src="docs/screenshots/home.png" alt="Home tab: local Git workspace with unsaved changes, per-file diff, save version and upload to GitHub"><br><sub><b>Home</b> — local Git workspace with per-file diff, save &amp; upload</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/actions.png" alt="GitHub Actions CI board across all repositories with success rate and latest run per workflow"><br><sub><b>Actions</b> — cross-repo CI board with success rates</sub></td>
    <td><img src="docs/screenshots/releases.png" alt="Releases board: latest release, downloads and commits waiting since the last release for every repository"><br><sub><b>Releases</b> — what's released where and what's waiting to ship</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/insights-overview.png" alt="Insights overview: repository KPIs, primary languages, lifecycle mix, created per year and last push per month"><br><sub><b>Insights</b> — portfolio overview</sub></td>
    <td><img src="docs/screenshots/insights-checks.png" alt="Insights checks: tidy score, stale repositories, missing licenses and topics, near-duplicate names with bulk fixes"><br><sub><b>Insights → Checks</b> — tidy score with one-click bulk fixes</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/audit.png" alt="Code audit: lines of code, files, size, commits, lines added and removed, language bar and file tree with line counts"><br><sub><b>Code Audit</b> — lines of code, history, languages and a sized file tree</sub></td>
    <td><img src="docs/screenshots/files-editor.png" alt="Files and editor: browse and edit any GitHub repository with syntax highlighting, commit all changes as one atomic commit"><br><sub><b>Files &amp; Editor</b> — edit any repo, save everything as one commit</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/issue-sheet.png" alt="Cross-repository issue inbox with issue detail, labels, assignees, reactions, sub-issues and timeline"><br><sub><b>Issues</b> — cross-repo inbox with timeline, reactions and sub-issues</sub></td>
    <td><img src="docs/screenshots/search.png" alt="GitHub code search with results grouped per repository, highlighted matches and saved searches"><br><sub><b>Search</b> — code results grouped per repository</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/rulesets.png" alt="Branch rulesets editor: block deletion and force pushes, require pull requests and approvals, status checks"><br><sub><b>Branches → Rulesets</b> — edit GitHub rulesets in-app</sub></td>
    <td><img src="docs/screenshots/security.png" alt="Security posture grid: Dependabot alerts, security updates, secret scanning, push protection per repository with grades"><br><sub><b>Security</b> — posture grid, alerts and fix plan</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/dependencies.png" alt="Dependency scanner across repositories: packages, version conflicts and outdated dependencies for npm, pnpm, Cargo and pip"><br><sub><b>Dependencies</b> — every package across every repo</sub></td>
    <td><img src="docs/screenshots/scheduler.png" alt="Scheduler: weekly cleanup schedule that archives dead repositories, with live matching preview"><br><sub><b>Scheduler</b> — recurring bulk actions with dry run</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/command-palette.png" alt="Command palette with Ctrl+K: jump to any module or run any action"><br><sub><b>Command palette</b> — <kbd>Ctrl</kbd>+<kbd>K</kbd> to go anywhere</sub></td>
    <td><img src="docs/screenshots/queue.png" alt="Operations queue with history of bulk actions, status and timestamps in the light theme"><br><sub><b>Queue</b> — every bulk action, tracked (light theme)</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/light-theme.png" alt="ZIT-Suite in the light blueprint theme showing the repository list and detail sheet"><br><sub><b>Light theme</b> — "blueprint paper"</sub></td>
    <td><img src="docs/screenshots/german.png" alt="ZIT-Suite user interface in German (Deutsch)"><br><sub><b>Deutsch</b> — full German translation, one click to switch</sub></td>
  </tr>
</table>

---

## ✦ Features

ZIT-Suite is organized in three pillars — **BUILD**, **MANAGE** and **SHIP** — plus the system tools (Queue,
Settings). Every tab is a self-contained module; everything bulk or destructive goes through the queue.

### 🏗 BUILD

#### Home — Git for people who don't want to learn Git
- **Workspaces**: any folder on your computer becomes a project card with a one-line status (unsaved changes, not uploaded, new on GitHub, all good)
- **One-click setup** for a plain folder: `git init`, a suggested `.gitignore`, a new **private** GitHub repo, first version and upload
- **Save versions** (commit) with a message that follows your selection, **Save & upload** (push), discard per file, secret-file warnings with a one-click "Don't share"
- **Per-file diff view**, **undo last save** (while it's only on your computer), **park my changes** (stash) and bring them back
- **Get latest** (fast-forward or clean merge) with a **conflict helper** — pick *mine* or *theirs* per file
- **Push target + reference repo**: compare your copy with the original you forked — new on GitHub, not uploaded yet, only in your copy — and bring upstream changes in
- **Watching** (1 s – 5 min) and **automation**: save every N minutes or after N quiet minutes, optional auto-upload, message templates
- **Files & sharing**: tick what goes to GitHub, "usually not shared" suggestions (dependencies, builds, secrets, OS junk), raw `.gitignore` editor
- **Branches**: create, safe switch, upload, and **start a pull request** from the branch menu
- **History** with "uploaded" marks, commits signed with your GitHub noreply identity, **pushes never forced**
- **About**, **Releases** and **Actions** tabs per project, **clone** any repo into a workspace, **open in VS Code / your terminal**
- Runs in the background from the **system tray** so automation keeps going with the window closed

#### Files & Editor — edit any repository on GitHub
- Browse any repo and branch, **CodeMirror 6** editor with syntax highlighting, search, tabs and a focus mode
- Add, rename, move and delete files — all saved as **one atomic commit** (Git Data API), or to a **new branch + pull request**
- **Upload files or whole folders** (respects `.gitignore`, skips `node_modules` / `target`), image previews, Markdown preview
- File modes kept (executable bit survives), refuses to overwrite when the branch moved meanwhile
- Staged changes remembered across restarts, review pane with line diff, **file history**, revert, **blame view**

#### Branches — every branch, everywhere
- One request per 100 branches: last commit, open PR, protection, **ahead / behind** the default branch
- Filters: stale, merged, in a PR, protected · **clean up merged branches** · real **rename** · set default
- **Branch protection** with required status checks · **rulesets editor** (deletion, force pushes, linear history, signed commits, PR reviews and approvals, status checks)
- **Bulk**: create a branch or protect the default branch on many repositories at once

#### Dependencies — a dependency scanner for all your repos
- Reads `package.json`, `Cargo.toml` (incl. workspaces), `requirements*.txt`, `pyproject.toml` (PEP 621, Poetry), `go.mod`, `pom.xml` — anywhere in a monorepo
- Detects the real tool: **pnpm, yarn, bun, npm, deno, pip, poetry, uv, pdm, pipenv, hatch, cargo, go, maven, gradle**
- Latest versions from **npm, crates.io, PyPI, the Go proxy and Maven Central** · outdated (patch / minor / major) · **version conflicts** across repos
- **Bump a version across repos** in one go — one PR or commit per repository, formatting kept

### 🧭 MANAGE

#### Repositories — the repository manager
- All repositories with full pagination and an **ETag cache** (re-syncs cost almost nothing against the rate limit)
- **Health score** and lifecycle (active, dormant, dead, empty, archived), filters, saved views, local tags, table + grid
- **Bulk actions**: archive / unarchive, private / public, delete, description, topics, clone to this computer
- **Cleanup presets** (Spring clean, Portfolio, Minimal), **create repository** (README, `.gitignore`, license or template), exports

#### Issues — a cross-repo issue inbox
- One list across all your repos, an organization or one repo · query builder ⇄ raw GitHub search syntax
- Views (assigned, mentioned, created, stale…) and saved views · keyboard triage (`J`/`K`, `X`, `E`, `L`, `A`, `M`)
- Full detail: Markdown, comments, **timeline events**, **reactions**, **sub-issues**, **pin**, **transfer**, lock
- **Issue templates** (Markdown and YAML issue forms) in the create dialog
- **Bulk triage** through the queue: close, reopen, label, assign, milestone, lock
- **Labels manager** with "sync labels from one repo to many" · **Milestones manager** · CSV / JSON export

#### Pull Requests — review across every repository
- Cross-repo PR inbox with CI status, review decision and mergeability per row
- Views: review requested, mine, failing checks, ready to merge, drafts · create PRs with live compare
- **Diff viewer** with inline review comments (multi-line ranges), **suggested changes** with one-click *Apply*, **batch reviews**
- Merge (merge / squash / rebase), **auto-merge**, update branch, draft ⇄ ready — in bulk through the queue

#### Collaborators — who has access to what
- Access scan across all your repos: **People**, **Repositories** and a **Matrix** view (people × repos)
- Invite, change role, revoke everywhere, copy access to other repos, **compare and align** two repos' access

#### Webhooks — every endpoint at a glance
- Hooks grouped by receiving URL across all repos, with delivery health (delivering / failing / paused)
- Add to more repos, edit everywhere, pause, remove, ping — in bulk · ~55 event types
- **Deliveries** with request / response, redeliver, failed-delivery report · **test push** · **HMAC signature verifier**

#### Secrets & Variables — GitHub Actions secrets at scale
- Secrets, variables and **environments** grouped by name across every repo, with **rotation age** and **drift**
- Set or rotate a secret on many repos at once — **sealed on your device** (libsodium-compatible), never written to disk
- Environment protection (wait timer, reviewers, deployment branches) · **usage finder** (which workflows use a secret)

#### Security — your security posture
- **Dependabot**, **code scanning** and **secret scanning** alerts across all repos, worst first, with CVSS and advisories
- **Fix plan**: one upgrade per package that clears all its alerts
- Posture grid with grades (A–F): Dependabot alerts, security updates, secret scanning, push protection, private reporting, CodeQL
- **Apply a baseline** to every repo · **Dependabot version-update config** generated per repo (one PR each)

#### Inbox — GitHub notifications, triaged
- Grouped by why (review requested, mention, assigned, security alert…) · **open / merged / closed** state on every row
- Mark read / done / mute in bulk, saved views, account / organization filter, optional **desktop alerts**
- **Watching** manager: see your loudest repos and unwatch many at once

#### Gists · Stars · Search
- **Gists**: create (secret by default), edit in place, revisions, **comments**, star
- **Stars**: everything you starred, **star lists**, bulk unstar, export as an *awesome list*
- **Search** repos, code, issues & PRs, commits and people · qualifier chips · **code results grouped per repo** · **saved searches**

#### Insights — analytics for your whole portfolio
- **Overview**: KPIs, languages, lifecycle mix, created per year, pushes per month, most starred, biggest
- **Checks**: tidy score, stale / empty / untouched forks / missing license or topics / "master" branch / **near-duplicate names**, all with bulk fixes — plus your own **custom rules**
- **Traffic**: views, unique visitors, clones and referrers — with a **local history beyond GitHub's 14 days** (90 days / 1 year)
- **People**: contributor stats with weekly activity

#### Code Audit — what is a repo made of?
- **Lines of code**, files, size, commits, lines added / removed over the whole history, people
- Language breakdown, monthly activity, a `tree`-style file tree with sizes and line counts (export as `.txt` / `.json`)
- **Most changed files**, **compare with an earlier audit**, and audit a **local folder** straight from disk

### 🚀 SHIP

#### Actions — GitHub Actions for every repo
- **Cross-repo CI board**: failing first, success rate, latest run per workflow, live while running
- Run sheet with jobs, steps and **logs** (opened at the first error, searchable) · re-run, re-run failed, cancel, artifacts
- **Run workflows by hand** with `workflow_dispatch` inputs read from the YAML · enable / disable
- **Workflow editor** with templates and live YAML checks · **add a workflow to many repos** at once

#### Releases — ship many repos at once
- **Release board**: latest release, downloads, drafts and **commits waiting since the last release**
- Next version suggested from conventional commits · generated notes · asset upload with progress
- **Bulk release** across repos · **scheduled / recurring releases**

#### Scheduler — automation that actually runs
- Hourly, daily, weekly or monthly schedules on a saved view, a cleanup preset, a tag or picked repos
- Every run **dry-runs first** and only touches repos where something would change · *ask me first* or *automatic*
- Missed runs are caught up **once** at the next start · runs from the tray with the window closed

#### Migration — rename and transfer safely
- **Bulk rename by rules** (prefix, suffix, find & replace with regex, case) with a validated plan
- **Transfer** to a user or organization, optionally renamed — with typed confirmation and checks at the destination

### ⚙ System
- **Queue**: persistent operations queue with **real dry run**, grace countdown, pause / resume / cancel / skip / retry, desktop notifications
- **Command palette** (`Ctrl`+`K`), shortcut sheet (`?`), `Ctrl`+`1…9` to jump between tabs, vim-style `J`/`K`
- **Multi-account** with an organization switcher, sign in with a **personal access token** or the **OAuth device flow**
- **Tray icon** and **start at login** · light / dark / system theme · accent colors · English + German
- Modules can be switched off in Settings and disappear from the whole app

---

## ✦ Safety first

Managing 200 repositories means one wrong click could hurt. ZIT-Suite is built so it can't:

| | |
|---|---|
| 🔑 **Token in your OS keychain** | Secret Service / KWallet on Linux, Credential Manager on Windows. Never in a JSON file, never sent to the UI. |
| 🧪 **Real dry run** | Before anything bulk runs, every repo is checked: *ready*, *no change* or *blocked* — and why. |
| ⏱ **Queue + grace period** | Actions wait in a persistent queue with a countdown; pause, cancel or skip at any time. Survives restarts. |
| ✍️ **Typed confirmation** | Deleting or transferring requires typing the name. |
| 🚫 **No force pushes** | Home never force-pushes; conflicts abort untouched unless you pick a side. |
| 🔒 **Secrets sealed on-device** | Actions secrets are encrypted locally with each repo's public key and never written to disk. |
| 🛡 **Locked-down app** | Strict Content-Security-Policy, minimal Tauri capabilities, no telemetry. |

---

## ✦ Install

> **Version 0.1.0** — Linux and Windows.

> [!IMPORTANT]
> **Precompiled installers are only available on the official website: [zsync.eu/zit-suite](https://zsync.eu/zit-suite/#download).**
> This GitHub repository contains the **source code only** — there are no prebuilt binaries in GitHub Releases.
> Building it yourself from source is welcome (see [Build from source](#-build-from-source)); for ready-to-install
> files, use the website. Builds from anywhere else are not official.

1. Download the installer for your system from the **[ZIT-Suite homepage](https://zsync.eu/zit-suite/#download)**:

   | System | File | Install |
   |---|---|---|
   | Windows 10 / 11 (64-bit) | `ZIT-Suite_0.1.0_x64-setup.exe` | run the installer |
   | Debian, Ubuntu, Linux Mint, Pop!_OS | `ZIT-Suite_0.1.0_amd64.deb` | `sudo apt install ./ZIT-Suite_0.1.0_amd64.deb` |
   | Fedora, openSUSE, RHEL | `ZIT-Suite-0.1.0-1.x86_64.rpm` | `sudo dnf install ./ZIT-Suite-0.1.0-1.x86_64.rpm` |

   …or [build it yourself from source](#-build-from-source) — the only alternative to the website.
2. Start ZIT-Suite and sign in with a **GitHub personal access token** (classic) or the device flow.

**Token scopes** ZIT-Suite asks for (it tells you exactly which features a missing scope affects):

`repo` · `delete_repo` · `workflow` · `read:org` · `read:user` · `notifications` · `gist` · `admin:repo_hook`

---

## ✦ Build from source

You don't need a prebuilt file to use ZIT-Suite — this repository has everything to build it yourself.
(Ready-made installers come **only** from [zsync.eu/zit-suite](https://zsync.eu/zit-suite/#download).)

**Requirements:** [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 20+, [pnpm](https://pnpm.io) 9+,
and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS
(Linux: `webkit2gtk-4.1`, `libayatana-appindicator` for the tray, `librsvg`; Windows: WebView2 + MSVC build tools).

```bash
git clone https://github.com/TheHolyOneZ/ZIT-Suite.git
cd ZIT-Suite
pnpm install

pnpm tauri dev        # run the app in development (also regenerates src/bindings.ts)
pnpm tauri build      # build installers into src-tauri/target/release/bundle
```

Optional: bake a default OAuth client ID for the device-flow sign-in into the build:

```bash
ZIT_GITHUB_CLIENT_ID=your_client_id pnpm tauri build
```

**Checks** (the same ones CI runs on Linux and Windows):

```bash
pnpm check                         # typecheck + lint + i18n parity + tests
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

---

## ✦ Architecture

| Layer | Technology |
|---|---|
| Desktop shell | **Tauri 2** (Rust) — tray, autostart, single instance, window state, notifications |
| Backend | **Rust**: `reqwest` (rustls) GitHub REST + GraphQL client with pagination, ETag cache and rate-limit tracking · `git2` (libgit2) · `keyring` · `crypto_box` · `tokio` |
| IPC | **tauri-specta** — typed TypeScript bindings generated from Rust, errors as translatable codes |
| Frontend | **React 19**, **TypeScript** (strict), **Vite**, **Tailwind CSS 4**, TanStack Query, Zustand, CodeMirror 6, Framer Motion |
| i18n | **i18next** — JSON per module, typed keys, parity check in CI |
| Tests | Vitest + `cargo test`, clippy with `-D warnings`, CI on `ubuntu-latest` and `windows-latest` |

**Modular by design** — every tab is a folder in `src/modules/<id>/` whose `index.ts` default-exports
`defineModule({...})`. The pillar bar, command palette, shortcuts, status bar and Settings page are all derived
from that registry: adding a tab means adding a folder. The Rust side mirrors it with one `github/<area>.rs` and
one `commands/<area>.rs` per area.

**Adding a language** means adding JSON files: `src/locales/<lng>/*.json` for the shell and
`src/modules/<id>/locales/<lng>.json` per module — `pnpm i18n:check` reports anything missing.

**Platforms** — OS-specific code lives in `src-tauri/src/platform.rs` and `src/core/platform.ts` only.

```
src/
  app/        shell: title block, pillar bar, command palette, sheets
  core/       module registry, i18n, theme, IPC, keyboard, stores
  ui/         design-system primitives
  modules/    one folder per tab (home, repos, issues, pulls, actions, releases, …)
src-tauri/src/
  github/     GitHub API per area      commands/   IPC commands per area
  queue/      queue engine + dry run   workspace/  built-in Git (Home)
  auth/       keychain, device flow    platform.rs OS-specific code
```

---

## ✦ FAQ

<details>
<summary><b>Is ZIT-Suite free?</b></summary>

Yes. ZIT-Suite is free and open source under the **GNU General Public License v3.0**.
</details>

<details>
<summary><b>Where do I get the installer? Why are there no GitHub Releases?</b></summary>

Precompiled installers (`.exe`, `.deb`, `.rpm`) are published **only** on the official website,
[zsync.eu/zit-suite](https://zsync.eu/zit-suite/#download). GitHub hosts the source code — you're free to build it
yourself from there. Installers offered anywhere else are not official.
</details>

<details>
<summary><b>Do I need Git installed?</b></summary>

No. Home uses **libgit2** built into the app — cloning, committing, pushing, pulling, branches, stashes and merges
all work without a `git` executable.
</details>

<details>
<summary><b>Does it work on Windows and Linux? What about macOS?</b></summary>

Linux and Windows are supported and tested in CI. The code is cross-platform (Tauri), so macOS builds are
possible but not officially tested yet.
</details>

<details>
<summary><b>Where is my GitHub token stored?</b></summary>

In your operating system's keychain (Secret Service / KWallet on Linux, Windows Credential Manager). It never
leaves the Rust backend and is never written to a file.
</details>

<details>
<summary><b>Can it accidentally delete my repositories?</b></summary>

Every destructive action goes through the queue: a dry run shows what will happen per repository, deleting and
transferring need the name typed out, and a grace countdown lets you cancel. Nothing runs behind your back.
</details>

<details>
<summary><b>How does it handle GitHub's rate limit?</b></summary>

Lists are cached with ETags and conditional requests (answers that didn't change don't count), GraphQL is used
where one request can replace hundreds, and the remaining budget is always visible in the status bar.
</details>

<details>
<summary><b>How is this related to ZRepoManager?</b></summary>

ZIT-Suite is the ground-up rebuild of [ZRepoManager](https://github.com/TheHolyOneZ/RepositoryManager): every old
feature is back, stubbed features now really work, and it adds Home, Insights, Security, Actions, Releases,
Search, Inbox, Code Audit and much more. See the [Roadmap](ROADMAP.md) for the full list.
</details>

---

## ✦ Contributing

Issues and pull requests are welcome. Please run `pnpm check` and `cargo test` before opening a PR, keep all UI
text in the locale JSON files (English + German), and route anything bulk or destructive through the queue.
The [Roadmap](ROADMAP.md) lists what each tab does and what's still open.

## ✦ Links

| | |
|---|---|
| 🌐 **Homepage & downloads** | [zsync.eu/zit-suite](https://zsync.eu/zit-suite/) |
| 💻 **Source code** | [github.com/TheHolyOneZ/ZIT-Suite](https://github.com/TheHolyOneZ/ZIT-Suite) |
| 👤 **Author** | [TheHolyOneZ](https://github.com/TheHolyOneZ) |
| 🧩 **More projects** | [zsync.eu](https://zsync.eu) |
| 🎮 **Game mods** | [zlogic.eu](https://zlogic.eu) |

## ✦ License

**GPL-3.0** © [TheHolyOneZ](https://github.com/TheHolyOneZ) — see [LICENSE](LICENSE).

<div align="center">
<br>
<img src="docs/logo.png" alt="ZIT-Suite" width="48">
<br>
<sub><b>ZIT-Suite</b> — Build. Manage. Ship. · GitHub repository manager · bulk GitHub actions · Git GUI for Linux and Windows</sub>
</div>
