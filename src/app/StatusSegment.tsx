import type { ReactNode } from "react";
import { cn } from "@/core/cn";


export function StatusSegment({ children, onClick, title, className }: { children: ReactNode; onClick?: () => void; title?: string; className?: string }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={cn("flex h-full items-center gap-1.5 border-l border-line px-3 whitespace-nowrap", onClick && "hover:bg-surface-2 hover:text-text cursor-default", className)}
    >
      {children}
    </Tag>
  );
}
