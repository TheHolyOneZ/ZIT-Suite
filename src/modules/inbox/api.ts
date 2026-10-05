import { useQuery } from "@tanstack/react-query";
import { commands, unwrap, type InboxAction, type Thread } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { queryClient } from "@/core/query";
import { useScopeKey } from "@/core/store/session";
import { useInboxPrefs, useInboxUi, type InboxView } from "./store";

export const inboxKey = (scope: string[], view: InboxView) => ["inbox", ...scope, view] as const;


export function useSubjectStates(threads: Thread[]): Map<string, string> {
  const refs = threads
    .filter((t) => t.number != null && (t.kind === "Issue" || t.kind === "PullRequest"))
    .map((t) => ({ repo: t.repo, number: t.number! }))
    .sort((a, b) => `${a.repo}#${a.number}`.localeCompare(`${b.repo}#${b.number}`));
  const q = useQuery({
    queryKey: ["inbox-states", refs.map((r) => `${r.repo}#${r.number}`).join(",")],
    queryFn: () => unwrap(commands.inboxStates(refs)),
    enabled: refs.length > 0,
    staleTime: 60_000,
  });
  return new Map((q.data ?? []).map((s) => [`${s.repo}#${s.number}`, s.state]));
}


export function useInbox() {
  const scope = useScopeKey();
  const view = useInboxPrefs((s) => s.view);
  return useQuery({
    queryKey: inboxKey(scope, view),
    queryFn: () => unwrap(commands.inboxList(view === "all", view === "participating", takeFresh())),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
}


export function useUnreadCount() {
  const scope = useScopeKey();
  const q = useQuery({
    queryKey: inboxKey(scope, "unread"),
    queryFn: () => unwrap(commands.inboxList(false, false, takeFresh())),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
  return { count: q.data?.filter((t) => t.unread).length ?? 0, data: q.data };
}


export async function act(ids: string[], action: InboxAction) {
  if (!ids.length) return;
  const snapshot = queryClient.getQueriesData<Thread[]>({ queryKey: ["inbox"] });
  const hit = new Set(ids);
  queryClient.setQueriesData<Thread[]>({ queryKey: ["inbox"] }, (d) =>
    action === "read"
      ? d?.map((t) => (hit.has(t.id) ? { ...t, unread: false } : t))
      : d?.filter((t) => !hit.has(t.id)),
  );
  useInboxUi.getState().set({ selected: new Set() });
  try {
    const failed = await unwrap(commands.inboxAct(ids, action));
    if (failed.length) {
      for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    }
  } catch (e) {
    for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
    toastError(e);
  }
}

export async function readAll(repo: string | null) {
  queryClient.setQueriesData<Thread[]>({ queryKey: ["inbox"] }, (d) =>
    d?.map((t) => (!repo || t.repo === repo ? { ...t, unread: false } : t)),
  );
  try {
    await unwrap(commands.inboxReadAll(repo, new Date().toISOString()));
  } catch (e) {
    toastError(e);
  }

  setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["inbox"] }), 4000);
}


let freshNext = false;
const takeFresh = () => {
  const f = freshNext;
  freshNext = false;
  return f;
};
export function refreshInbox() {
  freshNext = true;
  return queryClient.invalidateQueries({ queryKey: ["inbox"] });
}

export const useWatched = (enabled: boolean) =>
  useQuery({
    queryKey: ["inbox", "watched"],
    queryFn: () => unwrap(commands.watchedList(false)),
    enabled,
    staleTime: 60_000,
  });
