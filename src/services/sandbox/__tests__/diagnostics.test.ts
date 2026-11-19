import { describe, expect, it } from "vitest";
import { parseDiagnostics } from "../diagnostics";

describe("run diagnostics", () => {
  it("reads Go compile errors and test failures", () => {
    const out = "# learnforge\n./store.go:12:5: undefined: putLog\n    stage02_log_test.go:10: log has 0 entries\n--- FAIL: TestStage02Log";
    expect(parseDiagnostics(out, ["store.go", "stage02_log_test.go"])).toEqual([
      { path: "store.go", line: 12, column: 5, message: "undefined: putLog", severity: "error" },
      { path: "stage02_log_test.go", line: 10, column: undefined, message: "log has 0 entries", severity: "error" },
    ]);
  });

  it("reads Rust errors from the --> line under the headline", () => {
    const out = "error[E0425]: cannot find value `x` in this scope\n --> src/lib.rs:3:5\n  |\n3 |     x\n";
    expect(parseDiagnostics(out, ["src/lib.rs"])).toEqual([
      { path: "src/lib.rs", line: 3, column: 5, message: "error[E0425]: cannot find value `x` in this scope", severity: "error" },
    ]);
  });

  it("reads Python tracebacks with absolute paths", () => {
    const out = 'Traceback (most recent call last):\n  File "/Users/me/Library/projects/t/test_stage01_a.py", line 5, in test_a\n    store.put(1)\n  File "/Users/me/Library/projects/t/store.py", line 9, in put\n    raise KeyError(k)\nKeyError: 1\n';
    expect(parseDiagnostics(out, ["store.py", "test_stage01_a.py"])).toEqual([
      { path: "store.py", line: 9, message: "KeyError: 1", severity: "error" },
    ]);
  });

  it("reads clang, javac, ruby and node locations, and warnings", () => {
    const out = [
      "store.c:4:10: warning: unused variable 'n' [-Wunused-variable]",
      "Store.java:7: error: ';' expected",
      "store.rb:3:in 'put': undefined method 'fetch' for nil (NoMethodError)",
      "    at put (file:///Users/me/projects/t/store.ts:8:11)",
    ].join("\n");
    const d = parseDiagnostics(out, ["store.c", "Store.java", "store.rb", "store.ts"]);
    expect(d.map((x) => [x.path, x.line, x.severity])).toEqual([
      ["store.c", 4, "warning"],
      ["Store.java", 7, "error"],
      ["store.rb", 3, "error"],
      ["store.ts", 8, "error"],
    ]);
  });

  it("ignores files outside the project", () => {
    expect(parseDiagnostics("/usr/local/go/src/fmt/print.go:12:3: boom", ["store.go"])).toEqual([]);
  });
});
