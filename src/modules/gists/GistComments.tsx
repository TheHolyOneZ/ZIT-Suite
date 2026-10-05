import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { commands, unwrap, type Comment } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { queryClient } from "@/core/query";
import { useActiveAccount } from "@/core/store/session";
import { Button, IconButton, Markdown, MarkdownEditor, Panel, Plotter, RelTime, useConfirmClick } from "@/ui";

const key = (id: string) => ["gist", id, "comments"];


export function GistComments({ id, owner }: { id: string; owner: string }) {
  const { t } = useTranslation("gists");
  const me = useActiveAccount()?.login;
  const q = useQuery({
    queryKey: key(id),
    queryFn: () => unwrap(commands.gistComments(id)),
    staleTime: 30_000,
  });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const c = await unwrap(commands.gistCommentAdd(id, body));
      queryClient.setQueryData<Comment[]>(key(id), (d) => [...(d ?? []), c]);
      setBody("");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const list = q.data ?? [];
  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-line px-3 py-2">
        <span className="annot">{t("comments.title", { count: list.length })}</span>
      </div>
      {q.isLoading && <Plotter />}
      {q.error && <div className="px-3 py-2 text-[12px] text-danger">{errorMessage(q.error)}</div>}
      {list.map((c) => (
        <div key={c.id} className="group border-b border-line px-3 py-2.5">
          <div className="mb-1 flex items-center gap-2 text-[11.5px]">
            {c.user.avatar_url && <img src={c.user.avatar_url} alt="" className="size-4 rounded-full" />}
            <span className="font-medium">{c.user.login}</span>
            <span className="text-faint">
              <RelTime at={c.created_at} />
            </span>
            {(c.user.login === me || owner === me) && <DeleteComment id={id} comment={c.id} />}
          </div>
          <Markdown source={c.body} className="text-[12.5px]" />
        </div>
      ))}
      <div className="space-y-2 p-3">
        <MarkdownEditor
          value={body}
          onChange={setBody}
          onSubmit={() => void send()}
          placeholder={t("comments.placeholder")}
          minRows={3}
        />
        <div className="flex justify-end">
          <Button size="sm" variant="primary" disabled={!body.trim() || busy} onClick={() => void send()}>
            {t("comments.send")}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function DeleteComment({ id, comment }: { id: string; comment: number }) {
  const { t } = useTranslation("gists");
  const confirm = useConfirmClick(async () => {
    try {
      await unwrap(commands.gistCommentDelete(id, comment));
      queryClient.setQueryData<Comment[]>(key(id), (d) => d?.filter((c) => c.id !== comment));
    } catch (e) {
      toastError(e);
    }
  });
  return (
    <IconButton
      icon={Trash2}
      size={12}
      label={confirm.armed ? t("comments.confirmDelete") : t("comments.delete")}
      className={
        confirm.armed ? "ml-auto size-6 text-danger" : "ml-auto size-6 opacity-0 group-hover:opacity-100"
      }
      onClick={confirm.onClick}
    />
  );
}
