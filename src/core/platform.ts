const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;

export const platform: "windows" | "linux" | "macos" = /Windows/i.test(ua) ? "windows" : /Mac/i.test(ua) ? "macos" : "linux";


export const MOD = platform === "macos" ? "⌘" : "Ctrl";


export const combo = (...keys: string[]) => [MOD, ...keys].join(platform === "macos" ? "" : "+");
