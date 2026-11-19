import React, { useMemo, useRef, useState } from "react";
import { ChevronRight, FilePlus, FileCode2, FlaskConical, Folder, FolderOpen, Trash2, Check, X } from "lucide-react";

export interface ExplorerFile {
  path: string;
  readOnly: boolean;
  /** Shown instead of the path for step tests: "Step 2 · Append-only log". */
  label?: string;
}

interface FolderNode {
  kind: "folder";
  name: string;
  path: string;
  children: TreeNode[];
}
interface FileNode {
  kind: "file";
  name: string;
  path: string;
  readOnly: boolean;
}
type TreeNode = FolderNode | FileNode;

/** Nest flat paths into folders; folders first, then files, each alphabetical. */
export function buildTree(files: ExplorerFile[]): TreeNode[] {
  const root: FolderNode = { kind: "folder", name: "", path: "", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let folder = root;
    parts.slice(0, -1).forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      let next = folder.children.find((c): c is FolderNode => c.kind === "folder" && c.name === part);
      if (!next) {
        next = { kind: "folder", name: part, path, children: [] };
        folder.children.push(next);
      }
      folder = next;
    });
    folder.children.push({ kind: "file", name: parts[parts.length - 1], path: f.path, readOnly: f.readOnly });
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => (a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : a.name.localeCompare(b.name)))
      .map((n) => (n.kind === "folder" ? { ...n, children: sort(n.children) } : n));
  return sort(root.children);
}

interface Props {
  files: ExplorerFile[];
  activePath: string;
  onSelect: (path: string) => void;
  /** Returns false when the name is not allowed; `addError` then explains. */
  onAdd: (path: string) => boolean;
  onDelete: (path: string) => void;
  placeholder: string;
  addError: string;
}

const TESTS = "\u0000step-tests";

export const ProjectExplorer: React.FC<Props> = ({ files, activePath, onSelect, onAdd, onDelete, placeholder, addError }) => {
  const sources = useMemo(() => files.filter((f) => !f.readOnly), [files]);
  const tests = useMemo(() => files.filter((f) => f.readOnly), [files]);
  const tree = useMemo(() => buildTree(sources), [sources]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const treeRef = useRef<HTMLUListElement>(null);

  const startNewFile = (folder = "") => {
    setDraft(folder ? `${folder}/` : "");
    setError("");
  };
  const setOpen = (path: string, open: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(path);
      else next.add(path);
      return next;
    });

  // Roving focus: exactly one visible row is tabbable (last focused, else the
  // active file, else the first row), so Tab enters the tree once.
  const testsOpen = !collapsed.has(TESTS);
  const visible: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      visible.push(n.path);
      if (n.kind === "folder" && !collapsed.has(n.path)) walk(n.children);
    }
  };
  walk(tree);
  if (tests.length) visible.push(TESTS, ...(testsOpen ? tests.map((t) => t.path) : []));
  const tabbable = [focusPath, activePath].find((p) => p && visible.includes(p)) ?? visible[0];
  const items = () => Array.from(treeRef.current?.querySelectorAll<HTMLButtonElement>("button.explorer-item") ?? []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    const current = document.activeElement as HTMLButtonElement | null;
    const i = current ? list.indexOf(current) : -1;
    if (i < 0) return;
    const move = (j: number) => {
      const target = list[Math.max(0, Math.min(list.length - 1, j))];
      target?.focus();
      setFocusPath(target?.dataset.path ?? null);
    };
    const path = current!.dataset.path!;
    const folder = current!.dataset.folder === "true";
    const open = folder && !collapsed.has(path);
    switch (e.key) {
      case "ArrowDown": move(i + 1); break;
      case "ArrowUp": move(i - 1); break;
      case "Home": move(0); break;
      case "End": move(list.length - 1); break;
      case "ArrowRight":
        if (folder && !open) setOpen(path, true);
        else if (folder) move(i + 1);
        else return;
        break;
      case "ArrowLeft": {
        if (folder && open) { setOpen(path, false); break; }
        const parent = current!.dataset.parent;
        if (!parent) return;
        move(list.findIndex((b) => b.dataset.path === parent));
        break;
      }
      default: return;
    }
    e.preventDefault();
  };

  const row = (node: TreeNode, depth: number, parent: string): React.ReactNode => {
    const indent = { paddingLeft: 8 + depth * 14 };
    if (node.kind === "folder") {
      const open = !collapsed.has(node.path);
      return (
        <li key={node.path} role="none">
          <div className="explorer-row is-folder" style={indent}>
            <button
              type="button"
              role="treeitem"
              aria-expanded={open}
              aria-level={depth + 1}
              className="explorer-item"
              tabIndex={node.path === tabbable ? 0 : -1}
              data-path={node.path}
              data-folder="true"
              data-parent={parent}
              onClick={() => { setOpen(node.path, !open); setFocusPath(node.path); }}
            >
              <ChevronRight size={12} className="explorer-chevron" data-open={open} aria-hidden="true" />
              {open ? <FolderOpen size={14} aria-hidden="true" /> : <Folder size={14} aria-hidden="true" />}
              <span>{node.name}</span>
            </button>
            <button type="button" className="explorer-action" tabIndex={-1} aria-label={`New file in ${node.path}`} title={`New file in ${node.path}`} onClick={() => startNewFile(node.path)}>
              <FilePlus size={12} />
            </button>
          </div>
          {open && <ul role="group">{node.children.map((c) => row(c, depth + 1, node.path))}</ul>}
        </li>
      );
    }
    const active = node.path === activePath;
    return (
      <li key={node.path} role="none">
        <div className={`explorer-row ${active ? "is-active" : ""}`} style={indent}>
          <button
            type="button"
            role="treeitem"
            aria-level={depth + 1}
            aria-selected={active}
            className="explorer-item"
            tabIndex={node.path === tabbable ? 0 : -1}
            data-path={node.path}
            data-parent={parent}
            onClick={() => { onSelect(node.path); setFocusPath(node.path); }}
            onKeyDown={(e) => { if (e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) setConfirmDelete(node.path); }}
            title={node.path}
          >
            <span className="explorer-chevron-space" aria-hidden="true" />
            <FileCode2 size={13} aria-hidden="true" />
            <span>{node.name}</span>
          </button>
          {confirmDelete === node.path ? (
            <span className="explorer-confirm" role="group" aria-label={`Delete ${node.name}?`}>
              <button type="button" autoFocus className="explorer-action is-danger" aria-label={`Delete ${node.path}`} onClick={() => { onDelete(node.path); setConfirmDelete(null); }}>
                <Check size={12} />
              </button>
              <button type="button" className="explorer-action" aria-label="Keep the file" onClick={() => setConfirmDelete(null)}>
                <X size={12} />
              </button>
            </span>
          ) : (
            <button type="button" className="explorer-action" tabIndex={-1} aria-label={`Delete ${node.path}`} title="Delete file (Delete key)" onClick={() => setConfirmDelete(node.path)}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <nav className="project-explorer" aria-label="Project files">
      <header>
        <span>
          Files <em>{sources.length}</em>
        </span>
        <button type="button" className="explorer-action" aria-label="New file" title="New file (type folder/name to use a folder)" onClick={() => startNewFile()}>
          <FilePlus size={13} />
        </button>
      </header>
      {draft !== null && (
        <form
          className="explorer-new"
          onSubmit={(e) => {
            e.preventDefault();
            if (onAdd(draft.trim())) setDraft(null);
            else setError(addError);
          }}
        >
          <input
            autoFocus
            value={draft}
            aria-label="New file path"
            aria-invalid={!!error}
            aria-describedby={error ? "explorer-new-error" : "explorer-new-help"}
            placeholder={placeholder}
            onChange={(e) => { setDraft(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Escape") setDraft(null); }}
            onBlur={() => { if (!draft.trim()) setDraft(null); }}
          />
          {error ? <small id="explorer-new-error" role="alert">{error}</small> : <small id="explorer-new-help" className="is-help">Enter to create · Esc to cancel</small>}
        </form>
      )}
      <ul role="tree" aria-label="Project files" ref={treeRef} onKeyDown={onKeyDown}>
        {tree.length === 0 && <li className="explorer-empty" role="none">Files appear here once the first step is prepared.</li>}
        {tree.map((n) => row(n, 0, ""))}
        {tests.length > 0 && (
          <li role="none" className="explorer-section">
            <div className="explorer-row is-section">
              <button
                type="button"
                role="treeitem"
                aria-expanded={testsOpen}
                aria-level={1}
                className="explorer-item"
                tabIndex={tabbable === TESTS ? 0 : -1}
                data-path={TESTS}
                data-folder="true"
                data-parent=""
                onClick={() => setOpen(TESTS, !testsOpen)}
              >
                <ChevronRight size={12} className="explorer-chevron" data-open={testsOpen} aria-hidden="true" />
                <span>Step tests</span>
              </button>
            </div>
            {testsOpen && (
              <ul role="group">
                {tests.map((t) => {
                  const active = t.path === activePath;
                  return (
                    <li key={t.path} role="none">
                      <div className={`explorer-row is-test ${active ? "is-active" : ""}`} style={{ paddingLeft: 22 }}>
                        <button
                          type="button"
                          role="treeitem"
                          aria-level={2}
                          aria-selected={active}
                          className="explorer-item"
                          tabIndex={t.path === tabbable ? 0 : -1}
                          data-path={t.path}
                          data-parent={TESTS}
                          title={`${t.path} · read-only`}
                          onClick={() => { onSelect(t.path); setFocusPath(t.path); }}
                        >
                          <FlaskConical size={13} aria-hidden="true" />
                          <span>{t.label ?? t.path}</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        )}
      </ul>
    </nav>
  );
};
