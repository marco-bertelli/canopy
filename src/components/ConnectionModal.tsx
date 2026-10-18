import { useState } from "react";
import {
  ArrowRight,
  Check,
  Database,
  LockKeyhole,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import type { Bridge, Connection, Environment } from "../../shared/contracts";
import { Modal } from "./Modal";
export function ConnectionModal({
  api,
  secure,
  onClose,
  onConnected,
}: {
  api: Bridge;
  secure: boolean;
  onClose: () => void;
  onConnected: (c: Connection) => void;
}) {
  const [name, setName] = useState("Local MongoDB");
  const [uri, setUri] = useState("mongodb://localhost:27017");
  const [environment, setEnvironment] = useState<Environment>("local");
  const [readOnly, setReadOnly] = useState(false);
  const [remember, setRemember] = useState(secure);
  const [color, setColor] = useState("#65bc9a");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showUri, setShowUri] = useState(false);
  const [ssh, setSsh] = useState("");
  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onConnected(
        await api.call("connect", {
          name: name.trim(),
          uri: uri.trim(),
          environment,
          readOnly,
          remember,
          color,
          ssh: ssh.trim() || undefined,
        }),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="A new connection"
      subtitle="Your data stays between you and your database."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={connect}>
        <div className="connection-art">
          <div className="connection-art-icon">
            <Database size={25} />
          </div>
          <div>
            <strong>Your next workspace</strong>
            <span>Local server, replica set, or MongoDB Atlas</span>
          </div>
          <LockKeyhole size={18} />
        </div>
        <label className="field">
          Connection name
          <input
            autoComplete="off"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Local development"
          />
        </label>
        <label className="field">
          Connection string
          <div className="connection-uri-input">
            <input
              aria-label="Connection string"
              className="mono"
              type={showUri ? "text" : "password"}
              required
              autoComplete="off"
              spellCheck={false}
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="mongodb://localhost:27017"
            />
            <button
              type="button"
              className="icon-button"
              aria-label={
                showUri ? "Hide connection string" : "Show connection string"
              }
              aria-pressed={showUri}
              onClick={() => setShowUri(!showUri)}
            >
              {showUri ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <small>
            Use your MongoDB URI for credentials, TLS, replica sets, and
            authSource.
          </small>
        </label>
        <label className="field">
          SSH tunnel (optional)
          <input
            className="mono"
            autoComplete="off"
            spellCheck={false}
            maxLength={255}
            value={ssh}
            onChange={(e) => setSsh(e.target.value)}
            placeholder="user@bastion or ~/.ssh/config alias"
          />
          <small>
            Uses your system ssh with its keys, agent, and config. The URI host
            is reached from the SSH server.
          </small>
        </label>
        <div className="form-row">
          <label className="field">
            Environment
            <select
              value={environment}
              onChange={(e) => {
                const v = e.target.value as Environment;
                setEnvironment(v);
                if (v === "production") setReadOnly(true);
              }}
            >
              <option value="local">Local</option>
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </label>
          <div className="field">
            Connection color
            <div className="color-picker">
              {["#65bc9a", "#7196df", "#b491d1", "#d2a363", "#d67c7c"].map(
                (c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Use color ${c}`}
                    aria-pressed={color === c}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  >
                    {color === c && <Check size={13} />}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(e) => setReadOnly(e.target.checked)}
          />
          <div>
            <strong>Read-only connection</strong>
            <span>Browse and query. Disable all data changes.</span>
          </div>
          <ShieldCheck size={18} />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            disabled={!secure}
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <div>
            <strong>Remember connection</strong>
            <span>
              {secure
                ? "Connection string encrypted using your system keyring."
                : "No system keyring available. Connect for this session."}
            </span>
          </div>
        </label>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Connecting…" : "Connect"}
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
