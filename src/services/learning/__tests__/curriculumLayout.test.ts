import { describe, expect, it } from "vitest";
import {
  layoutCurriculumOverview,
  curriculumConnection,
} from "../curriculumLayout";
import type { Milestone } from "../../../types";
const modules: Milestone[] = Array.from({ length: 6 }, (_, i) => ({
  id: `m${i}`,
  session_id: "s",
  title: `Module ${i}`,
  prompt: "An outcome",
  starter_code: "",
  status: "pending",
  created_at: 0,
  prerequisite_ids: i ? [`m${i - 1}`] : [],
}));
describe("module overview layout", () => {
  it("wraps a long chain at readable size and preserves every prerequisite", () => {
    const graph = layoutCurriculumOverview(modules, 700);
    expect(graph.nodes).toHaveLength(6);
    expect(graph.edges).toHaveLength(5);
    expect(new Set(graph.nodes.map((n) => n.row)).size).toBe(3);
    expect(graph.nodes.every((n) => n.width >= 220)).toBe(true);
    expect(graph.width).toBe(700);
  });
  it("gives narrow windows a single column without offscreen nodes", () => {
    const graph = layoutCurriculumOverview(modules, 360);
    expect(new Set(graph.nodes.map((n) => n.row)).size).toBe(6);
    expect(
      graph.nodes.every((n) => n.x >= 0 && n.x + n.width <= graph.width)
    ).toBe(true);
  });
  it("routes a long prerequisite around intermediate module labels", () => {
    const graph = layoutCurriculumOverview(
      modules.map((m, i) =>
        i === 5 ? { ...m, prerequisite_ids: ["m0", "m4"] } : m
      ),
      700
    );
    const edge = graph.edges.find((e) => e.from === "m0" && e.to === "m5")!;
    const route = curriculumConnection(graph, edge);
    expect(route.length).toBeGreaterThan(4);
    const outer = route[2][0];
    expect(outer).toBeGreaterThan(
      Math.max(...graph.nodes.map((n) => n.x + n.width))
    );
  });
});
