import { describe, expect, it, vi } from "vitest";
import { LspClient, fileUri, pathFromUri, type Transport } from "../client";

/** A fake server: answers initialize/completion and records what the client sent. */
function fakeTransport() {
  const sent: any[] = [];
  let deliver: (m: string | null) => void = () => {};
  const transport: Transport = {
    start: vi.fn(async () => ({ serverId: "lsp1", root: "/Users/me/Library/Application Support/lf/projects/t", program: "/usr/bin/clangd" })),
    async send(_id, raw) {
      const msg = JSON.parse(raw);
      sent.push(msg);
      queueMicrotask(() => {
        if (msg.method === "initialize") deliver(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { capabilities: { completionProvider: {} } } }));
        if (msg.method === "textDocument/completion") deliver(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { items: [{ label: "count" }] } }));
      });
    },
    stop: vi.fn(async () => {}),
    async listen(_id, onMessage) {
      deliver = onMessage;
      return () => {};
    },
  };
  return { transport, sent, push: (m: unknown) => deliver(m === null ? null : JSON.stringify(m)) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("LSP client", () => {
  it("maps project paths to percent-encoded file URIs and back", () => {
    const root = "/Users/me/Library/Application Support/lf/projects/t";
    const uri = fileUri(root, "src/lib.rs");
    expect(uri).toBe("file:///Users/me/Library/Application%20Support/lf/projects/t/src/lib.rs");
    expect(pathFromUri(root, uri)).toBe("src/lib.rs");
    expect(pathFromUri("/var/folders/x/p", "file:///private/var/folders/x/p/a.go")).toBe("a.go");
    expect(pathFromUri(root, "file:///usr/include/stdio.h")).toBeUndefined();
  });

  it("initializes, syncs documents and answers requests", async () => {
    const { transport, sent } = fakeTransport();
    const client = new LspClient(transport, "c");
    await client.start("t", "c");
    await settle();
    expect(sent.map((m) => m.method)).toEqual(["initialize", "initialized"]);
    expect(client.capabilities.completionProvider).toBeDefined();
    client.open("store.c", "int x;");
    client.change("store.c", "int y;");
    client.change("store.c", "int y;");
    client.close("store.c");
    await settle();
    expect(sent.slice(2).map((m) => [m.method, m.params.textDocument.version])).toEqual([
      ["textDocument/didOpen", 1],
      ["textDocument/didChange", 2],
      ["textDocument/didClose", undefined],
    ]);
    expect(sent[3].params.contentChanges).toEqual([{ text: "int y;" }]);
    const result = await client.request("textDocument/completion", {});
    expect(result.items[0].label).toBe("count");
  });

  it("routes diagnostics to project paths, answers server requests, and fails pending requests on exit", async () => {
    const { transport, sent, push } = fakeTransport();
    const client = new LspClient(transport, "c");
    await client.start("t", "c");
    const diagnostics = vi.fn();
    const exited = vi.fn();
    client.onDiagnostics = diagnostics;
    client.onExit = exited;
    push({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: client.uri("store.c"), diagnostics: [{ message: "bad" }] } });
    expect(diagnostics).toHaveBeenCalledWith("store.c", [{ message: "bad" }]);
    push({ jsonrpc: "2.0", id: 99, method: "workspace/configuration", params: { items: [{}, {}] } });
    await settle();
    expect(sent.find((m) => m.id === 99)).toEqual({ jsonrpc: "2.0", id: 99, result: [null, null] });
    const hanging = client.request("textDocument/hover", {}, 60000);
    push(null);
    await expect(hanging).rejects.toThrow(/stopped/);
    expect(exited).toHaveBeenCalled();
  });
});
