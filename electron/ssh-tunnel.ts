import { spawn, type ChildProcess } from "node:child_process";
import { createServer, connect } from "node:net";

export interface Tunnel {
  uri: string;
  close(): void;
}

// Rewrites a MongoDB URI to reach its first host through a local forward.
// directConnection stops the driver from following replica-set members to unreachable hosts.
// Userinfo may not contain unescaped "/", "?" or "@", so the authority ends at the first "/" or "?".
export function tunnelTarget(uri: string, localPort: number) {
  if (!uri.startsWith("mongodb://"))
    throw new Error(
      "SSH tunnels need a mongodb:// URI with an explicit host. Replace mongodb+srv:// with one replica-set member.",
    );
  const body = uri.slice("mongodb://".length);
  const end = body.search(/[/?]|$/);
  const authority = body.slice(0, end);
  const at = authority.lastIndexOf("@") + 1;
  const first = authority.slice(at).split(",")[0];
  const [, host, port] = first.match(/^\[?([^\]]+?)\]?(?::(\d+))?$/) ?? [];
  if (!host) throw new Error("The connection string has no host to tunnel to.");
  let rest = body.slice(end).replace(/([?&])directConnection=[^&]*&?/i, "$1");
  rest = rest.replace(/[?&]$/, "");
  rest +=
    (rest.includes("?") ? "&" : rest ? "?" : "/?") + "directConnection=true";
  return {
    host,
    port: Number(port ?? 27017),
    uri: `mongodb://${authority.slice(0, at)}127.0.0.1:${localPort}${rest}`,
  };
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
      .once("error", reject)
      .listen(0, "127.0.0.1", () => {
        const { port } = server.address() as { port: number };
        server.close(() => resolve(port));
      });
  });
}

const reachable = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect(port, "127.0.0.1")
      .once("connect", () => resolve(true))
      .once("error", () => resolve(false));
    socket.unref();
    socket.once("connect", () => socket.destroy());
  });

// ponytail: uses the system ssh client, so ~/.ssh/config, keys, agent, ProxyJump and known_hosts work as-is.
// BatchMode means no password/passphrase prompts; add an askpass bridge if password auth is requested.
export async function openTunnel(
  destination: string,
  uri: string,
  ssh = "ssh",
): Promise<Tunnel> {
  // ponytail: the port is free when probed and taken a moment later; ExitOnForwardFailure reports the rare clash.
  const localPort = await freePort();
  const target = tunnelTarget(uri, localPort);
  const child: ChildProcess = spawn(
    ssh,
    [
      "-N",
      "-o",
      "BatchMode=yes",
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ConnectTimeout=8",
      "-o",
      "ServerAliveInterval=30",
      "-L",
      `127.0.0.1:${localPort}:${target.host.includes(":") ? `[${target.host}]` : target.host}:${target.port}`,
      "--",
      destination,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  let exited = false;
  child.stderr!.on("data", (d) => (stderr = (stderr + d).slice(-1000)));
  const failed = new Promise<never>((_, reject) => {
    const fail = (message: string) => {
      exited = true;
      reject(new Error(`SSH tunnel to ${destination} failed: ${message}`));
    };
    child.once("error", (e) => fail(e.message));
    child.once("exit", (code) =>
      fail(stderr.trim() || `ssh exited with code ${code}.`),
    );
  });
  failed.catch(() => {});
  const close = () => {
    if (!exited) child.kill();
  };
  // ssh opens the local listener only after authentication, so a reachable port means the tunnel is up.
  const ready = (async () => {
    const deadline = Date.now() + 15000;
    while (!exited && Date.now() < deadline) {
      if (await reachable(localPort)) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!exited) throw new Error("SSH tunnel did not open within 15 seconds.");
  })();
  try {
    await Promise.race([ready, failed]);
  } catch (e) {
    close();
    throw e;
  }
  return { uri: target.uri, close };
}
