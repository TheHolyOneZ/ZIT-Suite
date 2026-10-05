import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { cn } from "@/core/cn";


export const Markdown = memo(function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn("md", className)} data-selectable>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href && /^https?:/.test(href)) void openUrl(href);
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});


export function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  placeholder,
  minRows = 5,
  autoFocus,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  minRows?: number;
  autoFocus?: boolean;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"write" | "preview">("write");
  const tabCls = (on: boolean) =>
    cn("h-7 px-3 text-[12px] cursor-default border-b-2 -mb-px", on ? "border-accent text-text" : "border-transparent text-dim hover:text-text");
  return (
    <div className="rounded-[var(--radius)] border border-line-strong bg-surface focus-within:border-accent">
      <div className="flex items-center border-b border-line px-1">
        <button type="button" className={tabCls(tab === "write")} onClick={() => setTab("write")}>
          {t("markdown.write")}
        </button>
        <button type="button" className={tabCls(tab === "preview")} onClick={() => setTab("preview")}>
          {t("markdown.preview")}
        </button>
        <span className="ml-auto pr-2 text-[10.5px] text-faint">{t("markdown.hint")}</span>
      </div>
      {tab === "write" ? (
        <textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          value={value}
          rows={minRows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && onSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
          className="num block w-full resize-y bg-transparent px-3 py-2 text-[12.5px] leading-relaxed text-text outline-none placeholder:text-faint"
        />
      ) : (
        <div className="min-h-[96px] px-3 py-2">
          {value.trim() ? <Markdown source={value} /> : <span className="text-[12px] text-faint">{t("markdown.nothing")}</span>}
        </div>
      )}
    </div>
  );
}
