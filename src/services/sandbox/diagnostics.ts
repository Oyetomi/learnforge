/**
 * Turn compiler, test-runner and traceback output into file/line diagnostics,
 * so errors from a run can be underlined in the editor. Works on the common
 * `path:line[:col]: message` shape (Go, C/C++, javac, Ruby, Node), Rust's
 * `--> path:line:col`, and Python's `File "path", line N` tracebacks.
 */
export interface RunDiagnostic {
  path: string;
  line: number;
  column?: number;
  message: string;
  severity: "error" | "warning";
}

/** Map an output path (absolute, ./relative, file://) to a known project path. */
function resolvePath(raw: string, known: string[]): string | undefined {
  const clean = raw.replace(/^file:\/\//, "").replace(/^\.\//, "");
  return (
    known.find((k) => clean === k) ??
    known
      .filter((k) => clean.endsWith(`/${k}`))
      .sort((a, b) => b.length - a.length)[0]
  );
}

const severityOf = (message: string): "error" | "warning" =>
  /^\s*warning\b/i.test(message) ? "warning" : "error";

export function parseDiagnostics(output: string, known: string[], max = 50): RunDiagnostic[] {
  const out: RunDiagnostic[] = [];
  const seen = new Set<string>();
  const push = (d: RunDiagnostic) => {
    const key = `${d.path}:${d.line}:${d.message}`;
    if (!seen.has(key) && out.length < max && d.line > 0) {
      seen.add(key);
      out.push(d);
    }
  };
  const lines = output.split(/\r?\n/);
  let lastHeadline = "";
  let pythonFrame: { path: string; line: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(error|warning)(\[\w+\])?:/.test(line)) lastHeadline = line.trim();

    // Rust: "  --> src/lib.rs:3:5" under an "error[E…]: message" headline.
    const arrow = /^\s*-->\s+(\S+?):(\d+):(\d+)/.exec(line);
    if (arrow) {
      const path = resolvePath(arrow[1], known);
      if (path)
        push({ path, line: +arrow[2], column: +arrow[3], message: lastHeadline || "error", severity: severityOf(lastHeadline) });
      continue;
    }

    // Python traceback: remember the innermost project frame; the final
    // "SomeError: message" line becomes its message.
    const frame = /^\s*File "([^"]+)", line (\d+)/.exec(line);
    if (frame) {
      const path = resolvePath(frame[1], known);
      if (path) pythonFrame = { path, line: +frame[2] };
      continue;
    }
    if (pythonFrame && /^[A-Za-z_][\w.]*(Error|Exception|Failure)\b.*:?/.test(line.trim()) && !/^\s/.test(line)) {
      push({ ...pythonFrame, message: line.trim(), severity: "error" });
      pythonFrame = null;
      continue;
    }

    // Generic: "path:line[:col]: message" (Go, clang, javac, ruby, node).
    const generic = /(?:^|[\s(])((?:file:\/\/)?[\w./-]*?[\w-]+\.[A-Za-z]{1,5}):(\d+)(?::(\d+))?(?::|\s+in\b)\s*(.*)$/.exec(line);
    if (generic) {
      const path = resolvePath(generic[1], known);
      if (!path) continue;
      let message = generic[4].trim();
      // A bare location (stack frame) takes the nearest message line.
      if (!message) message = lines[i + 1]?.trim() || lastHeadline || "error";
      push({ path, line: +generic[2], column: generic[3] ? +generic[3] : undefined, message, severity: severityOf(message) });
    }
  }
  return out;
}
