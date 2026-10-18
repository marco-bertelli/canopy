import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";
const JsonEditor = lazy(() => import("./JsonEditor"));
export function Editor(props: ComponentProps<typeof JsonEditor>) {
  return (
    <Suspense
      fallback={
        <div
          className="editor-loading"
          style={{ height: props.height ?? "120px" }}
          role="status"
        >
          Loading editor…
        </div>
      }
    >
      <JsonEditor {...props} />
    </Suspense>
  );
}
