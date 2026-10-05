import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";


export type Pillar = "build" | "manage" | "ship" | "system";
export const PILLARS: Pillar[] = ["build", "manage", "ship", "system"];

export interface CommandContext {
  navigate: (moduleId: string) => void;
}

export interface ModuleCommand {
  id: string;

  titleKey: string;
  icon?: LucideIcon;

  shortcut?: string;
  run: (ctx: CommandContext) => void;
}

export type ModuleSettingField =
  | { key: string; type: "number"; labelKey: string; hintKey?: string; default: number; min?: number; max?: number; step?: number }
  | { key: string; type: "boolean"; labelKey: string; hintKey?: string; default: boolean }
  | { key: string; type: "select"; labelKey: string; hintKey?: string; default: string; options: { value: string; labelKey: string }[] };


export interface SheetDef {
  component: ComponentType<{ params: import("../sheets/store").SheetParams }>;

  kind?: "list" | "detail";

  title?: (params: import("../sheets/store").SheetParams) => string;
}

export interface ModuleManifest {

  id: string;
  pillar: Pillar;

  order: number;
  icon: LucideIcon;
  titleKey: string;

  navKey?: string;

  sheets?: { root: SheetDef } & Record<string, SheetDef>;

  globals?: ComponentType[];

  statusItems?: ComponentType[];
  commands?: ModuleCommand[];

  shortcuts?: { keys: string[]; labelKey: string }[];

  settings?: ModuleSettingField[];

  requiredScopes?: string[];

  hidden?: boolean;

  required?: boolean;
}

export const defineModule = (m: ModuleManifest): ModuleManifest => m;
