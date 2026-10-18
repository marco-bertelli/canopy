import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Braces,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleHelp,
  Code2,
  Command,
  Copy,
  Database,
  Download,
  FileJson,
  History,
  Layers,
  Leaf,
  ListFilter,
  Loader2,
  LockKeyhole,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelRight,
  Pencil,
  Play,
  Plus,
  Square,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Table2,
  Terminal,
  Trash2,
  Unplug,
  Upload,
  X,
  Zap,
} from "lucide-react";
import type {
  Bridge,
  CollectionInfo,
  Connection,
  IndexInfo,
  Namespace,
  Query,
  QueryResult,
  StageSide,
  SchemaField,
  Workspace,
} from "../shared/contracts";
import type { StageComparisonHandle } from "./components/StageComparison";
import { csv } from "../shared/csv";
import { ResultsTable } from "./components/ResultsTable";
import { Editor } from "./components/Editor";
import { Modal } from "./components/Modal";
import { ConnectionModal } from "./components/ConnectionModal";
import { CreateCollectionModal } from "./components/CreateCollectionModal";
import { Cell, scalar, ValueTree } from "./components/Values";

const StageComparison = lazy(() => import("./components/StageComparison"));
const PipelineBuilder = lazy(() => import("./components/PipelineBuilder"));
const ExplainPanel = lazy(() => import("./components/ExplainPanel"));

type Pane = "documents" | "aggregation" | "indexes" | "schema" | "explain";
type ResultView = "table" | "documents" | "json";
interface Tab {
  id: string;
  query: Query;
  result?: QueryResult;
  resultQuery?: Query;
  resultSourceQuery?: Query;
  resultContext?: string;
  aggregationStage?: number;
  aggregationView?: "stage" | "pipeline";
  aggregationCollapsed?: boolean;
  loading: boolean;
  error?: string;
  pane: Pane;
  view: ResultView;
  selected: number | null;
  indexes?: IndexInfo[];
  schema?: SchemaField[];
  auxLoading?: boolean;
}
type Dialog =
  | "connect"
  | "insert"
  | "edit"
  | "delete"
  | "import"
  | "createCollection"
  | "dropCollection"
  | "createIndex"
  | "dropIndex"
  | "save"
  | "settings"
  | "palette"
  | null;
const pendingBridge: Bridge = {
  call: async () => {
    throw new Error("Workspace is loading. Please try again.");
  },
};
const emptyWorkspace: Workspace = { saved: [], history: [] };
const defaults = {
  mode: "find" as const,
  filter: "{}",
  projection: "{}",
  sort: "{}",
  pipeline: '[\n  { "$match": {} },\n  { "$limit": 50 }\n]',
  limit: 50,
  skip: 0,
};
const pretty = (text: string) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};
function download(
  content: string,
  filename: string,
  mime = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function App() {
  const [demo, setDemo] = useState(!window.canopy);
  const [demoApi, setDemoApi] = useState<Bridge>();
  const api: Bridge = (demo ? demoApi : window.canopy) ?? pendingBridge;
  useEffect(() => {
    if (demo && !demoApi)
      void import("./demo").then((module) => setDemoApi(module.demoBridge));
  }, [demo, demoApi]);
  const [creationTarget, setCreationTarget] = useState<{
    connectionId: string;
    database?: string;
  }>();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState<string>();
  const [secure, setSecure] = useState(false);
  const [catalog, setCatalog] = useState<
    Record<string, Record<string, CollectionInfo[] | null>>
  >({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [section, setSection] = useState<"explorer" | "saved" | "history">(
    "explorer",
  );
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogText, setDialogText] = useState("");
  const [dialogName, setDialogName] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogCheck, setDialogCheck] = useState(false);
  const [indexTarget, setIndexTarget] = useState("");
  const [toast, setToast] = useState<{ text: string; error?: boolean }>();
  const [inspector, setInspector] = useState(false);
  const [inspectorView, setInspectorView] = useState<"tree" | "json">("tree");
  const [options, setOptions] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("canopy-theme") || "light",
  );
  const [palette, setPalette] = useState("");
  const [menu, setMenu] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const stageComparison = useRef<StageComparisonHandle>(null);
  const requests = useRef(new Map<string, number>());
  const runningQueries = useRef(
    new Map<string, { requestId: string; connectionId: string; api: Bridge }>(),
  );
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const active = tabs.find((t) => t.id === activeId);
  const connection = connections.find(
    (c) => c.id === active?.query.connectionId,
  );
  const readonly = connection?.readOnly ?? true;
  const ns: Namespace | undefined = active && {
    connectionId: active.query.connectionId,
    database: active.query.database,
    collection: active.query.collection,
  };
  const notify = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  const patch = useCallback(
    (id: string, changes: Partial<Tab>) =>
      setTabs((all) =>
        all.map((t) => (t.id === id ? { ...t, ...changes } : t)),
      ),
    [],
  );
  function editQuery(changes: Partial<Query>) {
    if (active) patch(active.id, { query: { ...active.query, ...changes } });
  }
  function selectStage(stage: number) {
    if (active)
      patch(active.id, { aggregationStage: stage, aggregationView: "stage" });
  }
  function inspectStage(side?: StageSide) {
    if (!active) return;
    patch(active.id, { aggregationView: "stage" });
    stageComparison.current?.run(side);
  }
  async function refreshWorkspace() {
    try {
      setWorkspace(await api.call("workspace", undefined));
    } catch (e: any) {
      notify(e.message, true);
    }
  }
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("canopy-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(undefined), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  async function loadDatabases(id: string) {
    const names = await api.call("databases", { connectionId: id });
    setCatalog((prev) => ({
      ...prev,
      [id]: Object.fromEntries(names.map((n) => [n, prev[id]?.[n] || null])),
    }));
    setExpanded((prev) => new Set([...prev, id]));
  }
  async function loadCollections(id: string, database: string) {
    const collections = await api.call("collections", {
      connectionId: id,
      database,
    });
    setCatalog((prev) => ({
      ...prev,
      [id]: { ...prev[id], [database]: collections },
    }));
    setExpanded((prev) => new Set([...prev, `${id}/${database}`]));
  }
  async function execute(tab: Tab, query = tab.query, preview?: string) {
    const previous = runningQueries.current.get(tab.id);
    if (previous)
      void previous.api
        .call("cancelQuery", {
          connectionId: previous.connectionId,
          requestId: previous.requestId,
        })
        .catch(() => {});
    const requestId = crypto.randomUUID();
    runningQueries.current.set(tab.id, {
      requestId,
      connectionId: query.connectionId,
      api,
    });
    const ticket = (requests.current.get(tab.id) || 0) + 1;
    requests.current.set(tab.id, ticket);
    patch(tab.id, {
      ...(query.mode === "aggregate" && !preview
        ? { aggregationView: "pipeline" as const }
        : {}),
      loading: true,
      error: undefined,
      ...(preview ? {} : { query }),
      selected: null,
    });
    try {
      const result = await api.call("query", { ...query, requestId });
      if (requests.current.get(tab.id) === ticket)
        patch(tab.id, {
          result,
          resultQuery: query,
          resultSourceQuery: preview ? tab.query : query,
          resultContext: preview,
          loading: false,
        });
    } catch (e: any) {
      if (requests.current.get(tab.id) === ticket)
        patch(tab.id, { error: e.message, loading: false });
    } finally {
      if (runningQueries.current.get(tab.id)?.requestId === requestId)
        runningQueries.current.delete(tab.id);
    }
  }
  async function cancelTab(id: string, silent = false) {
    const running = runningQueries.current.get(id);
    if (!running) return;
    requests.current.set(id, (requests.current.get(id) ?? 0) + 1);
    runningQueries.current.delete(id);
    patch(id, { loading: false, error: undefined });
    try {
      await running.api.call("cancelQuery", {
        connectionId: running.connectionId,
        requestId: running.requestId,
      });
      if (!silent) notify("Query cancelled");
    } catch (e: any) {
      if (!silent) notify(e.message, true);
    }
  }
  function openCollection(
    connectionId: string,
    database: string,
    collection: string,
    query?: Query,
  ) {
    const existing = tabsRef.current.find(
      (t) =>
        t.query.connectionId === connectionId &&
        t.query.database === database &&
        t.query.collection === collection,
    );
    const q: Query = query || {
      ...defaults,
      connectionId,
      database,
      collection,
    };
    if (existing && !query) {
      setActiveId(existing.id);
      setSection("explorer");
      return;
    }
    const tab: Tab = {
      id: crypto.randomUUID(),
      query: q,
      loading: false,
      pane: q.mode === "aggregate" ? "aggregation" : "documents",
      view: "table",
      selected: null,
    };
    setTabs((all) => [...all, tab]);
    setActiveId(tab.id);
    setSection("explorer");
    void execute(tab);
  }
  useEffect(() => {
    if (api === pendingBridge) return;
    let live = true;
    setTabs([]);
    setActiveId(undefined);
    setConnected(new Set());
    setCatalog({});
    setWorkspace(emptyWorkspace);
    requests.current.clear();
    api
      .call("boot", undefined)
      .then(async (boot) => {
        if (!live) return;
        setConnections(boot.connections);
        setSecure(boot.secureStorage);
        if (!demo) {
          setConnected(new Set(boot.activeConnections));
          await Promise.all(
            boot.activeConnections.map((id) => loadDatabases(id)),
          );
          if (!live) return;
        }
        const work = await api.call("workspace", undefined);
        if (live) setWorkspace(work);
        if (demo && live) {
          setConnected(new Set(["demo"]));
          const collections = await api.call("collections", {
            connectionId: "demo",
            database: "sample_store",
          });
          if (!live) return;
          setCatalog({ demo: { sample_store: collections } });
          setExpanded(new Set(["demo", "demo/sample_store"]));
          openCollection("demo", "sample_store", "customers");
        }
      })
      .catch((e) => {
        if (live) notify(e.message, true);
      });
    return () => {
      live = false;
      for (const running of runningQueries.current.values())
        void running.api
          .call("cancelQuery", {
            connectionId: running.connectionId,
            requestId: running.requestId,
          })
          .catch(() => {});
      runningQueries.current.clear();
      requests.current.clear();
    };
  }, [api]);
  async function connectSaved(c: Connection) {
    if (connected.has(c.id)) {
      setExpanded((prev) => {
        const n = new Set(prev);
        n.has(c.id) ? n.delete(c.id) : n.add(c.id);
        return n;
      });
      return;
    }
    setConnecting(c.id);
    try {
      await api.call("reconnect", { connectionId: c.id });
      setConnected((prev) => new Set([...prev, c.id]));
      await loadDatabases(c.id);
      notify(`Connected to ${c.name}`);
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setConnecting(undefined);
    }
  }
  async function didConnect(c: Connection) {
    setConnections((all) => [...all.filter((x) => x.id !== c.id), c]);
    setConnected((prev) => new Set([...prev, c.id]));
    setDialog(null);
    try {
      await loadDatabases(c.id);
      notify(`Connected to ${c.name}`);
    } catch (e: any) {
      notify(e.message, true);
    }
  }
  function toggleDatabase(id: string, database: string) {
    const key = `${id}/${database}`;
    if (expanded.has(key))
      setExpanded((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
    else
      void loadCollections(id, database).catch((e) => notify(e.message, true));
  }
  async function changePane(pane: Pane, force = false) {
    if (!active || !ns) return;
    const q = {
      ...active.query,
      mode:
        pane === "aggregation"
          ? ("aggregate" as const)
          : pane === "documents"
            ? ("find" as const)
            : active.query.mode,
    };
    patch(active.id, { pane, query: q, error: undefined });
    if (
      !force &&
      ((pane === "indexes" && active.indexes) ||
        (pane === "schema" && active.schema))
    )
      return;
    if (["indexes", "schema"].includes(pane)) {
      patch(active.id, { auxLoading: true });
      try {
        if (pane === "indexes")
          patch(active.id, { indexes: await api.call("indexes", ns) });
        if (pane === "schema")
          patch(active.id, { schema: await api.call("schema", ns) });
      } catch (e: any) {
        patch(active.id, { error: e.message });
      } finally {
        patch(active.id, { auxLoading: false });
      }
    }
  }
  function showDialog(kind: Dialog, text = "", name = "") {
    setDialogText(text);
    setDialogName(name);
    setDialogError("");
    setDialogCheck(false);
    setDialog(kind);
    setMenu(false);
    setExportMenu(false);
  }
  function closeDialog() {
    if (!dialogBusy) setDialog(null);
  }
  async function submitDialog(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !ns) return;
    setDialogBusy(true);
    setDialogError("");
    try {
      if (dialog === "save") {
        await api.call("saveQuery", {
          name: dialogName.trim(),
          query: active.query,
        });
        await refreshWorkspace();
        notify("Query saved to your library");
      }
      if (dialog === "insert" || dialog === "import") {
        const result = await api.call("insert", {
          ...ns,
          documents: dialogText,
        });
        patch(active.id, { schema: undefined });
        notify(
          `${result.count} ${result.count === 1 ? "document" : "documents"} inserted`,
        );
        await execute(active, { ...active.query, skip: 0 });
      }
      if (dialog === "edit" && active.selected !== null && active.result) {
        await api.call("replace", {
          ...ns,
          original: active.result.originals[active.selected],
          document: dialogText,
        });
        patch(active.id, { schema: undefined });
        notify("Document updated");
        await execute(active);
      }
      if (dialog === "delete" && active.selected !== null && active.result) {
        await api.call("delete", {
          ...ns,
          original: active.result.originals[active.selected],
        });
        patch(active.id, { schema: undefined });
        notify("Document deleted");
        await execute(active);
      }
      if (dialog === "createCollection") {
        await api.call("createCollection", {
          ...ns,
          collection: dialogName.trim(),
        });
        await loadCollections(ns.connectionId, ns.database);
        openCollection(ns.connectionId, ns.database, dialogName.trim());
        notify("Collection created");
      }
      if (dialog === "dropCollection") {
        await api.call("dropCollection", { ...ns, confirmation: dialogName });
        const remaining = tabs.filter(
          (t) =>
            !(
              t.query.connectionId === ns.connectionId &&
              t.query.database === ns.database &&
              t.query.collection === ns.collection
            ),
        );
        setTabs(remaining);
        setActiveId(remaining.at(-1)?.id);
        await loadCollections(ns.connectionId, ns.database);
        notify("Collection dropped");
      }
      if (dialog === "createIndex") {
        await api.call("createIndex", {
          ...ns,
          keys: dialogText,
          name: dialogName.trim(),
          unique: dialogCheck,
        });
        patch(active.id, { indexes: await api.call("indexes", ns) });
        notify("Index created");
      }
      if (dialog === "dropIndex") {
        await api.call("dropIndex", { ...ns, name: indexTarget });
        patch(active.id, { indexes: await api.call("indexes", ns) });
        notify("Index removed");
      }
      setDialog(null);
    } catch (e: any) {
      setDialogError(e.message);
    } finally {
      setDialogBusy(false);
    }
  }
  async function disconnect(id: string, forget = false) {
    try {
      await api.call(forget ? "forgetConnection" : "disconnect", {
        connectionId: id,
      });
      setConnected((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      const remaining = tabs.filter((t) => t.query.connectionId !== id);
      setTabs(remaining);
      setActiveId(remaining.at(-1)?.id);
      if (forget || !connections.find((c) => c.id === id)?.saved)
        setConnections((all) => all.filter((c) => c.id !== id));
      notify(forget ? "Connection forgotten" : "Disconnected");
      setMenu(false);
    } catch (e: any) {
      notify(e.message, true);
    }
  }
  const runRef = useRef<() => void>(() => {});
  runRef.current = () => {
    if (
      active &&
      !active.loading &&
      ["documents", "aggregation"].includes(active.pane)
    )
      void execute(active);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !dialog &&
        e.target instanceof HTMLElement &&
        e.target.closest('[role="dialog"]')
      )
        return;
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "k" &&
        !creationTarget
      ) {
        e.preventDefault();
        setPalette("");
        setDialog((d) => (d === "palette" ? null : "palette"));
      }
      if (
        active?.pane === "aggregation" &&
        !dialog &&
        !creationTarget &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        ["F5", "F6", "F7"].includes(e.key)
      ) {
        e.preventDefault();
        if (e.key === "F5") runRef.current();
        else inspectStage(e.key === "F6" ? "input" : "output");
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "Enter" &&
        !e.defaultPrevented &&
        !dialog &&
        !creationTarget
      ) {
        e.preventDefault();
        runRef.current();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "s" &&
        !dialog &&
        !creationTarget &&
        active
      ) {
        e.preventDefault();
        showDialog("save", "", `${active.query.collection} query`);
      }
      if (e.key === "Escape") {
        setMenu(false);
        setExportMenu(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dialog, active, creationTarget]);
  function closeTab(id: string) {
    void cancelTab(id, true);
    requests.current.delete(id);
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeId === id) setActiveId(remaining.at(-1)?.id);
  }
  async function copy(text: string) {
    try {
      if (window.canopy) await window.canopy.call("copyText", { text });
      else await navigator.clipboard.writeText(text);
      notify("Copied to clipboard");
    } catch {
      notify(
        "Clipboard is unavailable. Select the JSON and copy it with your keyboard.",
        true,
      );
    }
  }
  const selected =
    active?.selected != null
      ? active.result?.documents[active.selected]
      : undefined;
  const canEdit =
    !readonly &&
    !active?.result?.readOnly &&
    selected &&
    Object.hasOwn(selected, "_id") &&
    !active?.loading;
  const fields = useMemo(
    () => [...new Set(active?.result?.documents.flatMap(Object.keys) || [])],
    [active?.result],
  );
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const executeRef = useRef(execute);
  executeRef.current = execute;
  const selectRow = useCallback(
    (selected: number) => {
      const id = activeIdRef.current;
      if (id) {
        patch(id, { selected });
        setInspector(true);
      }
    },
    [patch],
  );
  const sortColumn = useCallback((field: string) => {
    const tab = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (!tab || tab.loading || tab.query.mode !== "find") return;
    let current: Record<string, number> = {};
    try {
      current = JSON.parse(tab.query.sort);
    } catch {
      /* Replace invalid sort with the chosen field. */
    }
    const direction = current[field] === 1 ? -1 : current[field] === -1 ? 0 : 1;
    void executeRef.current(tab, {
      ...tab.query,
      sort: JSON.stringify(direction ? { [field]: direction } : {}),
      skip: 0,
    });
  }, []);
  const resultsJSON = useMemo(
    () =>
      active?.view === "json" && active.result
        ? "[\n" + active.result.originals.map(pretty).join(",\n") + "\n]"
        : "",
    [active?.view, active?.result],
  );
  const selectedJSON = useMemo(
    () =>
      inspectorView === "json" && active?.selected != null && active.result
        ? pretty(active.result.originals[active.selected])
        : "",
    [inspectorView, active?.selected, active?.result],
  );
  const resultMismatch =
    active?.resultQuery &&
    JSON.stringify(active.query) !==
      JSON.stringify(active.resultSourceQuery ?? active.resultQuery);
  const commandItems = [
    {
      label: "Run current query",
      detail: "Ctrl / ⌘ Enter",
      icon: Play,
      action: () => runRef.current(),
    },
    {
      label: "New connection",
      detail: "MongoDB URI",
      icon: Plus,
      action: () => showDialog("connect"),
    },
    {
      label: "Saved queries",
      detail: "Your query library",
      icon: BookOpen,
      action: () => setSection("saved"),
    },
    {
      label: "Query history",
      detail: "Recent executions",
      icon: History,
      action: () => setSection("history"),
    },
    {
      label: "Toggle appearance",
      detail: theme === "light" ? "Switch to dark" : "Switch to light",
      icon: Moon,
      action: () => setTheme(theme === "light" ? "dark" : "light"),
    },
    ...Object.entries(catalog).flatMap(([id, dbs]) =>
      Object.entries(dbs).flatMap(([db, cols]) =>
        (cols || []).map((c) => ({
          label: c.name,
          detail: `${db} · ${connections.find((x) => x.id === id)?.name}`,
          icon: Table2,
          action: () => openCollection(id, db, c.name),
        })),
      ),
    ),
  ].filter((c) =>
    `${c.label} ${c.detail}`.toLowerCase().includes(palette.toLowerCase()),
  );

  return (
    <div className={`app ${sidebar ? "" : "sidebar-hidden"}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Leaf size={22} strokeWidth={1.8} />
          </span>
          <strong>
            canopy<span className="brand-dot">.</span>
          </strong>
          <span className="version">
            {__APP_VERSION__.split(".").slice(0, 2).join(".")}
          </span>
          <button
            className="icon-button sidebar-toggle"
            aria-label="Hide sidebar"
            onClick={() => setSidebar(false)}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
        <button
          className="quick-search"
          onClick={() => {
            setPalette("");
            showDialog("palette");
          }}
        >
          <Search size={15} />
          <span>Jump to anything…</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="sidebar-nav">
          <button
            className={section === "explorer" ? "active" : ""}
            onClick={() => setSection("explorer")}
          >
            <Database size={16} />
            Explorer
          </button>
          <button
            className={section === "saved" ? "active" : ""}
            onClick={() => {
              setSection("saved");
              void refreshWorkspace();
            }}
          >
            <BookOpen size={16} />
            Saved queries<span>{workspace.saved.length || ""}</span>
          </button>
          <button
            className={section === "history" ? "active" : ""}
            onClick={() => {
              setSection("history");
              void refreshWorkspace();
            }}
          >
            <History size={16} />
            History
          </button>
        </div>
        <div className="sidebar-label">
          <span>CONNECTIONS</span>
          <button
            className="icon-button"
            aria-label="New connection"
            onClick={() => showDialog("connect")}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="sidebar-filter">
          <Search size={13} />
          <input
            aria-label="Filter collections"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter collections…"
          />
          {search && (
            <button aria-label="Clear filter" onClick={() => setSearch("")}>
              <X size={12} />
            </button>
          )}
        </div>
        <div className="connection-tree">
          {connections.map((c) => (
            <div key={c.id} className="connection-group">
              <button
                className="connection-row"
                onClick={() => void connectSaved(c)}
              >
                <span
                  className={`connection-dot ${connected.has(c.id) ? "online" : ""}`}
                  style={
                    { "--connection-color": c.color } as React.CSSProperties
                  }
                />
                <span className="connection-name">
                  {c.name}
                  <small>{demo ? "In-memory sample" : c.host}</small>
                </span>
                {connecting === c.id ? (
                  <Loader2 size={13} className="spin" />
                ) : (
                  <ChevronDown
                    size={13}
                    className={expanded.has(c.id) ? "" : "rotated"}
                  />
                )}
              </button>
              {expanded.has(c.id) &&
                connected.has(c.id) &&
                Object.entries(catalog[c.id] || {}).map(([db, cols]) => (
                  <div key={db} className="database-group">
                    <button
                      className="database-row"
                      onClick={() => toggleDatabase(c.id, db)}
                    >
                      {expanded.has(`${c.id}/${db}`) ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                      <Database size={14} />
                      <span>{db}</span>
                      <small>{cols?.length}</small>
                    </button>
                    {expanded.has(`${c.id}/${db}`) && (
                      <div className="collections">
                        {cols === null ? (
                          <span className="tree-message">Loading…</span>
                        ) : (
                          cols
                            .filter((col) =>
                              col.name
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                            )
                            .map((col) => (
                              <button
                                key={col.name}
                                className={`collection-row ${active?.query.connectionId === c.id && active?.query.database === db && active?.query.collection === col.name ? "active" : ""}`}
                                onClick={() =>
                                  openCollection(c.id, db, col.name)
                                }
                              >
                                <Table2 size={14} />
                                <span>{col.name}</span>
                                {active?.query.collection === col.name &&
                                  active.query.database === db &&
                                  active.query.connectionId === c.id && (
                                    <span className="collection-active-dot" />
                                  )}
                              </button>
                            ))
                        )}
                        {cols?.length === 0 && (
                          <span className="tree-message">
                            No collections yet
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              {connected.has(c.id) && (
                <button
                  className="tree-create"
                  disabled={c.readOnly}
                  onClick={() => setCreationTarget({ connectionId: c.id })}
                >
                  <Plus size={12} />
                  New database / collection
                </button>
              )}
              {!connected.has(c.id) && (
                <div className="offline-actions">
                  <span>Click to connect</span>
                  <button
                    aria-label={`Forget ${c.name}`}
                    title="Forget saved connection"
                    onClick={() => void disconnect(c.id, true)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {!connections.length && (
            <p className="sidebar-empty">
              Connect a database to start exploring.
            </p>
          )}
        </div>
        <button
          className="add-connection"
          onClick={() => showDialog("connect")}
        >
          <Plus size={14} />
          Add connection
        </button>
        <div className="sidebar-bottom">
          {demo ? (
            <div className="sample-note">
              <span className="sample-icon">
                <Leaf size={16} />
              </span>
              <div>
                <strong>A little room to explore</strong>
                <span>Sample data. Make yourself at home.</span>
              </div>
            </div>
          ) : (
            <div className="local-note">
              <ShieldCheck size={16} />
              <span>Local. Private. Yours.</span>
            </div>
          )}
          <div className="sidebar-bottom-actions">
            <button onClick={() => showDialog("settings")}>
              <Settings2 size={15} />
              Settings
            </button>
            <button
              aria-label="Toggle color theme"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            {!sidebar && (
              <button
                className="icon-button"
                aria-label="Show sidebar"
                onClick={() => setSidebar(true)}
              >
                <PanelLeftClose size={17} />
              </button>
            )}
            <span className="workspace-symbol">
              <Layers size={16} />
            </span>
            <span>
              {section === "saved"
                ? "Query library"
                : section === "history"
                  ? "Query history"
                  : "Workspace"}
            </span>
            {active && section === "explorer" && (
              <>
                <ChevronRight size={12} />
                <span className="muted">{active.query.database}</span>
                <ChevronRight size={12} />
                <strong>{active.query.collection}</strong>
              </>
            )}
          </div>
          <div className="topbar-right">
            {demo && (
              <span className="demo-badge">
                <Circle size={7} fill="currentColor" />
                Sample workspace
              </span>
            )}
            <button
              className="help-button"
              onClick={() => showDialog("settings")}
            >
              <CircleHelp size={16} />
              <span>Quick guide</span>
            </button>
          </div>
        </header>
        {demo && window.canopy && (
          <div className="demo-banner">
            <span>
              You’re exploring sample data. Changes reset when you reopen the
              app.
            </span>
            <button onClick={() => setDemo(false)}>
              Back to my connections
              <ArrowRight size={13} />
            </button>
          </div>
        )}
        {section !== "explorer" ? (
          <section className="library">
            <div className="eyebrow">YOUR WORKSPACE</div>
            <div className="library-heading">
              <div>
                <h1>
                  {section === "saved"
                    ? "Good queries, kept close."
                    : "Pick up where you left off."}
                </h1>
                <p>
                  {section === "saved"
                    ? "Your saved queries, ready for the next time you need them."
                    : "The last 100 queries executed on this device."}
                </p>
              </div>
              {section === "history" && !!workspace.history.length && (
                <button
                  className="button"
                  onClick={async () => {
                    await api.call("clearHistory", undefined);
                    void refreshWorkspace();
                  }}
                >
                  Clear history
                </button>
              )}
            </div>
            {(section === "saved" ? workspace.saved : workspace.history)
              .length === 0 ? (
              <div className="empty-state">
                <BookOpen size={32} />
                <h3>
                  {section === "saved"
                    ? "A place for your go-to queries"
                    : "Your story starts with a query"}
                </h3>
                <p>
                  {section === "saved"
                    ? "Save a query with Ctrl / ⌘ S from any collection."
                    : "Run a query and it will appear here."}
                </p>
                <button
                  className="button"
                  onClick={() => setSection("explorer")}
                >
                  Back to workspace
                </button>
              </div>
            ) : (
              <div className="query-library">
                {(section === "saved"
                  ? workspace.saved
                  : workspace.history
                ).map((item) => (
                  <article className="saved-query" key={item.id}>
                    <div className="saved-query-icon">
                      <Code2 size={19} />
                    </div>
                    <div className="saved-query-main">
                      <h3>
                        {"name" in item
                          ? item.name
                          : `${item.query.collection}.${item.query.mode === "aggregate" ? "aggregate" : "find"}()`}
                      </h3>
                      <span>
                        {item.query.database} / {item.query.collection}
                        <span className="separator">·</span>
                        {new Date(
                          "updatedAt" in item ? item.updatedAt : item.createdAt,
                        ).toLocaleString()}
                      </span>
                      <code>
                        {item.query.mode === "aggregate"
                          ? item.query.pipeline.replace(/\n/g, " ")
                          : item.query.filter}
                      </code>
                    </div>
                    <div className="saved-query-actions">
                      <button
                        className="button small"
                        onClick={() => {
                          if (!connected.has(item.query.connectionId)) {
                            notify(
                              "Connect to the saved query’s server first.",
                              true,
                            );
                            return;
                          }
                          openCollection(
                            item.query.connectionId,
                            item.query.database,
                            item.query.collection,
                            item.query,
                          );
                        }}
                      >
                        Open
                        <ArrowUpRight size={13} />
                      </button>
                      {"name" in item && (
                        <button
                          className="icon-button"
                          aria-label={`Delete saved query ${item.name}`}
                          onClick={async () => {
                            await api.call("removeQuery", { id: item.id });
                            void refreshWorkspace();
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : !active ? (
          <section className="welcome">
            <div className="welcome-art">
              <Leaf size={46} strokeWidth={1.2} />
            </div>
            <div className="eyebrow">LESS FRICTION. MORE FLOW.</div>
            <h1>
              Your data.
              <br />
              <span>A clearer perspective.</span>
            </h1>
            <p>
              A thoughtful workspace for MongoDB.
              <br />
              Connect, explore, and get back to building.
            </p>
            <div className="welcome-actions">
              <button
                className="button primary"
                onClick={() => showDialog("connect")}
              >
                <Plus size={16} />
                Connect a database
              </button>
              <button className="button" onClick={() => setDemo(true)}>
                Explore sample data
                <ArrowRight size={15} />
              </button>
            </div>
            <div className="welcome-features">
              <span>
                <Zap size={15} />
                Native MongoDB queries
              </span>
              <span>
                <ShieldCheck size={15} />
                Data stays on your machine
              </span>
              <span>
                <Terminal size={15} />
                Built for developers
              </span>
            </div>
            {connections.length > 0 && (
              <p className="muted">
                Choose a saved connection in the sidebar to reconnect.
              </p>
            )}
          </section>
        ) : (
          <>
            <div className="workspace-tabs">
              {tabs.map((t) => (
                <div
                  key={t.id}
                  className={`workspace-tab ${activeId === t.id ? "active" : ""}`}
                >
                  <button
                    className="workspace-tab-label"
                    onClick={() => setActiveId(t.id)}
                  >
                    <Table2 size={14} />
                    <span>{t.query.collection}</span>
                    {t.loading && <Loader2 size={12} className="spin" />}
                  </button>
                  <button
                    className="close-tab"
                    aria-label={`Close ${t.query.collection} tab`}
                    onClick={() => closeTab(t.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                className="tab-add icon-button"
                aria-label="Open collection picker"
                onClick={() => {
                  setPalette("");
                  showDialog("palette");
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="collection-heading">
              <div className="collection-title">
                <div className="collection-symbol">
                  <Table2 size={21} />
                </div>
                <div>
                  <div className="title-line">
                    <h1>{active.query.collection}</h1>
                    <span className="badge outline">
                      {catalog[active.query.connectionId]?.[
                        active.query.database
                      ]?.find((c) => c.name === active.query.collection)
                        ?.type || "collection"}
                    </span>
                  </div>
                  <div className="collection-subtitle">
                    <span
                      className="tiny-dot"
                      style={{ background: connection?.color }}
                    />
                    {connection?.name}
                    <span className="separator">/</span>
                    {active.query.database}
                    {readonly && (
                      <span className="readonly-label">
                        <LockKeyhole size={11} />
                        Read-only
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="heading-actions">
                <span className={`env-badge ${connection?.environment}`}>
                  {connection?.environment}
                </span>
                <div className="menu-anchor">
                  <button
                    className="icon-button bordered"
                    aria-label="Collection actions"
                    onClick={() => setMenu(!menu)}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {menu && (
                    <>
                      <button
                        className="menu-dismiss"
                        aria-label="Close collection menu"
                        onClick={() => setMenu(false)}
                      />
                      <div className="dropdown">
                        <button
                          disabled={readonly}
                          onClick={() => {
                            setMenu(false);
                            setCreationTarget({
                              connectionId: active.query.connectionId,
                              database: active.query.database,
                            });
                          }}
                        >
                          <Plus size={14} />
                          New collection
                        </button>
                        <button
                          disabled={readonly}
                          onClick={() =>
                            showDialog(
                              "import",
                              '[\n  { "name": "New document" }\n]',
                            )
                          }
                        >
                          <Upload size={14} />
                          Import JSON
                        </button>
                        <button
                          onClick={() => {
                            void loadCollections(
                              active.query.connectionId,
                              active.query.database,
                            ).catch((e) => notify(e.message, true));
                            setMenu(false);
                          }}
                        >
                          <RefreshCw size={14} />
                          Refresh collections
                        </button>
                        <div className="menu-divider" />
                        <button
                          onClick={() =>
                            void disconnect(active.query.connectionId)
                          }
                        >
                          <Unplug size={14} />
                          Disconnect
                        </button>
                        <button
                          className="danger-text"
                          disabled={readonly}
                          onClick={() => showDialog("dropCollection")}
                        >
                          <Trash2 size={14} />
                          Drop collection
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <nav className="collection-nav">
              {(
                [
                  { id: "documents", label: "Documents", icon: Table2 },
                  { id: "aggregation", label: "Aggregation", icon: Layers },
                  { id: "indexes", label: "Indexes", icon: ListFilter },
                  { id: "schema", label: "Schema", icon: Braces },
                  { id: "explain", label: "Explain", icon: Activity },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  className={active.pane === p.id ? "active" : ""}
                  onClick={() => void changePane(p.id)}
                >
                  <p.icon size={15} />
                  {p.label}
                  {p.id === "indexes" && active.indexes && (
                    <span>{active.indexes.length}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="collection-content">
              {["documents", "aggregation"].includes(active.pane) && (
                <>
                  <section
                    className={`query-panel ${active.pane === "aggregation" ? "aggregation-query" : ""} ${active.aggregationCollapsed ? "editor-collapsed" : ""}`}
                  >
                    <div className="query-panel-header">
                      <div>
                        <span className="query-tag">
                          {active.query.mode === "aggregate"
                            ? "PIPELINE"
                            : "FILTER"}
                        </span>
                        <span className="query-hint">
                          {active.query.mode === "aggregate"
                            ? "Build a pipeline, one stage at a time."
                            : "Find exactly what you’re looking for."}
                        </span>
                      </div>
                      <div>
                        {active.pane === "aggregation" && (
                          <button
                            className="text-button"
                            aria-expanded={!active.aggregationCollapsed}
                            aria-label={
                              active.aggregationCollapsed
                                ? "Expand stage editor"
                                : "Collapse stage editor"
                            }
                            onClick={() =>
                              patch(active.id, {
                                aggregationCollapsed:
                                  !active.aggregationCollapsed,
                              })
                            }
                          >
                            <ChevronDown
                              size={13}
                              className={
                                active.aggregationCollapsed ? "" : "flipped"
                              }
                            />
                            {active.aggregationCollapsed
                              ? "Show editor"
                              : "Hide editor"}
                          </button>
                        )}
                        <button
                          className="text-button"
                          onClick={() => {
                            if (active.query.mode === "find")
                              editQuery({
                                filter: pretty(active.query.filter),
                                projection: pretty(active.query.projection),
                                sort: pretty(active.query.sort),
                              });
                            else
                              editQuery({
                                pipeline: pretty(active.query.pipeline),
                              });
                          }}
                        >
                          <Braces size={13} />
                          Format
                        </button>
                        <button
                          className="text-button"
                          title="Save query (Ctrl / ⌘ S)"
                          onClick={() =>
                            showDialog(
                              "save",
                              "",
                              `${active.query.collection} query`,
                            )
                          }
                        >
                          <BookOpen size={13} />
                          Save
                        </button>
                      </div>
                    </div>
                    {active.query.mode === "aggregate" ? (
                      <Suspense
                        fallback={
                          <div
                            className="editor-loading"
                            style={{ height: 230 }}
                          >
                            Loading pipeline editor…
                          </div>
                        }
                      >
                        <PipelineBuilder
                          onRun={() => {
                            if (!active.loading) void execute(active);
                          }}
                          key={active.id}
                          query={active.query}
                          fields={fields}
                          onChange={editQuery}
                          selectedStage={active.aggregationStage ?? 0}
                          onSelectStage={selectStage}
                          collapsed={active.aggregationCollapsed ?? false}
                          onToggleEditor={() =>
                            patch(active.id, {
                              aggregationCollapsed:
                                !active.aggregationCollapsed,
                            })
                          }
                          onSave={() =>
                            showDialog(
                              "save",
                              "",
                              `${active.query.collection} pipeline`,
                            )
                          }
                          onFormat={() =>
                            editQuery({
                              pipeline: pretty(active.query.pipeline),
                            })
                          }
                        />
                      </Suspense>
                    ) : (
                      <div className="query-code">
                        <Editor
                          value={active.query.filter}
                          onChange={(filter) => editQuery({ filter, skip: 0 })}
                          label="Query filter"
                          height="72px"
                          fields={fields}
                          onRun={() => {
                            if (!active.loading) void execute(active);
                          }}
                        />
                      </div>
                    )}
                    {options && active.query.mode === "find" && (
                      <div className="query-options">
                        <div>
                          <label>Projection</label>
                          <Editor
                            value={active.query.projection}
                            label="Query projection"
                            height="75px"
                            onChange={(projection) =>
                              editQuery({ projection, skip: 0 })
                            }
                          />
                        </div>
                        <div>
                          <label>Sort</label>
                          <Editor
                            value={active.query.sort}
                            label="Query sort"
                            height="75px"
                            onChange={(sort) => editQuery({ sort, skip: 0 })}
                          />
                        </div>
                      </div>
                    )}
                    <div className="query-footer">
                      <div>
                        <button
                          className="text-button"
                          disabled={
                            active.loading ||
                            (active.query.mode === "find"
                              ? active.query.filter.trim() === "{}" &&
                                active.query.sort.trim() === "{}" &&
                                active.query.projection.trim() === "{}"
                              : active.query.pipeline.trim() === "[]")
                          }
                          onClick={() =>
                            editQuery(
                              active.query.mode === "find"
                                ? {
                                    filter: "{}",
                                    sort: "{}",
                                    projection: "{}",
                                    skip: 0,
                                  }
                                : {
                                    pipeline: "[]",
                                    pipelineDisabled: [],
                                    skip: 0,
                                  },
                            )
                          }
                        >
                          <X size={13} />
                          Reset
                        </button>
                        {active.query.mode === "find" && (
                          <>
                            <button
                              className={`text-button ${options ? "selected" : ""}`}
                              onClick={() => setOptions(!options)}
                            >
                              <Settings2 size={14} />
                              Options
                              <ChevronDown
                                size={12}
                                className={options ? "flipped" : ""}
                              />
                            </button>
                            <span className="vertical-rule" />
                          </>
                        )}
                        <label className="limit-input">
                          {active.query.mode === "aggregate"
                            ? "Page size"
                            : "Limit"}
                          <select
                            aria-label="Query page size"
                            value={active.query.limit}
                            onChange={(e) =>
                              editQuery({
                                limit: Number(e.target.value),
                                skip: 0,
                              })
                            }
                          >
                            {[25, 50, 100, 250, 500].map((n) => (
                              <option key={n}>{n}</option>
                            ))}
                          </select>
                        </label>
                        {active.query.mode === "find" &&
                          Object.keys(
                            (() => {
                              try {
                                return JSON.parse(active.query.projection);
                              } catch {
                                return {};
                              }
                            })(),
                          ).length > 0 && (
                            <span className="projection-warning">
                              Projected results are read-only
                            </span>
                          )}
                      </div>
                      <div>
                        <span className="shortcut">
                          <kbd>⌘</kbd>
                          <kbd>↵</kbd>
                        </span>
                        <button
                          className={`button run-button ${active.loading ? "cancel-query" : "primary"}`}
                          onClick={() =>
                            active.loading
                              ? void cancelTab(active.id)
                              : void execute(active)
                          }
                        >
                          {active.loading ? (
                            <Square size={13} />
                          ) : (
                            <Play size={13} fill="currentColor" />
                          )}
                          {active.loading
                            ? "Stop query"
                            : active.query.mode === "aggregate"
                              ? "Run pipeline"
                              : "Run query"}
                        </button>
                      </div>
                    </div>
                  </section>
                  {active.error && (
                    <div className="inline-error" role="alert">
                      <CircleHelp size={16} />
                      <span>{active.error}</span>
                      <button
                        aria-label="Dismiss error"
                        onClick={() => patch(active.id, { error: undefined })}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                  {active.pane === "aggregation" && (
                    <>
                      <div
                        className="aggregation-data-tabs"
                        role="group"
                        aria-label="Aggregation results"
                      >
                        <button
                          className={
                            active.aggregationView !== "pipeline"
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            patch(active.id, { aggregationView: "stage" })
                          }
                        >
                          <Layers size={14} />
                          Stage input / output
                        </button>
                        <button
                          className={
                            active.aggregationView === "pipeline"
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            patch(active.id, { aggregationView: "pipeline" })
                          }
                        >
                          <Table2 size={14} />
                          Pipeline output
                        </button>
                      </div>
                      <Suspense
                        fallback={
                          <div className="empty-state">
                            Loading stage inspector…
                          </div>
                        }
                      >
                        <StageComparison
                          key={active.id}
                          ref={stageComparison}
                          api={api}
                          query={active.query}
                          stage={active.aggregationStage ?? 0}
                          onSelect={selectStage}
                          visible={active.aggregationView !== "pipeline"}
                        />
                      </Suspense>
                    </>
                  )}
                  {(active.pane !== "aggregation" ||
                    active.aggregationView === "pipeline") && (
                    <section className="results-section">
                      <div className="results-toolbar">
                        <div className="results-summary">
                          <strong>
                            {active.resultContext ? "Preview" : "Results"}
                          </strong>
                          {active.resultContext && (
                            <span className="preview-context">
                              {active.resultContext} · page sample
                            </span>
                          )}
                          {active.result && (
                            <>
                              <span className="result-count">
                                {active.result.documents.length}
                                {active.result.hasMore ? "+" : ""}
                              </span>
                              <span className="query-time">
                                <span className="tiny-dot" />
                                {active.result.duration} ms
                              </span>
                            </>
                          )}
                          {resultMismatch && (
                            <span className="stale-label">
                              Query changed · run to update
                            </span>
                          )}
                        </div>
                        <div className="results-actions">
                          <div
                            className="view-switch"
                            role="group"
                            aria-label="Result view"
                          >
                            {(
                              [
                                {
                                  id: "table",
                                  icon: Table2,
                                  label: "Table view",
                                },
                                {
                                  id: "documents",
                                  icon: Braces,
                                  label: "Document view",
                                },
                                { id: "json", icon: Code2, label: "JSON view" },
                              ] as const
                            ).map((v) => (
                              <button
                                key={v.id}
                                title={v.label}
                                aria-label={v.label}
                                aria-pressed={active.view === v.id}
                                className={active.view === v.id ? "active" : ""}
                                onClick={() => patch(active.id, { view: v.id })}
                              >
                                <v.icon size={15} />
                              </button>
                            ))}
                          </div>
                          <span className="vertical-rule" />
                          <button
                            className="icon-button"
                            title="Refresh results"
                            aria-label="Refresh results"
                            disabled={active.loading}
                            onClick={() => void execute(active)}
                          >
                            <RefreshCw size={15} />
                          </button>
                          <div className="menu-anchor">
                            <button
                              className="button small"
                              disabled={!active.result?.documents.length}
                              onClick={() => setExportMenu(!exportMenu)}
                            >
                              <Download size={13} />
                              <span>Export</span>
                              <ChevronDown size={11} />
                            </button>
                            {exportMenu && (
                              <>
                                <button
                                  className="menu-dismiss"
                                  aria-label="Close export menu"
                                  onClick={() => setExportMenu(false)}
                                />
                                <div className="dropdown export-dropdown">
                                  <span className="dropdown-note">
                                    Current page ·{" "}
                                    {active.result?.documents.length} documents
                                  </span>
                                  <button
                                    onClick={() => {
                                      download(
                                        "[\n" +
                                          active
                                            .result!.originals.map(pretty)
                                            .join(",\n") +
                                          "\n]",
                                        `${active.query.collection}.ejson`,
                                      );
                                      setExportMenu(false);
                                    }}
                                  >
                                    <FileJson size={14} />
                                    Extended JSON (lossless)
                                  </button>
                                  <button
                                    onClick={() => {
                                      download(
                                        csv(
                                          active.result!.documents.map((d) =>
                                            Object.fromEntries(
                                              Object.entries(d).map(
                                                ([k, v]) => [
                                                  k,
                                                  ["object", "array"].includes(
                                                    scalar(v).type,
                                                  )
                                                    ? v
                                                    : scalar(v).text,
                                                ],
                                              ),
                                            ),
                                          ),
                                        ),
                                        `${active.query.collection}.csv`,
                                        "text/csv",
                                      );
                                      setExportMenu(false);
                                    }}
                                  >
                                    <Table2 size={14} />
                                    CSV
                                  </button>
                                  <button
                                    onClick={() => {
                                      void copy(
                                        "[\n" +
                                          active
                                            .result!.originals.map(pretty)
                                            .join(",\n") +
                                          "\n]",
                                      );
                                      setExportMenu(false);
                                    }}
                                  >
                                    <Copy size={14} />
                                    Copy JSON
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                          <button
                            className="button small"
                            disabled={readonly || active.loading}
                            onClick={() =>
                              showDialog("insert", '{\n  "name": ""\n}')
                            }
                          >
                            <Plus size={14} />
                            <span>Insert document</span>
                          </button>
                          <button
                            className={`icon-button ${inspector ? "selected" : ""}`}
                            title="Toggle document inspector"
                            aria-label="Toggle document inspector"
                            onClick={() => setInspector(!inspector)}
                          >
                            <PanelRight size={16} />
                          </button>
                        </div>
                      </div>
                      <div
                        className={`results-body ${active.loading ? "loading" : ""}`}
                      >
                        <div className="result-main">
                          {!active.result ||
                          active.result.documents.length === 0 ? (
                            <div className="empty-state">
                              <Search size={28} />
                              <h3>
                                {active.loading
                                  ? "Looking through your data…"
                                  : "No documents found"}
                              </h3>
                              <p>
                                {active.loading
                                  ? "Your query is running."
                                  : "Try a different filter, or insert your first document."}
                              </p>
                              {!active.loading &&
                                active.query.filter !== "{}" && (
                                  <button
                                    className="button"
                                    onClick={() =>
                                      void execute(active, {
                                        ...active.query,
                                        filter: "{}",
                                        skip: 0,
                                      })
                                    }
                                  >
                                    Clear filter
                                  </button>
                                )}
                            </div>
                          ) : active.view === "table" ? (
                            <ResultsTable
                              key={active.id}
                              documents={active.result.documents}
                              fields={fields}
                              selected={active.selected}
                              offset={active.resultQuery?.skip ?? 0}
                              sort={active.resultQuery?.sort ?? "{}"}
                              sortable={
                                active.query.mode === "find" && !active.loading
                              }
                              onSelect={selectRow}
                              onSort={sortColumn}
                            />
                          ) : active.view === "documents" ? (
                            <div className="document-cards">
                              {active.result.documents.map((doc, i) => (
                                <article
                                  className={`document-card ${active.selected === i ? "selected" : ""}`}
                                  key={i}
                                >
                                  <div className="document-card-header">
                                    <span>
                                      DOCUMENT{" "}
                                      {(active.resultQuery?.skip ?? 0) + i + 1}
                                    </span>
                                    <button
                                      className="text-button"
                                      onClick={() => {
                                        patch(active.id, { selected: i });
                                        setInspector(true);
                                      }}
                                    >
                                      Inspect
                                      <ArrowUpRight size={13} />
                                    </button>
                                  </div>
                                  <ValueTree value={doc} />
                                </article>
                              ))}
                            </div>
                          ) : (
                            <div className="json-results">
                              <Editor
                                value={resultsJSON}
                                height="100%"
                                readOnly
                                label="Query results JSON"
                              />
                            </div>
                          )}
                        </div>
                        {inspector && (
                          <aside className="inspector">
                            <div className="inspector-heading">
                              <span>
                                <Braces size={15} />
                                Document inspector
                              </span>
                              <button
                                className="icon-button"
                                aria-label="Close inspector"
                                onClick={() => setInspector(false)}
                              >
                                <X size={14} />
                              </button>
                            </div>
                            {selected && active.selected !== null ? (
                              <>
                                <div className="inspector-subheading">
                                  <div className="inspector-view-switch">
                                    <button
                                      className={
                                        inspectorView === "tree" ? "active" : ""
                                      }
                                      onClick={() => setInspectorView("tree")}
                                    >
                                      Tree
                                    </button>
                                    <button
                                      className={
                                        inspectorView === "json" ? "active" : ""
                                      }
                                      onClick={() => setInspectorView("json")}
                                    >
                                      JSON
                                    </button>
                                  </div>
                                  <div>
                                    <button
                                      className="icon-button"
                                      title="Copy document"
                                      aria-label="Copy document"
                                      onClick={() =>
                                        void copy(
                                          pretty(
                                            active.result!.originals[
                                              active.selected!
                                            ],
                                          ),
                                        )
                                      }
                                    >
                                      <Copy size={13} />
                                    </button>
                                    <button
                                      className="icon-button"
                                      title="Edit document"
                                      aria-label="Edit document"
                                      disabled={!canEdit}
                                      onClick={() =>
                                        showDialog(
                                          "edit",
                                          pretty(
                                            active.result!.originals[
                                              active.selected!
                                            ],
                                          ),
                                        )
                                      }
                                    >
                                      <Pencil size={13} />
                                    </button>
                                  </div>
                                </div>
                                <div className="inspector-content">
                                  {inspectorView === "tree" ? (
                                    <ValueTree value={selected} />
                                  ) : (
                                    <Editor
                                      value={selectedJSON}
                                      height="100%"
                                      readOnly
                                      label="Selected document JSON"
                                    />
                                  )}
                                </div>
                                <div className="inspector-footer">
                                  <span>
                                    Document{" "}
                                    {(active.resultQuery?.skip ?? 0) +
                                      active.selected +
                                      1}
                                  </span>
                                  <div>
                                    <button
                                      className="icon-button danger-text"
                                      aria-label="Delete document"
                                      disabled={!canEdit}
                                      onClick={() => showDialog("delete")}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                    <span className="vertical-rule" />
                                    <button
                                      className="icon-button"
                                      aria-label="Previous document"
                                      disabled={active.selected === 0}
                                      onClick={() =>
                                        patch(active.id, {
                                          selected: active.selected! - 1,
                                        })
                                      }
                                    >
                                      <ChevronLeft size={15} />
                                    </button>
                                    <button
                                      className="icon-button"
                                      aria-label="Next document"
                                      disabled={
                                        active.selected ===
                                        active.result!.documents.length - 1
                                      }
                                      onClick={() =>
                                        patch(active.id, {
                                          selected: active.selected! + 1,
                                        })
                                      }
                                    >
                                      <ChevronRight size={15} />
                                    </button>
                                  </div>
                                </div>
                                {active.result?.readOnly && (
                                  <div className="inspector-readonly">
                                    <LockKeyhole size={11} />
                                    This result is read-only
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="inspector-empty">
                                <div>
                                  <Braces size={25} />
                                </div>
                                <h3>The details are in the document.</h3>
                                <p>
                                  Select a row to explore its fields,
                                  <br />
                                  nested objects, and BSON types.
                                </p>
                                <span>
                                  Click any row to inspect
                                  <ArrowUpRight size={12} />
                                </span>
                              </div>
                            )}
                          </aside>
                        )}
                      </div>
                      <div className="results-footer">
                        <span>
                          {active.result?.documents.length
                            ? `Showing ${(active.resultQuery?.skip ?? 0) + 1}–${(active.resultQuery?.skip ?? 0) + active.result.documents.length}`
                            : "0 documents"}
                          <span className="footer-note">
                            {active.result?.hasMore
                              ? "More documents available"
                              : "End of results"}
                          </span>
                        </span>
                        <div>
                          <button
                            className="text-button"
                            disabled={
                              active.query.skip === 0 ||
                              !!active.resultContext ||
                              active.loading ||
                              !!resultMismatch
                            }
                            onClick={() =>
                              void execute(active, {
                                ...active.query,
                                skip: Math.max(
                                  0,
                                  active.query.skip - active.query.limit,
                                ),
                              })
                            }
                          >
                            <ChevronLeft size={14} />
                            Previous
                          </button>
                          <span className="page-number">
                            {Math.floor(
                              (active.resultQuery?.skip ?? 0) /
                                (active.resultQuery?.limit ??
                                  active.query.limit),
                            ) + 1}
                          </span>
                          <button
                            className="text-button"
                            disabled={
                              !active.result?.hasMore ||
                              !!active.resultContext ||
                              active.loading ||
                              !!resultMismatch
                            }
                            onClick={() =>
                              void execute(active, {
                                ...active.query,
                                skip: active.query.skip + active.query.limit,
                              })
                            }
                          >
                            Next
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    </section>
                  )}
                </>
              )}
              {!["documents", "aggregation"].includes(active.pane) && (
                <section className="aux-panel">
                  {active.error && (
                    <div className="inline-error" role="alert">
                      {active.error}
                    </div>
                  )}
                  {active.auxLoading ? (
                    <div className="empty-state">
                      <Loader2 className="spin" size={26} />
                      <p>Reading {active.pane}…</p>
                    </div>
                  ) : active.pane === "indexes" ? (
                    <>
                      <div className="section-heading">
                        <div>
                          <h2>Indexes</h2>
                          <p>
                            Give your queries a shorter path to the right data.
                          </p>
                        </div>
                        <div className="heading-actions">
                          <button
                            className="button primary"
                            disabled={readonly}
                            onClick={() =>
                              showDialog("createIndex", '{\n  "email": 1\n}')
                            }
                          >
                            <Plus size={15} />
                            Create index
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Refresh indexes"
                            onClick={() => void changePane("indexes", true)}
                          >
                            <RefreshCw size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="index-list">
                        {active.indexes?.map((index) => (
                          <article className="index-card" key={index.name}>
                            <div className="index-icon">
                              <ListFilter size={20} />
                            </div>
                            <div className="index-main">
                              <h3>
                                {index.name}
                                {index.name === "_id_" && (
                                  <span className="badge neutral">Default</span>
                                )}
                                {index.unique && (
                                  <span className="badge green">Unique</span>
                                )}
                              </h3>
                              <code>{JSON.stringify(index.key)}</code>
                              {index.expireAfterSeconds !== undefined && (
                                <small>
                                  Expires after {index.expireAfterSeconds}{" "}
                                  seconds
                                </small>
                              )}
                            </div>
                            <button
                              className="icon-button danger-text"
                              disabled={readonly || index.name === "_id_"}
                              aria-label={`Drop index ${index.name}`}
                              onClick={() => {
                                setIndexTarget(index.name);
                                showDialog("dropIndex");
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </article>
                        ))}
                      </div>
                      <p className="info-note">
                        <CircleHelp size={14} />
                        Index changes run on the server. Creating an index can
                        take time on large collections.
                      </p>
                    </>
                  ) : active.pane === "schema" ? (
                    <>
                      <div className="section-heading">
                        <div>
                          <h2>A sense of your data</h2>
                          <p>
                            Field types and presence in a sample of up to 200
                            documents.
                          </p>
                        </div>
                        <button
                          className="button"
                          onClick={() => void changePane("schema", true)}
                        >
                          <RefreshCw size={14} />
                          Resample
                        </button>
                      </div>
                      <table className="schema-table">
                        <thead>
                          <tr>
                            <th>FIELD</th>
                            <th>OBSERVED TYPES</th>
                            <th>PRESENCE IN SAMPLE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {active.schema?.map((field) => (
                            <tr key={field.path}>
                              <td className="mono">{field.path}</td>
                              <td>
                                {Object.keys(field.types).map((type) => (
                                  <span className="badge neutral" key={type}>
                                    {type}
                                  </span>
                                ))}
                              </td>
                              <td>
                                <div className="presence">
                                  <div>
                                    <span
                                      style={{
                                        width: `${(field.present / field.total) * 100}%`,
                                      }}
                                    />
                                  </div>
                                  <span>
                                    {Math.round(
                                      (field.present / field.total) * 100,
                                    )}
                                    %
                                  </span>
                                  <small>
                                    {field.present}/{field.total}
                                  </small>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!active.schema?.length && (
                        <div className="empty-state">
                          <Braces size={28} />
                          <h3>No fields to sample</h3>
                          <p>
                            Insert some documents to explore the collection’s
                            structure.
                          </p>
                        </div>
                      )}
                      <p className="info-note">
                        The sample is a snapshot, not a schema guarantee. Array
                        element types are not expanded.
                      </p>
                    </>
                  ) : (
                    <>
                      <Suspense
                        fallback={
                          <div className="empty-state">
                            Loading query diagnostics…
                          </div>
                        }
                      >
                        <ExplainPanel
                          key={active.id}
                          api={api}
                          query={active.query}
                          demo={demo}
                          onEdit={() =>
                            void changePane(
                              active.query.mode === "aggregate"
                                ? "aggregation"
                                : "documents",
                            )
                          }
                        />
                      </Suspense>
                    </>
                  )}
                </section>
              )}
            </div>
          </>
        )}
        <footer className="statusbar">
          <div>
            <span className={`status-dot ${active ? "online" : ""}`} />
            <span>
              {active
                ? demo
                  ? "Sample data · local to this session"
                  : `Connected to ${connection?.name}`
                : "Ready when you are"}
            </span>
            {active && (
              <>
                <span className="status-separator" />
                <span>
                  <ShieldCheck size={11} />
                  {readonly ? "Read-only" : "Writes enabled"}
                </span>
              </>
            )}
          </div>
          <div>
            <span>{demo ? "Demo" : "MongoDB native driver"}</span>
            <span className="status-separator" />
            <button onClick={() => showDialog("palette")}>
              <Command size={11} />
              Command menu
            </button>
          </div>
        </footer>
      </main>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleHelp size={16} /> : <CheckCheck size={16} />}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(undefined)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {creationTarget && (
        <CreateCollectionModal
          api={api}
          {...creationTarget}
          onClose={() => setCreationTarget(undefined)}
          onCreated={async (database, collection) => {
            const id = creationTarget.connectionId;
            setCreationTarget(undefined);
            try {
              await loadDatabases(id);
              await loadCollections(id, database);
              openCollection(id, database, collection);
              notify("Collection created");
            } catch (e: any) {
              notify(
                `Collection created, but the explorer could not refresh: ${e.message}`,
                true,
              );
            }
          }}
        />
      )}
      {dialog === "connect" && (
        <ConnectionModal
          api={api}
          secure={secure}
          onClose={closeDialog}
          onConnected={(c) => void didConnect(c)}
        />
      )}
      {dialog === "palette" && (
        <Modal title="Jump to anything" onClose={closeDialog}>
          <div className="palette-search">
            <Search size={18} />
            <input
              aria-label="Search commands and collections"
              placeholder="A collection, a command, a little less clicking…"
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && commandItems[0]) {
                  setDialog(null);
                  commandItems[0].action();
                }
              }}
            />
            <kbd>esc</kbd>
          </div>
          <div className="palette-results">
            {commandItems.slice(0, 14).map((c, i) => (
              <button
                key={i}
                onClick={() => {
                  setDialog(null);
                  c.action();
                }}
              >
                <c.icon size={16} />
                <span>
                  {c.label}
                  <small>{c.detail}</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
            {commandItems.length === 0 && (
              <p className="palette-empty">
                No matches. Try a collection name or “query”.
              </p>
            )}
          </div>
          <div className="palette-footer">
            Type to find · Enter to open first result
          </div>
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal
          title="Make yourself at home"
          subtitle="A small workspace. Everything you need to get going."
          onClose={closeDialog}
        >
          <div className="settings-section">
            <h3>Appearance</h3>
            <div className="theme-options">
              <button
                className={theme === "light" ? "active" : ""}
                onClick={() => setTheme("light")}
              >
                <Sun size={18} />
                Light{theme === "light" && <Check size={15} />}
              </button>
              <button
                className={theme === "dark" ? "active" : ""}
                onClick={() => setTheme("dark")}
              >
                <Moon size={18} />
                Dark{theme === "dark" && <Check size={15} />}
              </button>
            </div>
          </div>
          <div className="settings-section">
            <h3>A few useful shortcuts</h3>
            {[
              ["Run query", "Ctrl / ⌘ Enter"],
              ["Save query", "Ctrl / ⌘ S"],
              ["Jump to anything", "Ctrl / ⌘ K"],
              ["Close a dialog", "Esc"],
            ].map(([a, b]) => (
              <div className="shortcut-row" key={a}>
                <span>{a}</span>
                <kbd>{b}</kbd>
              </div>
            ))}
          </div>
          <div className="settings-section quick-guide">
            <h3>Working with your data</h3>
            <p>
              Queries use JSON and MongoDB Extended JSON. For an ObjectId, use{" "}
              <code>{'{"_id":{"$oid":"24-character hex id"}}'}</code>. Use
              Options for projection and sort.
            </p>
            <p>
              Click a result to inspect it. Editing preserves BSON types and
              checks for concurrent changes. Aggregated and projected results
              are read-only.
            </p>
            <p>
              Exports contain the current page. Imports accept a JSON object or
              array of up to 1,000 documents. Ordered imports can partially
              succeed if a later document fails; refresh before retrying.
            </p>
            <p>
              Saved queries and the last 100 executions stay on this device.
              Query text may contain sensitive values. Connection strings are
              remembered only with a system keyring.
            </p>
          </div>
          <div className="about-canopy">
            <span className="brand-mark">
              <Leaf size={22} />
            </span>
            <div>
              <strong>Canopy {__APP_VERSION__}</strong>
              <span>Open source. MIT licensed. Made for the work you do.</span>
            </div>
          </div>
          <div className="modal-footer">
            {window.canopy && (
              <button
                className="button"
                onClick={() => {
                  setDemo(!demo);
                  setDialog(null);
                }}
              >
                {demo ? "My connections" : "Explore sample workspace"}
                <ArrowRight size={14} />
              </button>
            )}
            <button className="button primary" onClick={closeDialog}>
              All set
              <Check size={14} />
            </button>
          </div>
        </Modal>
      )}
      {dialog &&
        !["connect", "settings", "palette"].includes(dialog) &&
        active && (
          <Modal
            wide={["insert", "import", "edit"].includes(dialog)}
            title={
              {
                insert: "Insert a document",
                import: "Import JSON",
                edit: "Edit document",
                delete: "Delete this document?",
                createCollection: "Create a collection",
                dropCollection: "Drop this collection?",
                createIndex: "Create an index",
                dropIndex: "Remove this index?",
                save: "Keep this query close",
                connect: "",
                palette: "",
                settings: "",
              }[dialog] || ""
            }
            subtitle={`${connection?.name} / ${active.query.database} / ${active.query.collection}`}
            onClose={closeDialog}
          >
            <form onSubmit={submitDialog}>
              {["insert", "edit", "import"].includes(dialog) && (
                <>
                  <div className="editor-modal-hint">
                    <FileJson size={15} />
                    {dialog === "edit"
                      ? "Extended JSON preserves BSON types. Keep the _id field unchanged."
                      : "A JSON object or array of objects. Extended JSON is supported."}
                  </div>
                  {dialog === "import" && (
                    <label className="import-file">
                      <Upload size={17} />
                      <span>Choose a JSON or EJSON file</span>
                      <input
                        aria-label="Choose import file"
                        type="file"
                        accept=".json,.ejson,application/json"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 10_000_000) {
                              setDialogError(
                                "Choose a file smaller than 10 MB.",
                              );
                              return;
                            }
                            setDialogText(await file.text());
                          }
                        }}
                      />
                    </label>
                  )}
                  <div className="document-edit">
                    <Editor
                      value={dialogText}
                      onChange={setDialogText}
                      height="360px"
                      label={
                        dialog === "edit"
                          ? "Edit document JSON"
                          : "Insert document JSON"
                      }
                    />
                  </div>
                  {dialog === "import" && (
                    <p className="info-note">
                      Up to 1,000 documents. Inserts run in order; earlier
                      documents remain inserted if a later one fails.
                    </p>
                  )}
                </>
              )}
              {["save", "createCollection", "dropCollection"].includes(
                dialog,
              ) && (
                <>
                  {dialog === "dropCollection" && (
                    <div className="danger-notice">
                      <Trash2 size={18} />
                      <p>
                        This permanently deletes{" "}
                        <strong>{active.query.collection}</strong> and all its
                        documents and indexes.
                      </p>
                    </div>
                  )}
                  <label className="field">
                    {dialog === "save"
                      ? "Query name"
                      : dialog === "dropCollection"
                        ? `Type “${active.query.collection}” to confirm`
                        : "Collection name"}
                    <input
                      required
                      maxLength={120}
                      value={dialogName}
                      onChange={(e) => setDialogName(e.target.value)}
                      placeholder={
                        dialog === "save"
                          ? "e.g. Active customers"
                          : dialog === "createCollection"
                            ? "e.g. customers"
                            : active.query.collection
                      }
                    />
                  </label>
                  {dialog === "save" && (
                    <div className="save-query-preview">
                      <code>
                        {active.query.mode === "aggregate"
                          ? active.query.pipeline
                          : active.query.filter}
                      </code>
                      <small>
                        Saved locally with this connection and collection.
                      </small>
                    </div>
                  )}
                </>
              )}
              {dialog === "createIndex" && (
                <>
                  <label className="field">
                    Index keys
                    <small>
                      1 for ascending, -1 for descending. Compound keys are
                      supported.
                    </small>
                  </label>
                  <div className="document-edit">
                    <Editor
                      value={dialogText}
                      onChange={setDialogText}
                      height="140px"
                      label="Index keys JSON"
                    />
                  </div>
                  <label className="field">
                    Name <span className="muted">(optional)</span>
                    <input
                      value={dialogName}
                      maxLength={120}
                      onChange={(e) => setDialogName(e.target.value)}
                      placeholder="Generated from the keys"
                    />
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={dialogCheck}
                      onChange={(e) => setDialogCheck(e.target.checked)}
                    />
                    <div>
                      <strong>Unique index</strong>
                      <span>Reject duplicate values for these fields.</span>
                    </div>
                  </label>
                </>
              )}
              {dialog === "delete" && (
                <>
                  <div className="danger-notice">
                    <Trash2 size={18} />
                    <p>
                      This permanently deletes one document from{" "}
                      <strong>{active.query.collection}</strong>.
                    </p>
                  </div>
                  {selected && (
                    <div className="delete-preview">
                      <span>_id</span>
                      <Cell value={selected._id} />
                    </div>
                  )}
                  <p className="info-note">
                    The operation will stop if the document has changed since it
                    was loaded.
                  </p>
                </>
              )}
              {dialog === "dropIndex" && (
                <div className="danger-notice">
                  <ListFilter size={20} />
                  <p>
                    Remove <strong>{indexTarget}</strong>? Queries using this
                    index may become slower.
                  </p>
                </div>
              )}
              {dialogError && (
                <div className="error-box" role="alert">
                  {dialogError}
                </div>
              )}
              <div className="modal-footer">
                <button
                  type="button"
                  className="button"
                  disabled={dialogBusy}
                  onClick={closeDialog}
                >
                  Cancel
                </button>
                <button
                  className={`button ${["delete", "dropCollection", "dropIndex"].includes(dialog) ? "danger" : "primary"}`}
                  disabled={
                    dialogBusy ||
                    (dialog === "dropCollection" &&
                      dialogName !== active.query.collection) ||
                    (["save", "createCollection"].includes(dialog) &&
                      !dialogName.trim())
                  }
                >
                  {dialogBusy && <Loader2 size={14} className="spin" />}
                  {dialogBusy
                    ? "Working…"
                    : {
                        insert: "Insert document",
                        edit: "Save changes",
                        import: "Import documents",
                        delete: "Delete document",
                        createCollection: "Create collection",
                        dropCollection: "Drop collection",
                        createIndex: "Create index",
                        dropIndex: "Remove index",
                        save: "Save query",
                        connect: "",
                        palette: "",
                        settings: "",
                      }[dialog] || "Save"}
                </button>
              </div>
            </form>
          </Modal>
        )}
    </div>
  );
}
