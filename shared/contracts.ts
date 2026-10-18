export type Environment = "local" | "development" | "staging" | "production";
export interface Connection {
  id: string;
  name: string;
  color: string;
  environment: Environment;
  readOnly: boolean;
  host: string;
  saved: boolean;
  ssh?: string;
}
export interface ConnectionInput {
  id?: string;
  name: string;
  uri: string;
  color: string;
  environment: Environment;
  readOnly: boolean;
  remember: boolean;
  ssh?: string;
}
export interface Namespace {
  connectionId: string;
  database: string;
  collection: string;
}
export interface Query extends Namespace {
  requestId?: string;
  mode: "find" | "aggregate";
  filter: string;
  projection: string;
  sort: string;
  pipeline: string;
  pipelineDisabled?: number[];
  limit: number;
  skip: number;
}
export type StageSide = "input" | "output";
export type StageRequest = Query & { stage: number; side: StageSide };
export interface QueryResult {
  documents: Record<string, unknown>[];
  originals: string[];
  hasMore: boolean;
  duration: number;
  readOnly: boolean;
}
export interface CollectionInfo {
  name: string;
  type: string;
}
export interface IndexInfo {
  name: string;
  key: Record<string, unknown>;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
}
export interface SchemaField {
  path: string;
  types: Record<string, number>;
  present: number;
  total: number;
}
export interface SavedQuery {
  id: string;
  name: string;
  query: Query;
  updatedAt: string;
}
export interface HistoryEntry {
  id: string;
  query: Query;
  createdAt: string;
  count: number;
  duration: number;
}
export interface Workspace {
  saved: SavedQuery[];
  history: HistoryEntry[];
}
export interface Requests {
  copyText: { text: string };
  cancelQuery: { connectionId: string; requestId: string };
  boot: undefined;
  connect: ConnectionInput;
  reconnect: { connectionId: string };
  disconnect: { connectionId: string };
  forgetConnection: { connectionId: string };
  databases: { connectionId: string };
  collections: { connectionId: string; database: string };
  query: Query;
  previewStage: StageRequest;
  countStage: StageRequest;
  explain: Query & { verbosity?: "queryPlanner" | "executionStats" };
  indexes: Namespace;
  createIndex: Namespace & { keys: string; name: string; unique: boolean };
  dropIndex: Namespace & { name: string };
  schema: Namespace;
  insert: Namespace & { documents: string };
  replace: Namespace & { original: string; document: string };
  delete: Namespace & { original: string };
  createCollection: Namespace;
  dropCollection: Namespace & { confirmation: string };
  saveQuery: { name: string; query: Query; id?: string };
  removeQuery: { id: string };
  clearHistory: undefined;
  workspace: undefined;
}
export interface Responses {
  copyText: void;
  boot: {
    connections: Connection[];
    secureStorage: boolean;
    activeConnections: string[];
  };
  connect: Connection;
  reconnect: Connection;
  disconnect: void;
  forgetConnection: void;
  databases: string[];
  collections: CollectionInfo[];
  query: QueryResult;
  previewStage: QueryResult;
  countStage: { count: string; duration: number };
  cancelQuery: void;
  explain: Record<string, unknown>;
  indexes: IndexInfo[];
  createIndex: string;
  dropIndex: void;
  schema: SchemaField[];
  insert: { count: number };
  replace: void;
  delete: void;
  createCollection: void;
  dropCollection: void;
  saveQuery: SavedQuery;
  removeQuery: void;
  clearHistory: void;
  workspace: Workspace;
}
export type Command = keyof Requests;
export interface Bridge {
  call<K extends Command>(
    command: K,
    payload: Requests[K],
  ): Promise<Responses[K]>;
}
export type Reply = { ok: true; data: unknown } | { ok: false; error: string };
