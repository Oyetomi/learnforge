import type { Milestone } from "../../types";
import { layoutRoadmap, type RoadmapEdge } from "./roadmap";

/** A coarse module overview wraps in prerequisite order instead of shrinking a long chain. */
export function layoutCurriculumOverview(
  modules: Milestone[],
  availableWidth: number,
) {
  const source = layoutRoadmap(modules);
  const width = Math.max(280, Math.min(820, availableWidth));
  const columns = width >= 520 ? 2 : 1,
    gap = 38,
    inset = 28;
  const nodeWidth = (width - inset * 2 - gap * (columns - 1)) / columns;
  const ordered = [...source.nodes].sort(
    (a, b) => a.depth - b.depth || a.index - b.index,
  );
  const chars = Math.max(15, Math.floor(nodeWidth / 8));
  const nodeHeight = Math.max(
    128,
    ...ordered.map(
      (n) => 95 + Math.ceil(n.milestone.title.length / chars) * 21,
    ),
  );
  const nodes = ordered.map((node, index) => {
    const row = Math.floor(index / columns),
      position = index % columns;
    const column = row % 2 ? columns - 1 - position : position;
    return {
      ...node,
      x: inset + column * (nodeWidth + gap),
      y: 24 + row * (nodeHeight + 44),
      width: nodeWidth,
      height: nodeHeight,
      row,
    };
  });
  return {
    nodes,
    edges: source.edges,
    width,
    height: Math.ceil(nodes.length / columns) * (nodeHeight + 44) + 8,
  };
}
export function curriculumConnection(
  graph: ReturnType<typeof layoutCurriculumOverview>,
  edge: RoadmapEdge,
): [number, number][] {
  const a = graph.nodes.find((n) => n.milestone.id === edge.from)!,
    b = graph.nodes.find((n) => n.milestone.id === edge.to)!;
  if (a.row === b.row) {
    const right = a.x < b.x;
    return [
      [right ? a.x + a.width + 3 : a.x - 3, a.y + a.height / 2],
      [right ? b.x - 6 : b.x + b.width + 6, b.y + b.height / 2],
    ];
  }
  const start: [number, number] = [a.x + a.width / 2, a.y + a.height + 3],
    end: [number, number] = [b.x + b.width / 2, b.y - 6];
  if (b.row - a.row === 1) {
    const mid = a.y + a.height + 22;
    return [start, [start[0], mid], [end[0], mid], end];
  }
  const lane = graph.width - 8;
  return [
    start,
    [start[0], start[1] + 10],
    [lane, start[1] + 10],
    [lane, end[1] - 10],
    [end[0], end[1] - 10],
    end,
  ];
}
