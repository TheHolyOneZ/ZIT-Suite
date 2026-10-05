import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Building2, Check, ChevronDown, LogOut, Plus, User } from "lucide-react";
import { commands, unwrap } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { useActiveAccount, useSession } from "@/core/store/session";

import { Avatar, MenuItem, MenuLabel, MenuSeparator, Popover, useConfirmClick } from "@/ui";
import { signOut, switchAccount } from "@/modules/auth/api";

export function useOrgs() {
  const active = useSession((s) => s.session?.active);
  return useQuery({
    queryKey: ["orgs", active],
    queryFn: () => unwrap(commands.orgsList()),
    enabled: !!active,
    staleTime: 5 * 60_000,
  });
}


export function AccountMenu() {
  const { t } = useTranslation();
  const account = useActiveAccount();
  const accounts = useSession((s) => s.session?.accounts ?? []);
  const org = useSession((s) => s.org);
  const setOrg = useSession((s) => s.setOrg);
  const setAdding = useSession((s) => s.setAddingAccount);
  const orgs = useOrgs();
  const orgAvatar = orgs.data?.find((o) => o.login === org)?.avatar_url;

  const run = (fn: () => Promise<void>) => fn().catch((e) => toastError(e));

  return (
    <Popover
      placement="bottom-end"
      className="w-[260px]"
      trigger={(p) => (
        <button
          {...p}
          title={org ?? account?.login}
          className="flex h-8 items-center gap-2 rounded-[var(--radius)] border border-line px-1.5 pr-2 text-[12px] hover:border-line-strong hover:bg-surface-2 cursor-default"
        >
          <Avatar src={org ? orgAvatar : account?.avatar_url} alt={org ?? account?.login ?? "?"} size={20} />
          <span className="num max-w-[160px] truncate">
            {account?.login}
            {org && <span className="text-faint"> › {org}</span>}
          </span>
          <ChevronDown size={12} className="text-faint" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>{t("account.accounts")}</MenuLabel>
          {accounts.map((a) => (
            <MenuItem
              key={a.id}
              active={a.id === account?.id}
              trailing={a.id === account?.id ? <Check size={13} className="text-accent" /> : null}
              onClick={() => {
                close();
                if (a.id !== account?.id) run(() => switchAccount(a.id));
              }}
            >
              <span className="flex items-center gap-2">
                <Avatar src={a.avatar_url} alt={a.login} size={16} />
                {a.login}
              </span>
            </MenuItem>
          ))}
          <MenuItem icon={Plus} onClick={() => (close(), setAdding(true))}>
            {t("account.add")}
          </MenuItem>

          <MenuSeparator />
          <MenuLabel>{t("account.context")}</MenuLabel>
          <MenuItem icon={User} active={!org} trailing={!org ? <Check size={13} className="text-accent" /> : null} onClick={() => (close(), setOrg(null))}>
            {t("account.personal")}
          </MenuItem>
          {orgs.isLoading && <div className="px-2 py-2 text-[12px] text-faint">{t("states.loading")}</div>}
          {orgs.data?.map((o) => (
            <MenuItem
              key={o.login}
              icon={Building2}
              active={org === o.login}
              trailing={org === o.login ? <Check size={13} className="text-accent" /> : null}
              onClick={() => (close(), setOrg(o.login))}
            >
              {o.login}
            </MenuItem>
          ))}

          {account && (
            <>
              <MenuSeparator />
              <SignOutItem login={account.login} onConfirm={() => (close(), run(() => signOut(account.id)))} />
            </>
          )}
        </>
      )}
    </Popover>
  );
}

function SignOutItem({ login, onConfirm }: { login: string; onConfirm: () => void }) {
  const { t } = useTranslation();
  const { armed, onClick } = useConfirmClick(onConfirm);
  return (
    <MenuItem icon={LogOut} danger onClick={onClick}>
      {armed ? t("account.confirmSignOut") : t("account.signOut", { login })}
    </MenuItem>
  );
}
