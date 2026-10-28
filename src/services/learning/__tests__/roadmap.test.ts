import { describe, expect, it } from "vitest";
import {
  layoutRoadmap,
  roadmapEdges,
  roadmapNeighborhood,
  validPrerequisiteGraph,
} from "../roadmap";
import type { Milestone } from "../../../types";
const node = (id: string, prerequisite_ids?: string[]): Milestone => ({
  id,
  session_id: "s1",
  title: id,
  prompt: "Learn",
  starter_code: "",
  status: "pending",
  created_at: 0,
  prerequisite_ids,
});
describe("learning roadmap", () => {
  it("labels legacy course order without inventing prerequisite claims", () => {
    expect(roadmapEdges([node("a"), node("b"), node("c")])).toEqual([
      { from: "a", to: "b", kind: "sequence" },
      { from: "b", to: "c", kind: "sequence" },
    ]);
  });
  it("lays out real branches at the same depth with a shared dependency", () => {
    const graph = layoutRoadmap([
      node("a", []),
      node("b", ["a"]),
      node("c", ["a"]),
      node("d", ["b", "c"]),
    ]);
    const b = graph.nodes.find((n) => n.milestone.id === "b")!,
      c = graph.nodes.find((n) => n.milestone.id === "c")!,
      d = graph.nodes.find((n) => n.milestone.id === "d")!;
    expect(b.y).toBe(c.y);
    expect(b.x).not.toBe(c.x);
    expect(d.y).toBeGreaterThan(b.y);
    expect(graph.edges).toHaveLength(4);
  });
  it("rejects unknown references and cycles in generated plans", () => {
    expect(
      validPrerequisiteGraph([
        { id: "a", prerequisite_ids: ["b"] },
        { id: "b", prerequisite_ids: ["a"] },
      ])
    ).toBe(false);
    expect(
      validPrerequisiteGraph([{ id: "a", prerequisite_ids: ["missing"] }])
    ).toBe(false);
    expect(validPrerequisiteGraph([{ id: "a" }, { id: "a" }])).toBe(false);
    expect(
      validPrerequisiteGraph([
        { id: "a", prerequisite_ids: [] },
        { id: "b", prerequisite_ids: ["a"] },
      ])
    ).toBe(true);
  });
  it("focuses only on the current concept and direct connections", () => {
    expect(
      roadmapNeighborhood(
        [node("a"), node("b"), node("c"), node("d")],
        "b"
      ).map((m) => m.id)
    ).toEqual(["a", "b", "c"]);
  });
  it("handles malformed stored connections without hanging or changing input", () => {
    const nodes = [node("a", ["b"]), node("b", ["a", "missing", "b"])],
      before = JSON.stringify(nodes);
    expect(layoutRoadmap(nodes).nodes).toHaveLength(2);
    expect(roadmapEdges(nodes)).toHaveLength(1);
    expect(JSON.stringify(nodes)).toBe(before);
  });
});

it("routes adjacent and skip links outside intermediate lesson boxes in both orientations", async () => {
  const { roadmapConnection } = await import("../roadmap");
  const lessons = [
    node("a", []),
    node("b", ["a"]),
    node("c", ["a"]),
    node("d", ["b", "c", "a"]),
    node("e", ["d", "b"]),
  ];
  for (const direction of ["vertical", "horizontal"] as const) {
    const graph = layoutRoadmap(lessons, direction);
    for (const edge of graph.edges) {
      const points = roadmapConnection(graph, edge, direction === "horizontal");
      for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1], points[i]];
        expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
        for (const n of graph.nodes.filter(
          (n) => n.milestone.id !== edge.from && n.milestone.id !== edge.to
        )) {
          const crosses =
            a[0] === b[0]
              ? a[0] > n.x &&
                a[0] < n.x + n.width &&
                Math.max(a[1], b[1]) > n.y &&
                Math.min(a[1], b[1]) < n.y + n.height
              : a[1] > n.y &&
                a[1] < n.y + n.height &&
                Math.max(a[0], b[0]) > n.x &&
                Math.min(a[0], b[0]) < n.x + n.width;
          expect(
            crosses,
            `${direction}: ${edge.from}->${edge.to} crosses ${n.milestone.id}`
          ).toBe(false);
        }
      }
    }
  }
});
