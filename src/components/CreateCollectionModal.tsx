import { useState } from "react";
import { Database, Loader2, Plus } from "lucide-react";
import type { Bridge } from "../../shared/contracts";
import { Modal } from "./Modal";
export function CreateCollectionModal({
  api,
  connectionId,
  database: initialDatabase = "",
  onClose,
  onCreated,
}: {
  api: Bridge;
  connectionId: string;
  database?: string;
  onClose: () => void;
  onCreated: (database: string, collection: string) => void;
}) {
  const [database, setDatabase] = useState(initialDatabase);
  const [collection, setCollection] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.call("createCollection", {
        connectionId,
        database: database.trim(),
        collection: collection.trim(),
      });
      onCreated(database.trim(), collection.trim());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Make room for your data"
      subtitle="Create a collection in an existing or new database."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="connection-art">
          <Database size={22} />
          <div>
            <strong>A fresh collection</strong>
            <span>
              MongoDB creates a new database when its first collection is
              created.
            </span>
          </div>
        </div>
        <label className="field">
          Database name
          <input
            required
            maxLength={63}
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            placeholder="e.g. my_app"
          />
        </label>
        <label className="field">
          Collection name
          <input
            required
            maxLength={120}
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            placeholder="e.g. customers"
          />
        </label>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !database.trim() || !collection.trim()}
          >
            {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            {busy ? "Creating…" : "Create collection"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
