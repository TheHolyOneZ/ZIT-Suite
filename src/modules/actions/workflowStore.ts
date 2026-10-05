import { commands, unwrap, type Change } from "@/core/ipc";
import type { WorkflowStore } from "@/modules/home/WorkflowEditor";

type T = (k: string, o?: Record<string, unknown>) => string;


async function commitTo(repo: string, branch: string, message: string, changes: Change[]) {
  const tree = await unwrap(commands.filesTree(repo, branch, true));
  return unwrap(commands.filesCommit(repo, branch, tree.commit, false, message, changes));
}


export function githubStore(repo: string, branch: string, t: T): WorkflowStore {
  return {
    load: async (path) => ({ text: await unwrap(commands.actionsSource(repo, path, branch)), copy: false }),
    save: async (name, content, oldPath) => {
      const path = `.github/workflows/${name}`;
      const changes: Change[] = [{ kind: "text", path, text: content, executable: null }];
      if (oldPath && oldPath !== path) changes.push({ kind: "delete", path: oldPath });
      const message = !oldPath
        ? t("wf.msgAdd", { name })
        : oldPath !== path
          ? t("wf.msgRename", { from: oldPath.split("/").pop(), name })
          : t("wf.msgUpdate", { name });
      await commitTo(repo, branch, message, changes);
      return path;
    },
    remove: async (path) =>
      void (await commitTo(repo, branch, t("wf.msgDelete", { name: path.split("/").pop() }), [
        { kind: "delete", path },
      ])),
    text: {
      note: t("wf.note", { branch }),
      add: t("wf.add", { branch }),
      save: t("wf.save", { branch }),
      saved: (path, added) => (added ? t("wf.added", { path }) : t("wf.saved", { path })),
      savedBody: t("wf.savedBody"),
      deleted: (path) => t("wf.deleted", { path }),
    },
  };
}
