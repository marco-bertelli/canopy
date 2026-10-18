import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  Trash2,
  Code2,
  ListOrdered,
  ChevronDown,
  BookOpen,
  Braces,
} from "lucide-react";
import { Editor } from "./Editor";
import type { Query } from "../../shared/contracts";

const operators = [
  ["$match", "Keep documents that match a filter", {}],
  [
    "$group",
    "Group documents and calculate values",
    { _id: "$status", count: { $sum: 1 } },
  ],
  ["$sort", "Order documents by field", { count: -1 }],
  ["$project", "Choose or reshape fields", { _id: 1 }],
  ["$set", "Add or update fields", { newField: "$existingField" }],
  ["$unset", "Remove fields", "field"],
  ["$unwind", "Expand an array into documents", "$tags"],
  [
    "$lookup",
    "Join a collection",
    {
      from: "collection",
      localField: "field",
      foreignField: "_id",
      as: "joined",
    },
  ],
  ["$limit", "Keep the first N documents", 50],
  ["$skip", "Skip the first N documents", 0],
  ["$count", "Count remaining documents", "count"],
  ["$addFields", "Add computed fields", { newField: "$existingField" }],
  ["$replaceRoot", "Replace the document root", { newRoot: "$field" }],
  ["$facet", "Run independent sub-pipelines", { results: [{ $limit: 10 }] }],
] as const;
interface Stage {
  id: string;
  operator: string;
  body: string;
  disabled: boolean;
}
function stagesOf(query: Query): Stage[] | undefined {
  try {
    const value: unknown = JSON.parse(query.pipeline);
    if (!Array.isArray(value) || value.length > 100) return;
    return value.map((item, i) => {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        Object.keys(item).length !== 1 ||
        !Object.keys(item)[0].startsWith("$")
      )
        throw Error();
      const [operator, body] = Object.entries(item)[0];
      return {
        id: crypto.randomUUID(),
        operator,
        body: JSON.stringify(body, null, 2),
        disabled: query.pipelineDisabled?.includes(i) ?? false,
      };
    });
  } catch {
    return;
  }
}
function serialize(stages: Stage[]) {
  return `[\n${stages.map((s) => `  { ${JSON.stringify(s.operator)}: ${s.body} }`).join(",\n")}\n]`;
}
export default function PipelineBuilder({
  query,
  onChange,
  selectedStage,
  onSelectStage,
  fields,
  onRun,
  collapsed,
  onToggleEditor,
  onSave,
  onFormat,
}: {
  query: Query;
  onChange: (changes: Partial<Query>) => void;
  selectedStage: number;
  onSelectStage: (index: number) => void;
  fields: string[];
  onRun: () => void;
  collapsed: boolean;
  onToggleEditor: () => void;
  onSave: () => void;
  onFormat: () => void;
}) {
  const [stages, setStages] = useState(() => stagesOf(query));
  const selected = Math.min(
    selectedStage,
    Math.max(0, (stages?.length ?? 1) - 1),
  );
  const setSelected = onSelectStage;
  const onSelectRef = useRef(onSelectStage);
  onSelectRef.current = onSelectStage;
  useEffect(() => {
    if (selected !== selectedStage) onSelectRef.current(selected);
  }, [selected, selectedStage]);
  const [raw, setRaw] = useState(!stages);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const source = useRef(query.pipeline);
  const disabledSource = useRef(JSON.stringify(query.pipelineDisabled));
  if (
    source.current !== query.pipeline ||
    disabledSource.current !== JSON.stringify(query.pipelineDisabled)
  ) {
    source.current = query.pipeline;
    disabledSource.current = JSON.stringify(query.pipelineDisabled);
    const next = stagesOf(query);
    setStages(next);
    if (!next) setRaw(true);
  }
  function update(next: Stage[], index = selected) {
    setStages(next);
    setSelected(index);
    const pipeline = serialize(next);
    const pipelineDisabled = next.flatMap((s, i) => (s.disabled ? [i] : []));
    source.current = pipeline;
    disabledSource.current = JSON.stringify(pipelineDisabled);
    onChange({ pipeline, pipelineDisabled, skip: 0 });
  }
  function change(changes: Partial<Stage>) {
    update(stages!.map((s, i) => (i === selected ? { ...s, ...changes } : s)));
  }
  const stage = stages?.[selected];
  return (
    <div className="pipeline-builder">
      <div className="pipeline-modebar">
        <span>
          <strong>{stages?.filter((s) => !s.disabled).length ?? "—"}</strong>{" "}
          active stages
          {query.pipelineDisabled?.length
            ? ` · ${query.pipelineDisabled.length} disabled`
            : ""}
        </span>
        <div className="pipeline-editor-actions">
          <button
            className="text-button"
            aria-expanded={!collapsed}
            aria-label={
              collapsed ? "Expand stage editor" : "Collapse stage editor"
            }
            onClick={onToggleEditor}
          >
            <ChevronDown size={13} className={collapsed ? "" : "flipped"} />
            {collapsed ? "Show editor" : "Hide editor"}
          </button>
          <div
            className="view-switch"
            role="group"
            aria-label="Pipeline editor mode"
          >
            <button
              className={!raw ? "active" : ""}
              disabled={!stages}
              onClick={() => {
                setRaw(false);
                if (collapsed) onToggleEditor();
              }}
            >
              <ListOrdered size={13} />
              Steps
            </button>
            <button
              className={raw ? "active" : ""}
              onClick={() => {
                setRaw(true);
                if (collapsed) onToggleEditor();
              }}
            >
              <Code2 size={13} />
              JSON
            </button>
          </div>
          <button className="text-button" onClick={onFormat}>
            <Braces size={13} />
            Format
          </button>
          <button className="text-button" onClick={onSave}>
            <BookOpen size={13} />
            Save
          </button>
        </div>
      </div>
      {raw ? (
        <div className="pipeline-raw">
          <Editor
            onRun={onRun}
            readOnly={!!query.pipelineDisabled?.length}
            value={query.pipeline}
            onChange={(pipeline) => onChange({ pipeline, skip: 0 })}
            label="Aggregation pipeline"
            height="185px"
            fields={fields}
          />
          {!stages && (
            <p className="pipeline-note">
              Enter an array of single-operator stages to use Steps. Your text
              is preserved.
            </p>
          )}
          {!!query.pipelineDisabled?.length && (
            <p className="pipeline-note">
              Disabled stages are preserved. Use Steps to edit them, or enable
              all stages to edit JSON.{" "}
              <button
                className="text-button"
                onClick={() => onChange({ pipelineDisabled: [], skip: 0 })}
              >
                Enable all stages
              </button>
            </p>
          )}
        </div>
      ) : (
        <div className="pipeline-workbench">
          <div className="stage-rail">
            <ol aria-label="Pipeline stages">
              {stages?.map((s, i) => (
                <li
                  key={s.id}
                  className={`${selected === i ? "selected" : ""} ${s.disabled ? "disabled-stage" : ""}`}
                >
                  <button
                    className="stage-select"
                    aria-label={`Stage ${i + 1} ${s.operator}`}
                    aria-pressed={selected === i}
                    onClick={() => {
                      setSelected(i);
                      setAdding(false);
                    }}
                  >
                    <span className="stage-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <code>{s.operator}</code>
                  </button>
                  <input
                    type="checkbox"
                    aria-label={`Enable stage ${i + 1}`}
                    title={s.disabled ? "Enable stage" : "Disable stage"}
                    checked={!s.disabled}
                    onChange={() =>
                      update(
                        stages!.map((v, j) =>
                          j === i ? { ...v, disabled: !v.disabled } : v,
                        ),
                      )
                    }
                  />
                </li>
              ))}
            </ol>
            <button
              className="text-button add-stage"
              disabled={(stages?.length ?? 0) >= 100}
              aria-expanded={adding}
              onClick={() => setAdding(!adding)}
            >
              <Plus size={14} />
              Add stage
            </button>
          </div>
          <div className="stage-workspace">
            {adding ? (
              <div className="stage-picker">
                <label htmlFor="stage-search">Choose a stage</label>
                <input
                  id="stage-search"
                  autoFocus
                  placeholder="Search operators or purpose…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div>
                  {operators
                    .filter(([op, description]) =>
                      `${op} ${description}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map(([operator, description, body]) => (
                      <button
                        key={operator}
                        onClick={() => {
                          const next = [...stages!];
                          const at = stage ? selected + 1 : 0;
                          next.splice(at, 0, {
                            id: crypto.randomUUID(),
                            operator,
                            body: JSON.stringify(body, null, 2),
                            disabled: false,
                          });
                          update(next, at);
                          setAdding(false);
                          setSearch("");
                        }}
                      >
                        <code>{operator}</code>
                        <span>{description}</span>
                        <Plus size={13} />
                      </button>
                    ))}
                </div>
              </div>
            ) : stage ? (
              <>
                <div className="stage-heading">
                  <div>
                    <label htmlFor="stage-operator">Stage {selected + 1}</label>
                    <input
                      id="stage-operator"
                      aria-label="Stage operator"
                      value={stage.operator}
                      list="stage-operators"
                      onChange={(e) => change({ operator: e.target.value })}
                    />
                    <datalist id="stage-operators">
                      {operators.map(([op]) => (
                        <option key={op} value={op} />
                      ))}
                    </datalist>
                  </div>
                  <div className="stage-tools">
                    <button
                      aria-label="Move stage up"
                      disabled={selected === 0}
                      onClick={() => {
                        const next = [...stages!];
                        [next[selected - 1], next[selected]] = [
                          next[selected],
                          next[selected - 1],
                        ];
                        update(next, selected - 1);
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      aria-label="Move stage down"
                      disabled={selected === stages!.length - 1}
                      onClick={() => {
                        const next = [...stages!];
                        [next[selected + 1], next[selected]] = [
                          next[selected],
                          next[selected + 1],
                        ];
                        update(next, selected + 1);
                      }}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      aria-label="Duplicate stage"
                      disabled={stages!.length >= 100}
                      onClick={() => {
                        const next = [...stages!];
                        next.splice(selected + 1, 0, {
                          ...stage,
                          id: crypto.randomUUID(),
                        });
                        update(next, selected + 1);
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      aria-label="Delete stage"
                      onClick={() =>
                        update(
                          stages!.filter((_, i) => i !== selected),
                          Math.max(0, selected - 1),
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="stage-description">
                  {operators.find(([op]) => op === stage.operator)?.[1] ??
                    "Enter the operator’s JSON value below."}
                  {stage.disabled && <strong> · Disabled</strong>}
                </p>
                <div className="stage-value-editor">
                  <Editor
                    onRun={onRun}
                    key={stage.id}
                    value={stage.body}
                    onChange={(body) => change({ body })}
                    label="Stage value"
                    height="100%"
                    fields={fields}
                  />
                </div>
              </>
            ) : (
              <div className="stage-empty">
                <ListOrdered size={24} />
                <strong>Start with a stage</strong>
                <span>Add a $match to filter your documents.</span>
                <button className="button" onClick={() => setAdding(true)}>
                  <Plus size={13} />
                  Add stage
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
