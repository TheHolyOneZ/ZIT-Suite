export function bumpManifest(
  text: string,
  ecosystem: string,
  path: string,
  name: string,
  version: string,
): string | null {
  const v = version.replace(/^v/, "");
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keep = (spec: string) => {
    const m = /^(\^|~|>=|==|~=|=)?\s*v?\d/.exec(spec);
    if (!m) return null;
    return `${m[1] ?? ""}${v}`;
  };
  let changed = false;
  let out: string;
  if (ecosystem === "npm") {

    out = text.replace(new RegExp(`("${esc}"\\s*:\\s*")([^"]*)(")`, "g"), (all, a, spec, b) => {
      const next = keep(spec);
      if (!next || next === spec) return all;
      changed = true;
      return `${a}${next}${b}`;
    });
  } else if (ecosystem === "cargo") {

    out = text
      .replace(new RegExp(`^(\\s*${esc}\\s*=\\s*")([^"]*)(")`, "gm"), (all, a, spec, b) => {
        const next = keep(spec);
        if (!next || next === spec) return all;
        changed = true;
        return `${a}${next}${b}`;
      })
      .replace(
        new RegExp(`^(\\s*${esc}\\s*=\\s*\\{[^}\\n]*?version\\s*=\\s*")([^"]*)(")`, "gm"),
        (all, a, spec, b) => {
          const next = keep(spec);
          if (!next || next === spec) return all;
          changed = true;
          return `${a}${next}${b}`;
        },
      );
  } else if (ecosystem === "pypi" && /requirements[^/]*\.txt$/.test(path)) {
    out = text.replace(
      new RegExp(`^(\\s*${esc}(?:\\[[^\\]]*\\])?\\s*)(==|>=|~=)\\s*([^\\s;#,]+)`, "gim"),
      (all, a, op, spec) => {
        if (spec === v) return all;
        changed = true;
        return `${a}${op}${v}`;
      },
    );
  } else return null;
  return changed ? out : null;
}


export const canBump = (ecosystem: string, path: string) =>
  ecosystem === "npm" ||
  ecosystem === "cargo" ||
  (ecosystem === "pypi" && /requirements[^/]*\.txt$/.test(path));
