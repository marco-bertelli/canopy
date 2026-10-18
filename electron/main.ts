import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  Menu,
  session,
  clipboard,
} from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Store } from "./store";
import { MongoService, redact } from "./mongo-service";
import { schemas } from "../shared/validation";
import type { Command, Reply } from "../shared/contracts";

app.setName("Canopy");
if (process.env.CANOPY_DATA_DIR)
  app.setPath("userData", process.env.CANOPY_DATA_DIR);
let service: MongoService;
let window: BrowserWindow | null;
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
else
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
const devUrl = !app.isPackaged ? process.env.CANOPY_DEV_URL : undefined;
const entry = join(__dirname, "../dist/index.html");
function createWindow() {
  window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 980,
    minHeight: 640,
    title: "Canopy",
    backgroundColor: "#f7f8fa",
    icon: join(__dirname, "../resources/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("closed", () => {
    window = null;
  });
  if (devUrl) window.loadURL(devUrl);
  else window.loadFile(entry);
}
if (primaryInstance)
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === "darwin"
            ? [
                {
                  label: "Canopy",
                  submenu: [
                    { role: "about" as const },
                    { role: "quit" as const },
                  ],
                },
              ]
            : []),
          {
            label: "Edit",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          {
            label: "View",
            submenu: [
              { role: "reload" },
              { role: "toggleDevTools" },
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "togglefullscreen" },
            ],
          },
        ]),
      );
      session.defaultSession.setPermissionRequestHandler(
        (_wc, _permission, cb) => cb(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      const secrets = {
        available: () =>
          safeStorage.isEncryptionAvailable() &&
          (process.platform !== "linux" ||
            safeStorage.getSelectedStorageBackend() !== "basic_text"),
        encrypt: (s: string) => safeStorage.encryptString(s).toString("base64"),
        decrypt: (s: string) => {
          if (!secrets.available())
            throw new Error(
              "Unlock your system keyring to use saved connections.",
            );
          return safeStorage.decryptString(Buffer.from(s, "base64"));
        },
      };
      const store = new Store(app.getPath("userData"), secrets);
      await store.load();
      service = new MongoService(store);
      ipcMain.handle(
        "canopy:command",
        async (event, command: string, payload: unknown): Promise<Reply> => {
          if (
            !window ||
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame
          )
            return { ok: false, error: "Untrusted request." };
          const url = event.senderFrame.url;
          if (
            url !== pathToFileURL(entry).href &&
            !(devUrl && new URL(url).origin === devUrl)
          )
            return { ok: false, error: "Untrusted origin." };
          if (!Object.hasOwn(schemas, command))
            return { ok: false, error: "Unknown command." };
          try {
            if (command === "copyText") {
              const input = schemas.copyText.parse(payload);
              clipboard.writeText(input.text);
              return { ok: true, data: undefined };
            }
            return {
              ok: true,
              data: await service.call(command as Command, payload as any),
            };
          } catch (e: any) {
            return {
              ok: false,
              error:
                e?.name === "ZodError"
                  ? "Some fields are invalid. Check the connection, namespace, and query options."
                  : redact(e?.message || "Operation failed."),
            };
          }
        },
      );
      createWindow();
      app.on("activate", () => {
        if (!BrowserWindow.getAllWindows().length) createWindow();
      });
    })
    .catch((e) => {
      console.error("Canopy could not start:", redact(String(e)));
      app.exit(1);
    });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
let quitting = false;
app.on("before-quit", (event) => {
  if (!quitting && service) {
    event.preventDefault();
    quitting = true;
    service.close().finally(() => app.quit());
  }
});
