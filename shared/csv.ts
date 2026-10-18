export function csv(documents: Record<string, unknown>[]): string {
  const fields = [...new Set(documents.flatMap(Object.keys))];
  const escape = (v: unknown) => {
    let s =
      v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [
    fields.map(escape).join(","),
    ...documents.map((d) => fields.map((f) => escape(d[f])).join(",")),
  ].join("\r\n");
}
