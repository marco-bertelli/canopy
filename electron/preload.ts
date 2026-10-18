import { contextBridge, ipcRenderer } from "electron";
import type { Bridge, Command, Reply, Requests } from "../shared/contracts";
const bridge: Bridge = {
  async call<K extends Command>(command: K, payload: Requests[K]) {
    const reply: Reply = await ipcRenderer.invoke(
      "canopy:command",
      command,
      payload,
    );
    if (!reply.ok) throw new Error(reply.error);
    return reply.data as any;
  },
};
contextBridge.exposeInMainWorld("canopy", bridge);
