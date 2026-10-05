import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitPullRequest } from "lucide-react";
import { commands, unwrap } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { cn } from "@/core/cn";
import { useRepoList } from "@/core/data/repos";
import { toast } from "@/core/store/toasts";
import { RepoChecklist } from "@/app/RepoChecklist";
import { Button, Checkbox, Dialog, Label, Mark, Segmented } from "@/ui";
import { dependabotYml, detectTargets, type Interval } from "./dependabot";

type State = { s: "running" | "done" | "skipped" | "failed"; note?: string };
const PATH = ".github/dependabot.yml";


export function DependabotDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["security", "common"]);
  const { data = [] } = useRepoList();
  const writable = useMemo(
    () =>
      data
        .filter((r) => !r.archived && r.permissions?.push && r.default_branch)
        .map((r) => r.full_name)
        .sort(),
    [data],
  );
  const [repos, setRepos] = useState<Set<string>>(new Set());
  const [interval, setInterval] = useState<Interval>("weekly");
  const [group, setGroup] = useState(true);
  const [status, setStatus] = useState<Record<string, State>>({});
  const [running, setRunning] = useState(false);
  const picked = [...repos].filter((r) => writable.includes(r));
  const done = Object.keys(status).length > 0 && picked.every((r) => status[r] && status[r].s !== "running");

  const run = async () => {
    setRunning(true);
    let ok = 0;
    for (const repo of picked) {
      setStatus((c) => ({ ...c, [repo]: { s: "running" } }));
      try {
        const base = data.find((r) => r.full_name === repo)!.default_branch!;
        const tree = await unwrap(commands.filesTree(repo, base, true));
        if (tree.items.some((i) => i.path === PATH || i.path === ".github/dependabot.yaml")) {
          setStatus((c) => ({ ...c, [repo]: { s: "skipped", note: t("dependabot.exists") } }));
          continue;
        }
        const targets = detectTargets(tree.items.filter((i) => i.kind === "blob").map((i) => i.path));
        if (!targets.length) {
          setStatus((c) => ({ ...c, [repo]: { s: "skipped", note: t("dependabot.nothing") } }));
          continue;
        }
        const branch = "zit/dependabot-config";
        const message = t("dependabot.message");
        await unwrap(
          commands.filesCommit(repo, branch, tree.commit, true, message, [
            { kind: "text", path: PATH, text: dependabotYml(targets, interval, group), executable: null },
          ]),
        );
        const pr = await unwrap(
          commands.pullsCreate(repo, {
            title: message,
            head: branch,
            base,
            body: t("dependabot.prBody", {
              list: targets.map((x) => `${x.ecosystem} ${x.directory}`).join(", "),
            }),
            draft: false,
          }),
        );
        setStatus((c) => ({
          ...c,
          [repo]: {
            s: "done",
            note: `#${pr.number} · ${targets
              .map((x) => x.ecosystem)
              .filter((v, i, a) => a.indexOf(v) === i)
              .join(", ")}`,
          },
        }));
        ok++;
      } catch (e) {
        setStatus((c) => ({ ...c, [repo]: { s: "failed", note: errorMessage(e) } }));
      }
    }
    setRunning(false);
    if (ok) toast({ kind: "success", title: t("dependabot.finished", { count: ok }) });
  };
  const glyph = (s?: State["s"]) =>
    s === "done"
      ? "tick"
      : s === "failed"
        ? "cross"
        : s === "skipped"
          ? "skip"
          : s === "running"
            ? "running"
            : "pending";
  const tone = (s?: State["s"]) =>
    s === "done" ? "ok" : s === "failed" ? "danger" : s === "running" ? "accent" : "idle";

  return (
    <Dialog
      open
      onClose={running ? () => undefined : onClose}
      width={760}
      kicker={t("title")}
      title={t("dependabot.title")}
      footer={
        <>
          <span className="mr-auto text-[11.5px] text-faint">{t("dependabot.note")}</span>
          <Button variant="ghost" disabled={running} onClick={onClose}>
            {done ? t("common:actions.close") : t("common:actions.cancel")}
          </Button>
          {!done && (
            <Button
              variant="primary"
              icon={GitPullRequest}
              loading={running}
              disabled={!picked.length}
              onClick={() => void run()}
            >
              {t("dependabot.run", { count: picked.length })}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div>
            <Label>{t("dependabot.interval")}</Label>
            <Segmented<Interval>
              size="sm"
              value={interval}
              onChange={setInterval}
              options={(["daily", "weekly", "monthly"] as const).map((v) => ({
                value: v,
                label: t(`dependabot.${v}`),
              }))}
            />
          </div>
          <Checkbox
            checked={group}
            onChange={setGroup}
            label={<span className="text-[12.5px]">{t("dependabot.group")}</span>}
          />
          <p className="text-[11.5px] text-faint">{t("dependabot.detects")}</p>
        </div>
        {Object.keys(status).length === 0 ? (
          <RepoChecklist
            repos={writable}
            value={repos}
            onChange={setRepos}
            title={t("dependabot.repos", { count: picked.length })}
            height={380}
          />
        ) : (
          <div className="max-h-[420px] overflow-y-auto rounded-[var(--radius)] border border-line">
            {picked.map((r) => (
              <div
                key={r}
                className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[12px] last:border-b-0"
              >
                <Mark glyph={glyph(status[r]?.s)} tone={tone(status[r]?.s)} size={10} />
                <span className="num min-w-0 flex-1 truncate">{r}</span>
                {status[r]?.note && (
                  <span
                    className={cn(
                      "max-w-[220px] truncate text-[11px]",
                      status[r].s === "failed" ? "text-danger" : "text-faint",
                    )}
                    title={status[r].note}
                  >
                    {status[r].note}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
