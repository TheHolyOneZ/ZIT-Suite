import { useMemo } from "react";
import { useRepoList as useRepos } from "@/core/data/repos";
import { useQuery } from "@tanstack/react-query";
import { commands, unwrap } from "@/core/ipc";
import { useScopeKey } from "@/core/store/session";
import { useModuleSetting } from "@/core/store/moduleSettings";
import { computeHealth } from "./health";
import { applyFilter, type RepoRow } from "./filters";
import { useReposPrefs, useReposUi } from "./store";

export { refreshRepos, useRepoList as useRepos } from "@/core/data/repos";


export function useRepoRows(): { rows: RepoRow[]; query: ReturnType<typeof useRepos> } {
  const query = useRepos();
  const activeDays = useModuleSetting<number>("repos", "activeDays");
  const dormantDays = useModuleSetting<number>("repos", "dormantDays");
  const tags = useReposPrefs((s) => s.tags);
  const rows = useMemo(() => {
    const now = Date.now();
    return (query.data ?? []).map((repo) => ({
      repo,
      health: computeHealth(repo, { activeDays, dormantDays }, now),
      tags: tags[repo.full_name] ?? [],
    }));
  }, [query.data, activeDays, dormantDays, tags]);
  return { rows, query };
}

export function useVisibleRows() {
  const { rows, query } = useRepoRows();
  const filter = useReposUi((s) => s.filter);
  const sort = useReposPrefs((s) => s.sort);
  const visible = useMemo(() => applyFilter(rows, filter, sort), [rows, filter, sort]);
  return { rows, visible, query };
}

export function useLanguages(fullName: string | null) {
  const scope = useScopeKey();
  return useQuery({
    queryKey: ["repos", ...scope, "languages", fullName],
    queryFn: () => unwrap(commands.reposLanguages(fullName!)),
    enabled: !!fullName,
    staleTime: 10 * 60_000,
  });
}
