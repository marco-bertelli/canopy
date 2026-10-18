import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Cell, scalar } from "./Values";

interface Props {
  documents: Record<string, unknown>[];
  compact?: boolean;
  fields: string[];
  selected: number | null;
  offset: number;
  sort: string;
  sortable: boolean;
  onSelect: (index: number) => void;
  onNavigate?: (index: number) => void;
  onSort: (field: string) => void;
}
// Keep the complete page in memory; mount only the visible rows and a small buffer.
export const ResultsTable = memo(function ResultsTable({
  documents,
  compact = false,
  fields,
  selected,
  offset,
  sort,
  sortable,
  onSelect,
  onNavigate,
  onSort,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const focusTarget = useRef<number | null>(null);
  const [viewport, setViewport] = useState({
    top: 0,
    height: 500,
    rowHeight: 42,
  });
  const columns = useMemo(
    () =>
      fields.map((name) => {
        const type = scalar(
          documents.find((doc) => doc[name] !== undefined)?.[name],
        ).type;
        return {
          name,
          type,
          width:
            name === "_id"
              ? compact
                ? 150
                : 210
              : type === "date"
                ? compact
                  ? 160
                  : 205
                : type === "Int64" || type === "Decimal128"
                  ? compact
                    ? 150
                    : 200
                  : ["number", "boolean"].includes(type)
                    ? compact
                      ? 90
                      : 120
                    : Math.min(
                        compact ? 220 : 300,
                        Math.max(
                          compact ? 100 : 120,
                          name.length * 7 + 44,
                          ...documents
                            .slice(0, 20)
                            .map(
                              (doc) =>
                                Math.min(40, scalar(doc[name]).text.length) *
                                  7 +
                                24,
                            ),
                        ),
                      ),
        };
      }),
    [documents, fields, compact],
  );
  const sortState = useMemo(() => {
    try {
      return JSON.parse(sort);
    } catch {
      return {};
    }
  }, [sort]);
  useLayoutEffect(() => {
    const node = scroller.current!;
    const measure = () =>
      setViewport({
        top: node.scrollTop,
        height: node.clientHeight,
        rowHeight:
          parseFloat(
            getComputedStyle(node).getPropertyValue("--data-row-height"),
          ) || 42,
      });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, []);
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
    setViewport((v) => ({ ...v, top: 0 }));
  }, [documents]);
  useEffect(() => {
    if (selected === null || !scroller.current) return;
    const node = scroller.current;
    const top = selected * viewport.rowHeight;
    if (top < node.scrollTop) node.scrollTop = top;
    else if (top + viewport.rowHeight > node.scrollTop + node.clientHeight - 34)
      node.scrollTop = top + viewport.rowHeight - node.clientHeight + 34;
  }, [selected, viewport.rowHeight]);
  useLayoutEffect(() => {
    if (focusTarget.current === null) return;
    const row = scroller.current?.querySelector<HTMLElement>(
      `[data-row="${focusTarget.current}"]`,
    );
    if (row) {
      row.focus({ preventScroll: true });
      focusTarget.current = null;
    }
  });
  const start = Math.max(
    0,
    Math.floor(Math.max(0, viewport.top - 34) / viewport.rowHeight) - 6,
  );
  const end = Math.min(
    documents.length,
    start + Math.ceil(viewport.height / viewport.rowHeight) + 14,
  );
  function move(index: number, activate = false) {
    const next = Math.max(0, Math.min(documents.length - 1, index));
    focusTarget.current = next;
    if (activate || !onNavigate) onSelect(next);
    else onNavigate(next);
  }
  return (
    <div
      ref={scroller}
      className="data-table-scroll virtual-table"
      onScroll={() => {
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          if (scroller.current)
            setViewport((v) => ({ ...v, top: scroller.current!.scrollTop }));
        });
      }}
    >
      <table
        className="data-table"
        aria-label="Query results"
        aria-rowcount={documents.length + 1}
        style={{
          width: 42 + columns.reduce((n, c) => n + c.width, 0),
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: 42 }} />
          {columns.map((c) => (
            <col key={c.name} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr aria-rowindex={1}>
            <th className="row-number">#</th>
            {columns.map((c) => {
              const direction = Number(sortState?.[c.name]);
              return (
                <th
                  key={c.name}
                  aria-sort={
                    direction === 1
                      ? "ascending"
                      : direction === -1
                        ? "descending"
                        : "none"
                  }
                >
                  <button
                    className="column-sort"
                    disabled={!sortable}
                    title={sortable ? `Sort by ${c.name}` : c.name}
                    aria-label={`Sort by ${c.name}`}
                    onClick={() => onSort(c.name)}
                  >
                    <span className="field-type">
                      {c.name === "_id"
                        ? "id"
                        : ["number", "Int64", "Decimal128"].includes(c.type)
                          ? "123"
                          : c.type === "string"
                            ? "Aa"
                            : "{}"}
                    </span>
                    <span>{c.name}</span>
                    {direction === 1 ? (
                      <ArrowUp size={12} />
                    ) : direction === -1 ? (
                      <ArrowDown size={12} />
                    ) : null}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {start > 0 && (
            <tr className="virtual-spacer" aria-hidden="true">
              <td
                colSpan={fields.length + 1}
                style={{ height: start * viewport.rowHeight }}
              />
            </tr>
          )}
          {documents.slice(start, end).map((doc, local) => {
            const index = start + local;
            return (
              <tr
                key={index}
                data-row={index}
                aria-rowindex={index + 2}
                aria-label={`Document ${offset + index + 1}`}
                aria-selected={selected === index}
                className={selected === index ? "selected" : ""}
                tabIndex={index === (selected ?? 0) ? 0 : -1}
                onClick={() => {
                  if (window.getSelection()?.isCollapsed !== false)
                    onSelect(index);
                }}
                onKeyDown={(e) => {
                  if (
                    [
                      "ArrowDown",
                      "ArrowUp",
                      "Home",
                      "End",
                      "Enter",
                      " ",
                    ].includes(e.key)
                  ) {
                    e.preventDefault();
                    move(
                      e.key === "ArrowDown"
                        ? index + 1
                        : e.key === "ArrowUp"
                          ? index - 1
                          : e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? documents.length - 1
                              : index,
                      e.key === "Enter" || e.key === " ",
                    );
                  }
                }}
              >
                <td className="row-number">{offset + index + 1}</td>
                {fields.map((field) => (
                  <td key={field}>
                    <Cell value={doc[field]} />
                  </td>
                ))}
              </tr>
            );
          })}
          {end < documents.length && (
            <tr className="virtual-spacer" aria-hidden="true">
              <td
                colSpan={fields.length + 1}
                style={{
                  height: (documents.length - end) * viewport.rowHeight,
                }}
              />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});
