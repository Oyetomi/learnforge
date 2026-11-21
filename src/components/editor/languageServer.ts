import type * as Monaco from "monaco-editor";
import { LspClient, pathFromUri, tauriTransport, type Transport } from "../../services/lsp/client";
import { isTestPath, type LanguageProfile } from "../../services/languages";

type M = typeof Monaco;
type Json = any;

/** Monaco model URI for a project file; the track keeps topics apart. */
export const modelUri = (monaco: M, trackId: string, path: string) => monaco.Uri.parse(`project/${trackId}/${path}`);
export function modelPath(uri: Monaco.Uri, trackId: string): string | undefined {
  const prefix = `/project/${trackId}/`;
  return uri.path.startsWith(prefix) ? uri.path.slice(prefix.length) : undefined;
}

export type ServerStatus =
  | { state: "off" }
  | { state: "starting" }
  | { state: "ready"; program: string }
  | { state: "unavailable"; message: string };

interface Session {
  client: LspClient;
  trackId: string;
  profile: LanguageProfile;
  onOpenFile: (path: string, line: number, column: number) => void;
}
const sessions = new Map<string, Session>();
const registered = new Set<string>();
let openerRegistered = false;

/** The session for a model, after sending the model's current text to the server. */
const sessionFor = (model: Monaco.editor.ITextModel) => {
  const s = sessions.get(model.getLanguageId());
  const path = s && modelPath(model.uri, s.trackId);
  if (!s || !path) return undefined;
  s.client.change(path, model.getValue());
  return { ...s, path };
};

const toRange = (monaco: M, r: Json) =>
  new monaco.Range(r.start.line + 1, r.start.character + 1, r.end.line + 1, r.end.character + 1);
const toPosition = (p: Monaco.Position) => ({ line: p.lineNumber - 1, character: p.column - 1 });
const markdown = (value: Json): Monaco.IMarkdownString[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(markdown);
  if (typeof value === "string") return [{ value }];
  if (value.kind === "plaintext") return [{ value: value.value.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, "\\$&") }];
  if (value.language) return [{ value: "```" + value.language + "\n" + value.value + "\n```" }];
  return [{ value: value.value ?? "" }];
};

const completionKind = (monaco: M, kind?: number) => {
  const K = monaco.languages.CompletionItemKind;
  const map: Record<number, Monaco.languages.CompletionItemKind> = {
    1: K.Text, 2: K.Method, 3: K.Function, 4: K.Constructor, 5: K.Field, 6: K.Variable, 7: K.Class, 8: K.Interface,
    9: K.Module, 10: K.Property, 11: K.Unit, 12: K.Value, 13: K.Enum, 14: K.Keyword, 15: K.Snippet, 16: K.Color,
    17: K.File, 18: K.Reference, 19: K.Folder, 20: K.EnumMember, 21: K.Constant, 22: K.Struct, 23: K.Event,
    24: K.Operator, 25: K.TypeParameter,
  };
  return map[kind ?? 1] ?? K.Text;
};

function registerProviders(monaco: M, languageId: string) {
  if (registered.has(languageId)) return;
  registered.add(languageId);
  const L = monaco.languages;

  L.registerCompletionItemProvider(languageId, {
    triggerCharacters: [".", ":", ">", "(", "\"", "'", "/", "@", "<", "#", " "],
    async provideCompletionItems(model, position, context) {
      const s = sessionFor(model);
      if (!s) return { suggestions: [] };
      const result = await s.client
        .request("textDocument/completion", {
          textDocument: { uri: s.client.uri(s.path) },
          position: toPosition(position),
          context: context.triggerCharacter ? { triggerKind: 2, triggerCharacter: context.triggerCharacter } : { triggerKind: 1 },
        })
        .catch(() => null);
      const items: Json[] = Array.isArray(result) ? result : result?.items ?? [];
      const word = model.getWordUntilPosition(position);
      const fallback = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      return {
        incomplete: !!result?.isIncomplete,
        suggestions: items.slice(0, 500).map((it) => {
          const edit = it.textEdit;
          const range = edit?.range ? toRange(monaco, edit.range) : edit?.insert ? toRange(monaco, edit.insert) : fallback;
          return {
            label: it.label,
            kind: completionKind(monaco, it.kind),
            detail: it.detail,
            documentation: markdown(it.documentation)[0],
            insertText: edit?.newText ?? it.insertText ?? it.label,
            insertTextRules: it.insertTextFormat === 2 ? L.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
            range,
            sortText: it.sortText,
            filterText: it.filterText,
            preselect: it.preselect,
            additionalTextEdits: (it.additionalTextEdits || []).map((e: Json) => ({ range: toRange(monaco, e.range), text: e.newText })),
          };
        }),
      };
    },
  });

  L.registerHoverProvider(languageId, {
    async provideHover(model, position) {
      const s = sessionFor(model);
      if (!s) return null;
      const r = await s.client.request("textDocument/hover", { textDocument: { uri: s.client.uri(s.path) }, position: toPosition(position) }).catch(() => null);
      if (!r?.contents) return null;
      return { contents: markdown(r.contents), range: r.range ? toRange(monaco, r.range) : undefined };
    },
  });

  L.registerDefinitionProvider(languageId, {
    async provideDefinition(model, position) {
      const s = sessionFor(model);
      if (!s) return null;
      const r = await s.client.request("textDocument/definition", { textDocument: { uri: s.client.uri(s.path) }, position: toPosition(position) }).catch(() => null);
      const list: Json[] = !r ? [] : Array.isArray(r) ? r : [r];
      return list.flatMap((loc) => {
        const uri = loc.targetUri ?? loc.uri;
        const range = loc.targetSelectionRange ?? loc.range;
        const path = uri && s.client.root ? pathFromServer(s.client, uri) : undefined;
        return path && range ? [{ uri: modelUri(monaco, s.trackId, path), range: toRange(monaco, range) }] : [];
      });
    },
  });

  L.registerSignatureHelpProvider(languageId, {
    signatureHelpTriggerCharacters: ["(", ","],
    async provideSignatureHelp(model, position) {
      const s = sessionFor(model);
      if (!s) return null;
      const r = await s.client.request("textDocument/signatureHelp", { textDocument: { uri: s.client.uri(s.path) }, position: toPosition(position) }).catch(() => null);
      if (!r?.signatures?.length) return null;
      return {
        value: {
          activeSignature: r.activeSignature ?? 0,
          activeParameter: r.activeParameter ?? 0,
          signatures: r.signatures.map((sig: Json) => ({
            label: sig.label,
            documentation: markdown(sig.documentation)[0],
            parameters: (sig.parameters || []).map((p: Json) => ({ label: p.label, documentation: markdown(p.documentation)[0] })),
          })),
        },
        dispose() {},
      };
    },
  });

  L.registerDocumentFormattingEditProvider(languageId, {
    async provideDocumentFormattingEdits(model, options) {
      const s = sessionFor(model);
      if (!s) return [];
      const edits = await s.client
        .request("textDocument/formatting", { textDocument: { uri: s.client.uri(s.path) }, options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces } })
        .catch(() => null);
      return (edits || []).map((e: Json) => ({ range: toRange(monaco, e.range), text: e.newText }));
    },
  });

  L.registerRenameProvider(languageId, {
    async provideRenameEdits(model, position, newName) {
      const s = sessionFor(model);
      if (!s) return { edits: [] };
      const r = await s.client
        .request("textDocument/rename", { textDocument: { uri: s.client.uri(s.path) }, position: toPosition(position), newName })
        .catch(() => null);
      const changes: [string, Json[]][] = r?.changes
        ? Object.entries(r.changes)
        : (r?.documentChanges || []).filter((d: Json) => d.textDocument).map((d: Json) => [d.textDocument.uri, d.edits]);
      return {
        edits: changes.flatMap(([uri, edits]) => {
          const path = pathFromServer(s.client, uri);
          if (!path || isTestPath(s.profile, path)) return [];
          const resource = modelUri(monaco, s.trackId, path);
          return edits.map((e) => ({ resource, versionId: undefined, textEdit: { range: toRange(monaco, e.range), text: e.newText } }));
        }),
      };
    },
  });
}

const pathFromServer = (client: LspClient, uri: string) => pathFromUri(client.root, uri);

function registerOpener(monaco: M) {
  if (openerRegistered) return;
  openerRegistered = true;
  // Go-to-definition into another project file switches the editor tab.
  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource, selection) {
      for (const s of sessions.values()) {
        const path = modelPath(resource, s.trackId);
        if (!path) continue;
        const line = selection && "startLineNumber" in selection ? selection.startLineNumber : selection?.lineNumber ?? 1;
        const column = selection && "startColumn" in selection ? selection.startColumn : selection?.column ?? 1;
        s.onOpenFile(path, line, column);
        return true;
      }
      return false;
    },
  });
}

const severity = (monaco: M, s?: number) =>
  s === 2 ? monaco.MarkerSeverity.Warning : s === 3 ? monaco.MarkerSeverity.Info : s === 4 ? monaco.MarkerSeverity.Hint : monaco.MarkerSeverity.Error;

export interface AttachedServer {
  /** Tell the server about the current file contents. */
  sync(files: { path: string; content: string }[]): void;
  dispose(): void;
}

/**
 * Start the profile's language server for a project and connect it to Monaco.
 * `prepare` writes the project to disk first (servers read files there).
 */
export function attachLanguageServer(
  monaco: M,
  opts: {
    trackId: string;
    profile: LanguageProfile;
    files: { path: string; content: string }[];
    prepare: () => Promise<void>;
    onOpenFile: (path: string, line: number, column: number) => void;
    onStatus: (status: ServerStatus) => void;
    transport?: Transport;
  }
): AttachedServer {
  const languageId = opts.profile.monaco;
  const client = new LspClient(opts.transport ?? tauriTransport, languageId);
  const diagnostics = new Map<string, Json[]>();
  const known = new Map<string, string>();
  let disposed = false;
  let ready = false;
  let queued = opts.files;

  const applyMarkers = (path: string) => {
    const model = monaco.editor.getModel(modelUri(monaco, opts.trackId, path));
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      "lsp",
      (diagnostics.get(path) || []).map((d) => ({
        severity: severity(monaco, d.severity),
        message: d.message,
        source: d.source,
        code: d.code !== undefined ? String(d.code) : undefined,
        startLineNumber: d.range.start.line + 1,
        startColumn: d.range.start.character + 1,
        endLineNumber: d.range.end.line + 1,
        endColumn:
          d.range.start.line === d.range.end.line
            ? Math.max(d.range.end.character + 1, d.range.start.character + 2)
            : d.range.end.character + 1,
      }))
    );
  };
  const created = monaco.editor.onDidCreateModel((model) => {
    const path = modelPath(model.uri, opts.trackId);
    if (path) applyMarkers(path);
  });

  const sync = (files: { path: string; content: string }[]) => {
    if (!ready) {
      queued = files;
      return;
    }
    const seen = new Set<string>();
    for (const f of files) {
      seen.add(f.path);
      // An open editor model is newer than the saved workspace while typing.
      const model = monaco.editor.getModel(modelUri(monaco, opts.trackId, f.path));
      const text = model ? model.getValue() : f.content;
      known.set(f.path, text);
      client.change(f.path, text);
    }
    for (const path of [...known.keys()])
      if (!seen.has(path)) {
        known.delete(path);
        client.close(path);
      }
  };

  client.onDiagnostics = (path, list) => {
    diagnostics.set(path, list);
    applyMarkers(path);
  };
  client.onExit = () => {
    if (!disposed) opts.onStatus({ state: "unavailable", message: "The language server stopped. Reopen the code workspace to restart it." });
  };

  opts.onStatus({ state: "starting" });
  void (async () => {
    try {
      await opts.prepare();
      if (disposed) return;
      await client.start(opts.trackId, opts.profile.id);
      if (disposed) {
        await client.stop();
        return;
      }
      registerProviders(monaco, languageId);
      registerOpener(monaco);
      sessions.set(languageId, { client, trackId: opts.trackId, profile: opts.profile, onOpenFile: opts.onOpenFile });
      ready = true;
      sync(queued);
      opts.onStatus({ state: "ready", program: client.program.split("/").pop() || client.program });
    } catch (error) {
      if (client.serverId) void client.stop();
      if (!disposed) opts.onStatus({ state: "unavailable", message: error instanceof Error ? error.message : String(error) });
    }
  })();

  return {
    sync,
    dispose() {
      disposed = true;
      created.dispose();
      if (sessions.get(languageId)?.client === client) sessions.delete(languageId);
      for (const model of monaco.editor.getModels())
        if (modelPath(model.uri, opts.trackId)) monaco.editor.setModelMarkers(model, "lsp", []);
      void client.stop();
    },
  };
}
