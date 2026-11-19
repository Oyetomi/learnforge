import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectExplorer, buildTree } from "../ProjectExplorer";

describe("project explorer", () => {
  it("nests files into folders, folders first and alphabetical", () => {
    const tree = buildTree([
      { path: "main.go", readOnly: false },
      { path: "wordcount/main.go", readOnly: false },
      { path: "go.mod", readOnly: false },
      { path: "wordcount/go.mod", readOnly: false },
      { path: "stage01_count_test.go", readOnly: true },
    ]);
    const names = (nodes: any[]): any[] => nodes.map((n) => (n.kind === "folder" ? [n.name, names(n.children)] : n.name));
    expect(names(tree)).toEqual([["wordcount", ["go.mod", "main.go"]], "go.mod", "main.go", "stage01_count_test.go"]);
  });

  it("marks step tests read-only and only offers delete for learner files", () => {
    const html = renderToStaticMarkup(
      <ProjectExplorer
        files={[{ path: "main.go", readOnly: false }, { path: "stage01_a_test.go", readOnly: true, label: "Step 1 · Counting" }]}
        activePath="main.go"
        onSelect={() => {}}
        onAdd={() => true}
        onDelete={() => {}}
        placeholder="wordcount/main.go"
        addError=""
      />
    );
    expect(html).toContain("Step tests");
    expect(html).toContain("Step 1 · Counting");
    expect(html).toContain("stage01_a_test.go · read-only");
    // One row is tabbable: the active file.
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Delete main.go"');
    expect(html).not.toContain('aria-label="Delete stage01_a_test.go"');
  });
});
