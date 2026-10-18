import { useState, type ReactNode } from "react";
export function scalar(value: unknown): { text: string; type: string } {
  if (value === undefined) return { text: "—", type: "missing" };
  if (value === null) return { text: "null", type: "null" };
  if (Array.isArray(value))
    return {
      text: `[${value.length} ${value.length === 1 ? "item" : "items"}]`,
      type: "array",
    };
  if (typeof value === "object") {
    const v = value as Record<string, any>;
    if ("$oid" in v) return { text: v.$oid, type: "ObjectId" };
    if ("$date" in v) {
      const raw =
        typeof v.$date === "object" ? Number(v.$date.$numberLong) : v.$date;
      const d = new Date(raw);
      return {
        text: isNaN(d.getTime())
          ? JSON.stringify(v.$date)
          : d.toISOString().replace("T", " ").replace(".000Z", " UTC"),
        type: "date",
      };
    }
    for (const [key, type] of [
      ["$numberInt", "number"],
      ["$numberDouble", "number"],
      ["$numberLong", "Int64"],
      ["$numberDecimal", "Decimal128"],
    ])
      if (key in v) return { text: String(v[key]), type };
    if ("$binary" in v) return { text: "Binary data", type: "binary" };
    return { text: `{${Object.keys(v).length} fields}`, type: "object" };
  }
  return { text: String(value), type: typeof value };
}
export function Cell({ value }: { value: unknown }) {
  const { text, type } = scalar(value);
  if (["active", "completed", "shipped"].includes(text))
    return <span className="badge green">{text}</span>;
  if (["inactive", "pending"].includes(text))
    return (
      <span className={`badge ${text === "pending" ? "amber" : "neutral"}`}>
        {text}
      </span>
    );
  return (
    <span className={`cell-value type-${type}`} title={`${type}: ${text}`}>
      {text}
    </span>
  );
}
export function ValueTree({
  value,
  name,
  depth = 0,
}: {
  value: unknown;
  name?: string;
  depth?: number;
}): ReactNode {
  const [open, setOpen] = useState(depth === 0);
  const [visible, setVisible] = useState(50);
  const { type } = scalar(value);
  const complex = type === "object" || type === "array";
  if (!complex)
    return (
      <div className="tree-value">
        {name !== undefined && (
          <span className="tree-key">
            {name}
            <span className="muted">: </span>
          </span>
        )}
        <Cell value={value} />
      </div>
    );
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <details
      className="value-tree"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {name && <span className="tree-key">{name} </span>}
        <span className="muted">
          {type === "array" ? "[" : "{"} {entries.length}{" "}
          {type === "array" ? "items" : "fields"} {type === "array" ? "]" : "}"}
        </span>
      </summary>
      {open && (
        <div className="tree-children">
          {entries.slice(0, visible).map(([key, child]) => (
            <ValueTree key={key} name={key} value={child} depth={depth + 1} />
          ))}
          {visible < entries.length && (
            <button
              className="text-button tree-more"
              onClick={() => setVisible((count) => count + 50)}
            >
              Show {Math.min(50, entries.length - visible)} more (
              {entries.length - visible} remaining)
            </button>
          )}
        </div>
      )}
    </details>
  );
}
