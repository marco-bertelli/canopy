import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { linter } from "@codemirror/lint";
import { autocompletion } from "@codemirror/autocomplete";
import { useMemo, useRef } from "react";
const highlights = HighlightStyle.define([
  { tag: tags.propertyName, color: "#718bd0" },
  { tag: tags.string, color: "#55a68c" },
  { tag: tags.number, color: "#c48a52" },
  { tag: tags.bool, color: "#a384cb" },
  { tag: tags.null, color: "#a384cb" },
]);
export default function JsonEditor({
  value,
  onChange,
  label = "JSON editor",
  height = "120px",
  readOnly = false,
  onRun,
  fields = [],
}: {
  value: string;
  onChange?: (s: string) => void;
  label?: string;
  height?: string;
  readOnly?: boolean;
  onRun?: () => void;
  fields?: string[];
}) {
  const run = useRef(onRun);
  run.current = onRun;
  const fieldKey = JSON.stringify(fields);
  const extensions = useMemo(
    () => [
      json(),
      ...(readOnly ? [] : [linter(jsonParseLinter())]),
      syntaxHighlighting(highlights),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
      }),
      EditorView.theme({
        "&": {
          fontSize: "12px",
          backgroundColor: "transparent",
          color: "var(--text)",
        },
        ".cm-content": {
          fontFamily: "var(--mono)",
          padding: "10px 0",
          caretColor: "var(--accent)",
        },
        ".cm-gutters": {
          background: "transparent",
          border: "none",
          color: "var(--faint)",
        },
        ".cm-lineNumbers .cm-gutterElement": { minWidth: "28px" },
        ".cm-activeLine, .cm-activeLineGutter": { background: "transparent" },
        ".cm-focused": { outline: "none" },
        "&.cm-focused": { outline: "none" },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
          background: "var(--selection) !important",
        },
        ".cm-cursor": { borderLeftColor: "var(--accent)" },
        ".cm-tooltip": {
          background: "var(--surface)",
          color: "var(--text)",
          border: "1px solid var(--border)",
        },
      }),
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              if (!run.current) return false;
              run.current();
              return true;
            },
          },
        ]),
      ),
      ...(readOnly
        ? []
        : [
            autocompletion({
              override: [
                (context) => {
                  const word = context.matchBefore(/[\w$]+/);
                  if (!word || (!context.explicit && !word.text)) return null;
                  return {
                    from: word.from,
                    options: [
                      ...fields.map((f) => ({ label: f, type: "property" })),
                      ...[
                        "$match",
                        "$group",
                        "$sort",
                        "$project",
                        "$limit",
                        "$unwind",
                        "$lookup",
                        "$count",
                        "$addFields",
                        "$eq",
                        "$gt",
                        "$gte",
                        "$lt",
                        "$lte",
                        "$in",
                        "$and",
                        "$or",
                        "$exists",
                        "$regex",
                      ].map((label) => ({ label, type: "keyword" })),
                    ],
                  };
                },
              ],
            }),
          ]),
    ],
    [label, readOnly, fieldKey],
  );
  return (
    <CodeMirror
      theme="none"
      value={value}
      onChange={onChange}
      height={height}
      extensions={extensions}
      readOnly={readOnly}
      basicSetup={basicSetup}
    />
  );
}
const basicSetup = {
  lineNumbers: true,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  autocompletion: false,
};
