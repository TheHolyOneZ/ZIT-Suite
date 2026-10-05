import { useEffect } from "react";
import { useSettings } from "../store/settings";


export function accentForeground(hex: string) {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return "#000";
  const [r, g, b] = m.map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.36 ? "#120a02" : "#ffffff";
}


export function useApplyTheme() {
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-fg", accentForeground(accent));
  }, [accent]);
}
