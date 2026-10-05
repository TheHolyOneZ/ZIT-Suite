import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  LanguageDescription,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { languageName } from "./model";


const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "12.5px", backgroundColor: "var(--bg)", color: "var(--text)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--accent)", padding: "8px 0" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--text-faint)",
    borderRight: "1px solid var(--line)",
  },
  ".cm-activeLineGutter": { backgroundColor: "var(--surface-2)", color: "var(--text)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--surface-2) 70%, transparent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent) !important",
  },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--accent) 14%, transparent)" },
  ".cm-matchingBracket": { outline: "1px solid var(--accent)", backgroundColor: "transparent" },
  ".cm-foldGutter span": { color: "var(--text-faint)" },
  ".cm-panels": {
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    borderTop: "1px solid var(--line)",
  },
  ".cm-panels input, .cm-panels button": { fontFamily: "inherit", fontSize: "12px" },
  ".cm-textfield": {
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--line-strong)",
    borderRadius: "3px",
    color: "var(--text)",
  },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--line-strong)",
    borderRadius: "3px",
    color: "var(--text)",
  },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--warn) 30%, transparent)" },
  ".cm-searchMatch-selected": { backgroundColor: "color-mix(in srgb, var(--accent) 45%, transparent)" },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: "var(--syn-keyword)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--syn-string)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--syn-number)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--text-faint)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--syn-function)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--syn-type)" },
  { tag: [t.propertyName, t.attributeName], color: "var(--syn-property)" },
  { tag: [t.definition(t.variableName)], color: "var(--text)" },
  { tag: [t.tagName], color: "var(--syn-tag)" },
  { tag: [t.heading], color: "var(--syn-keyword)", fontWeight: "600" },
  { tag: [t.link, t.url], color: "var(--syn-function)", textDecoration: "underline" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strong], fontWeight: "700" },
  { tag: [t.meta, t.processingInstruction], color: "var(--text-dim)" },
  { tag: t.invalid, color: "var(--danger)" },
]);


export function CodeEditor({
  path,
  value,
  onChange,
  readOnly,
  onSave,
}: {
  path: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  onSave?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lang = useRef(new Compartment());
  const ro = useRef(new Compartment());
  const cb = useRef({ onChange, onSave });
  cb.current = { onChange, onSave };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          search({ top: true }),
          syntaxHighlighting(highlight),
          keymap.of([
            { key: "Mod-s", preventDefault: true, run: () => (cb.current.onSave?.(), true) },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
          ]),
          theme,
          lang.current.of([]),
          ro.current.of(EditorState.readOnly.of(!!readOnly)),
          EditorView.updateListener.of((u) => u.docChanged && cb.current.onChange?.(u.state.doc.toString())),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();


    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);


  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: ro.current.reconfigure(EditorState.readOnly.of(!!readOnly)) });
  }, [readOnly]);

  useEffect(() => {
    const name = languageName(path);
    const desc = name
      ? LanguageDescription.matchLanguageName(languages, name, true)
      : LanguageDescription.matchFilename(languages, path.split("/").pop()!);
    if (!desc) return;
    let alive = true;
    void desc
      .load()
      .then((support) => alive && view.current?.dispatch({ effects: lang.current.reconfigure(support) }));
    return () => {
      alive = false;
    };
  }, [path]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
