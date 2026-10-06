import { Children, isValidElement, useEffect, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/core/cn";
import { Popover } from "./Popover";

type Opt = { value: string; label: ReactNode; disabled: boolean };


function optionsOf(children: ReactNode): Opt[] {
  return Children.toArray(children)
    .filter((c): c is ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }> => isValidElement(c) && c.type === "option")
    .map((c) => ({ value: String(c.props.value ?? ""), label: c.props.children, disabled: !!c.props.disabled }));
}

const textOf = (n: ReactNode): string => (typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(textOf).join("") : "");


export function Select({ className, children, value, onChange, disabled, title }: SelectHTMLAttributes<HTMLSelectElement>) {
  const opts = optionsOf(children);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const btn = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const current = opts.find((o) => o.value === String(value ?? "")) ?? opts[0];

  useEffect(() => {
    if (open) setHi(Math.max(0, opts.findIndex((o) => o.value === current?.value)));


    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const pick = (o: Opt) => {
    if (o.disabled) return;
    setOpen(false);
    btn.current?.focus();
    if (o.value !== current?.value) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } } as unknown as ChangeEvent<HTMLSelectElement>);
  };
  const move = (d: number) => {
    let i = hi;
    for (let n = 0; n < opts.length; n++) {
      i = (i + d + opts.length) % opts.length;
      if (!opts[i].disabled) break;
    }
    setHi(i);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    const nav: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => setHi(0),
      End: () => setHi(opts.length - 1),
      Enter: () => opts[hi] && pick(opts[hi]),
      " ": () => opts[hi] && pick(opts[hi]),
    };
    if (nav[e.key]) {
      e.preventDefault();
      nav[e.key]();
    } else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const i = opts.findIndex((o) => textOf(o.label).toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setHi(i);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => !disabled && setOpen(v)}
      className="max-h-[300px] overflow-y-auto p-1"
      trigger={(p) => (
        <button
          type="button"
          ref={(el) => {
            btn.current = el;
            if (typeof p.ref === "function") p.ref(el);
            else if (p.ref) (p.ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
          }}
          aria-haspopup="listbox"
          aria-expanded={p["aria-expanded"]}
          disabled={disabled}
          title={title}
          onClick={p.onClick}
          onKeyDown={onKey}
          className={cn(
            "flex h-8 w-full cursor-default items-center gap-2 rounded-[var(--radius)] border border-line-strong bg-surface pr-2 pl-2.5 text-left text-[13px] text-text outline-none transition-colors hover:border-dim focus:border-accent disabled:opacity-50",
            open && "border-accent",
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{current?.label}</span>
          <ChevronDown size={14} className={cn("shrink-0 text-faint transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      <div ref={list} role="listbox" onKeyDown={onKey} style={{ minWidth: btn.current?.offsetWidth }}>
        {opts.map((o, i) => (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={o.value === current?.value}
            data-i={i}
            disabled={o.disabled}
            onMouseEnter={() => setHi(i)}
            onClick={() => pick(o)}
            className={cn(
              "flex h-8 w-full cursor-default items-center gap-2 rounded-[3px] px-2 text-left text-[13px] disabled:opacity-40",
              i === hi ? "bg-surface-2 text-text" : "text-dim",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.value === current?.value && <Check size={13} className="shrink-0 text-accent" />}
          </button>
        ))}
      </div>
    </Popover>
  );
}
