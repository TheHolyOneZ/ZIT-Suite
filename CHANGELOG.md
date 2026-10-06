# Changelog

All notable changes to **ZIT-Suite** are listed here. Versions follow [Semantic Versioning](https://semver.org/).

Precompiled installers for every version are available **only** on the official website:
**[zsync.eu/zit-suite](https://zsync.eu/zit-suite/#download)**.

---

## [0.2.0] — 2026-10-06

### Added
- **Upload tab (BUILD)** — "upload and forget", like the old ZRepoManager:
  - pick a repository, a branch and a folder on your computer (optionally into a subfolder of the repo)
  - every file is compared with GitHub and marked **new**, **changed** or **same**; new and changed files are ticked for you
  - tick or untick single files or whole folders (tri-state tree), quick buttons *New & changed* / *All* / *None*, *Show unchanged*
  - commit message (suggested from your selection) plus an optional description
  - everything goes up as **one commit**, with a progress bar; empty repositories get a single first commit
  - `.gitignore`, `node_modules`, `target`, `.git` and other junk are skipped; executable files keep their executable bit
  - recent repository + folder pairs are remembered for one-click repeat uploads
- **Home → History: "Undo from here"** — take back a version and every newer one while they're only on your computer. The files stay exactly as they are and come back as unsaved changes, so your next *Save version* is one clean commit. Works down to the very first version.

### Fixed
- **Home: "Get latest" / "Upload" loop.** When a project's files weren't saved as a version yet (a fresh project, after a reset, or after uploading files on GitHub's website), *Get latest* failed with "conflict prevents checkout" — even for identical files — and *Upload* asked to get latest first. Now:
  - with nothing saved locally, *Get latest* adopts GitHub's history without touching your files: identical files are simply up to date, different files stay as your changes, files only on GitHub are added
  - unsaved files that are identical to GitHub's never block anything; if they differ, you get a clear message naming them
  - *Upload* with nothing saved says "Nothing to upload yet — save a version first"

---

## [0.1.0] — 2026-10-05

First public release — a ground-up rebuild of ZRepoManager.

### Highlights
- **BUILD** — Home (built-in Git: save versions, upload, get latest, branches, per-file diffs, park changes, undo last save, conflict helper, automatic saves from the tray), Files & Editor (edit any repository on GitHub as one atomic commit), Branches (ahead/behind, cleanup, rename, protection, rulesets editor), Dependencies (every package across every repo, outdated versions, conflicts, bulk version bumps)
- **MANAGE** — Repositories (health scores, filters, saved views, bulk actions with a real dry run, cleanup presets), Issues and Pull Requests (cross-repo inboxes, timeline, reactions, sub-issues, suggested changes, batch reviews, bulk triage), Collaborators, Webhooks, Secrets & Variables, Security, Inbox, Gists, Stars, Search, Insights (tidy checks, custom rules, traffic history, contributor stats), Code Audit
- **SHIP** — Actions (cross-repo CI board, logs, re-runs, workflow editor), Releases (release board, next version from your commits, bulk and scheduled releases), Scheduler, Migration
- **Safety** — token in the OS keychain, persistent queue with real dry run and grace countdown, typed confirmation for deletes and transfers, no force pushes, secrets sealed on-device, no telemetry
- **Workbench** — command palette, keyboard-first, light / dark / system theme, accent colors, English and German, tray icon and start at login, Linux and Windows

[0.2.0]: https://zsync.eu/zit-suite/
[0.1.0]: https://zsync.eu/zit-suite/
