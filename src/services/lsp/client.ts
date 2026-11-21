/**
 * Minimal Language Server Protocol client over the Mac app's bridge
 * (src-tauri/src/lsp.rs). Enough for completion, diagnostics, hover,
 * definition, signature help, formatting and rename.
 */

type Json = any;
type Pending = { resolve: (v: Json) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export interface Transport {
  start(trackId: string, profileId: string): Promise<{ serverId: string; root: string; program: string }>;
  send(serverId: string, message: string): Promise<void>;
  stop(serverId: string): Promise<void>;
  /** Subscribe to messages for one server; `null` means it exited. */
  listen(serverId: string, onMessage: (message: string | null) => void): Promise<() => void>;
}

export const tauriTransport: Transport = {
  async start(trackId, profileId) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("lsp_start", { trackId, profileId });
  },
  async send(serverId, message) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("lsp_send", { serverId, message });
  },
  async stop(serverId) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("lsp_stop", { serverId }).catch(() => {});
  },
  async listen(serverId, onMessage) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<{ serverId: string; message: string | null }>("lsp-message", (event) => {
      if (event.payload.serverId === serverId) onMessage(event.payload.message);
    });
  },
};

/** file:// URI for a project-relative path (spaces and the like percent-encoded). */
export const fileUri = (root: string, path: string) =>
  "file://" + `${root}/${path}`.split("/").map(encodeURIComponent).join("/");

/** Project-relative path for a server URI, or undefined if outside the project. */
export function pathFromUri(root: string, uri: string): string | undefined {
  if (!uri.startsWith("file://")) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri.slice("file://".length));
  } catch {
    return undefined;
  }
  const prefix = root.endsWith("/") ? root : `${root}/`;
  // Servers may report /private/var… for /var… roots.
  for (const candidate of [decoded, decoded.replace(/^\/private\//, "/")]) {
    if (candidate.startsWith(prefix)) return candidate.slice(prefix.length);
  }
  return undefined;
}

export class LspClient {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private unlisten?: () => void;
  private versions = new Map<string, number>();
  /** Messages must reach the server in order (a didChange before the completion that depends on it). */
  private outbox: Promise<void> = Promise.resolve();
  private texts = new Map<string, string>();
  capabilities: Json = {};
  onDiagnostics?: (path: string, diagnostics: Json[]) => void;
  onExit?: () => void;
  serverId = "";
  root = "";
  program = "";

  constructor(private transport: Transport, private languageId: string) {}

  async start(trackId: string, profileId: string): Promise<void> {
    const started = await this.transport.start(trackId, profileId);
    this.serverId = started.serverId;
    this.root = started.root;
    this.program = started.program;
    this.unlisten = await this.transport.listen(this.serverId, (raw) => this.receive(raw));
    const result = await this.request(
      "initialize",
      {
        processId: null,
        clientInfo: { name: "LearnForge" },
        rootUri: fileUri(this.root, "").replace(/\/$/, ""),
        workspaceFolders: [{ uri: fileUri(this.root, "").replace(/\/$/, ""), name: "project" }],
        capabilities: {
          textDocument: {
            synchronization: { didSave: false, dynamicRegistration: false },
            completion: {
              completionItem: { snippetSupport: true, documentationFormat: ["markdown", "plaintext"], insertReplaceSupport: false },
              contextSupport: true,
            },
            hover: { contentFormat: ["markdown", "plaintext"] },
            signatureHelp: { signatureInformation: { documentationFormat: ["markdown", "plaintext"], parameterInformation: { labelOffsetSupport: true } } },
            definition: { linkSupport: true },
            formatting: {},
            rename: { prepareSupport: false },
            publishDiagnostics: { relatedInformation: false },
          },
          workspace: { workspaceFolders: true, configuration: true },
        },
      },
      60000
    );
    this.capabilities = result?.capabilities ?? {};
    this.notify("initialized", {});
  }

  private receive(raw: string | null) {
    if (raw === null) {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("The language server stopped."));
      }
      this.pending.clear();
      this.onExit?.();
      return;
    }
    let msg: Json;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.id !== undefined && msg.method === undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message || "Language server error"));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === "textDocument/publishDiagnostics") {
      const path = pathFromUri(this.root, msg.params?.uri || "");
      if (path) this.onDiagnostics?.(path, msg.params.diagnostics || []);
      return;
    }
    if (msg.id !== undefined && msg.method) {
      // Server-to-client requests: answer configuration with defaults, accept the rest.
      const result =
        msg.method === "workspace/configuration"
          ? (msg.params?.items || []).map(() => null)
          : msg.method === "workspace/workspaceFolders"
          ? [{ uri: fileUri(this.root, "").replace(/\/$/, ""), name: "project" }]
          : null;
      void this.post(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })).catch(() => {});
    }
  }

  request(method: string, params: Json, timeoutMs = 15000): Promise<Json> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.post(JSON.stringify({ jsonrpc: "2.0", id, method, params })).catch((e) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  }

  notify(method: string, params: Json) {
    void this.post(JSON.stringify({ jsonrpc: "2.0", method, params })).catch(() => {});
  }

  private post(message: string): Promise<void> {
    const sent = this.outbox.then(() => this.transport.send(this.serverId, message));
    this.outbox = sent.catch(() => {});
    return sent;
  }

  uri(path: string) {
    return fileUri(this.root, path);
  }

  /** The text the server last received for a path. */
  textOf(path: string) {
    return this.texts.get(path);
  }

  open(path: string, text: string) {
    this.versions.set(path, 1);
    this.texts.set(path, text);
    this.notify("textDocument/didOpen", { textDocument: { uri: this.uri(path), languageId: this.languageId, version: 1, text } });
  }

  change(path: string, text: string) {
    if (!this.versions.has(path)) return this.open(path, text);
    if (this.texts.get(path) === text) return;
    this.texts.set(path, text);
    const version = (this.versions.get(path) ?? 1) + 1;
    this.versions.set(path, version);
    // A whole-document change is valid whatever sync kind the server prefers.
    this.notify("textDocument/didChange", { textDocument: { uri: this.uri(path), version }, contentChanges: [{ text }] });
  }

  close(path: string) {
    this.texts.delete(path);
    if (!this.versions.delete(path)) return;
    this.notify("textDocument/didClose", { textDocument: { uri: this.uri(path) } });
  }

  async stop() {
    const id = this.serverId;
    if (id) {
      await this.request("shutdown", null, 2000).catch(() => {});
      this.notify("exit", null);
    }
    this.unlisten?.();
    this.unlisten = undefined;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("The language server stopped."));
    }
    this.pending.clear();
    this.serverId = "";
    if (id) {
      await this.transport.stop(id);
    }
  }
}
