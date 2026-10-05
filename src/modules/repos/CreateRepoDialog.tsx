import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { FolderPlus, Globe, Lock } from "lucide-react";
import { commands, unwrap } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { useRepoList } from "@/core/data/repos";
import { useActiveAccount } from "@/core/store/session";
import { toast } from "@/core/store/toasts";
import { useOrgs } from "@/app/AccountMenu";
import { Button, Checkbox, Dialog, Input, Label, Segmented, Select } from "@/ui";
import { refreshRepos } from "./api";
import { openRepo } from "./RepoSheet";

const validName = (n: string) =>
  !!n && n.length <= 100 && n !== "." && n !== ".." && /^[A-Za-z0-9._-]+$/.test(n);


export function CreateRepoDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["repos", "common"]);
  const me = useActiveAccount()?.login ?? "";
  const orgs = useOrgs().data ?? [];
  const { data: repos = [] } = useRepoList();
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setPrivate] = useState(true);
  const [start, setStart] = useState<"empty" | "template">("empty");
  const [readme, setReadme] = useState(true);
  const [gitignore, setGitignore] = useState("");
  const [license, setLicense] = useState("");
  const [template, setTemplate] = useState("");
  const [allBranches, setAllBranches] = useState(false);
  const [busy, setBusy] = useState(false);
  const gi = useQuery({
    queryKey: ["repos", "gitignore"],
    queryFn: () => unwrap(commands.reposGitignoreTemplates()),
    staleTime: Infinity,
    enabled: start === "empty",
  });
  const lic = useQuery({
    queryKey: ["repos", "licenses"],
    queryFn: () => unwrap(commands.reposLicenses()),
    staleTime: Infinity,
    enabled: start === "empty",
  });
  const templates = useMemo(
    () =>
      repos
        .filter((r) => r.is_template)
        .map((r) => r.full_name)
        .sort(),
    [repos],
  );
  const n = name.trim().replace(/\s+/g, "-");
  const fullName = `${owner || me}/${n}`;
  const taken = repos.some((r) => r.full_name.toLowerCase() === fullName.toLowerCase());
  const ok = validName(n) && !taken && (start === "empty" || !!template);

  const create = async () => {
    setBusy(true);
    try {
      const r = await unwrap(
        commands.reposCreate({
          name: n,
          description,
          private: isPrivate,
          org: owner || null,
          template: start === "template" ? template : null,
          all_branches: allBranches,
          readme: start === "empty" && readme,
          gitignore: start === "empty" && gitignore ? gitignore : null,
          license: start === "empty" && license ? license : null,
        }),
      );
      toast({ kind: "success", title: t("create.done", { name: r.full_name }) });
      onClose();

      await refreshRepos();
      openRepo(r.full_name, r.name);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      width={620}
      kicker={t("title")}
      title={t("create.title")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={FolderPlus}
            loading={busy}
            disabled={!ok}
            onClick={() => void create()}
          >
            {t("create.button")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-3">
          <div>
            <Label>{t("create.owner")}</Label>
            <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">{me}</option>
              {orgs.map((o) => (
                <option key={o.login} value={o.login}>
                  {o.login}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t("create.name")}</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-new-tool"
              className="num"
            />
            {n && !validName(n) && <p className="mt-1 text-[11.5px] text-warn">{t("create.badName")}</p>}
            {taken && <p className="mt-1 text-[11.5px] text-warn">{t("create.taken")}</p>}
            {n !== name.trim() && validName(n) && (
              <p className="mt-1 text-[11.5px] text-faint">{t("create.becomes", { name: n })}</p>
            )}
          </div>
        </div>
        <div>
          <Label>{t("create.description")}</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("create.descriptionPlaceholder")}
          />
        </div>
        <div>
          <Label>{t("create.visibility")}</Label>
          <Segmented<string>
            value={isPrivate ? "private" : "public"}
            onChange={(v) => setPrivate(v === "private")}
            options={[
              { value: "private", label: t("create.private"), icon: Lock },
              { value: "public", label: t("create.public"), icon: Globe },
            ]}
          />
          {!isPrivate && <p className="mt-1 text-[11.5px] text-warn">{t("create.publicNote")}</p>}
        </div>
        <div>
          <Label>{t("create.start")}</Label>
          <Segmented<"empty" | "template">
            value={start}
            onChange={setStart}
            options={[
              { value: "empty", label: t("create.empty") },
              { value: "template", label: t("create.fromTemplate", { count: templates.length }) },
            ]}
          />
        </div>
        {start === "empty" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-end pb-2">
              <Checkbox
                checked={readme}
                onChange={setReadme}
                label={<span className="text-[12.5px]">{t("create.readme")}</span>}
              />
            </div>
            <div>
              <Label>.gitignore</Label>
              <Select value={gitignore} onChange={(e) => setGitignore(e.target.value)}>
                <option value="">{t("create.none")}</option>
                {(gi.data ?? []).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("create.license")}</Label>
              <Select value={license} onChange={(e) => setLicense(e.target.value)}>
                <option value="">{t("create.none")}</option>
                {(lic.data ?? []).map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : templates.length ? (
          <div className="space-y-2">
            <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">{t("create.pickTemplate")}</option>
              {templates.map((tp) => (
                <option key={tp} value={tp}>
                  {tp}
                </option>
              ))}
            </Select>
            <Checkbox
              checked={allBranches}
              onChange={setAllBranches}
              label={<span className="text-[12.5px]">{t("create.allBranches")}</span>}
            />
          </div>
        ) : (
          <p className="text-[12px] text-faint">{t("create.noTemplates")}</p>
        )}
      </div>
    </Dialog>
  );
}
