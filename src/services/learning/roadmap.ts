import type { Milestone } from "../../types";

export interface RoadmapEdge {
  from: string;
  to: string;
  kind: "requires" | "sequence";
}
export interface RoadmapNode {
  milestone: Milestone;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

/** A course-order arrow is not a prerequisite claim. Legacy courses keep that distinction. */
export function roadmapEdges(milestones: Milestone[]): RoadmapEdge[] {
  const ids = new Set(milestones.map((m) => m.id));
  const edges: RoadmapEdge[] = [];
  for (const [index, milestone] of milestones.entries()) {
    const parents = milestone.prerequisite_ids;
    if (parents === undefined) {
      if (index)
        edges.push({
          from: milestones[index - 1].id,
          to: milestone.id,
          kind: "sequence",
        });
    } else
      for (const from of new Set(parents)) {
        if (!ids.has(from) || from === milestone.id) continue;
        // Ignore corrupt/cyclic stored edges instead of creating an unusable map.
        const pending = [milestone.id],
          seen = new Set<string>();
        let cycle = false;
        while (pending.length) {
          const id = pending.pop()!;
          if (id === from) {
            cycle = true;
            break;
          }
          if (seen.has(id)) continue;
          seen.add(id);
          pending.push(
            ...edges.filter((edge) => edge.from === id).map((edge) => edge.to)
          );
        }
        if (!cycle) edges.push({ from, to: milestone.id, kind: "requires" });
      }
  }
  return edges;
}

export function layoutRoadmap(
  milestones: Milestone[],
  direction: "vertical" | "horizontal" = "vertical"
) {
  const edges = roadmapEdges(milestones);
  const remaining = new Map(
    milestones.map((m) => [m.id, edges.filter((e) => e.to === m.id).length])
  );
  const depth = new Map(milestones.map((m) => [m.id, 0]));
  const ready = milestones
    .filter((m) => remaining.get(m.id) === 0)
    .map((m) => m.id);
  while (ready.length) {
    const id = ready.shift()!;
    for (const edge of edges.filter((e) => e.from === id)) {
      depth.set(
        edge.to,
        Math.max(depth.get(edge.to) || 0, (depth.get(id) || 0) + 1)
      );
      remaining.set(edge.to, (remaining.get(edge.to) || 1) - 1);
      if (!remaining.get(edge.to)) ready.push(edge.to);
    }
  }
  const levels = [...new Set(depth.values())].sort((a, b) => a - b);
  const maxColumns = Math.max(
    1,
    ...levels.map(
      (level) => milestones.filter((m) => depth.get(m.id) === level).length
    )
  );
  const width = maxColumns * 178 + (maxColumns - 1) * 30 + 44;
  const nodes: RoadmapNode[] = [];
  let y = 26;
  for (const level of levels) {
    const row = milestones.filter((m) => depth.get(m.id) === level);
    const rowWidth = row.length * 178 + (row.length - 1) * 30;
    const rowHeight = Math.max(
      76,
      ...row.map((m) => 76 + Math.ceil(m.title.length / 22) * 18)
    );
    row.forEach((milestone, column) =>
      nodes.push({
        milestone,
        index: milestones.indexOf(milestone),
        x: (width - rowWidth) / 2 + column * 208,
        y,
        width: 178,
        height: rowHeight,
        depth: level,
      })
    );
    y += rowHeight + 48;
  }
  const longEdges = edges.filter(
    (edge) => (depth.get(edge.to) || 0) - (depth.get(edge.from) || 0) > 1
  );
  if (direction === "horizontal") {
    const top = 24 + longEdges.length * 24;
    const rowHeight = Math.max(90, ...nodes.map((node) => node.height)) + 36;
    return {
      nodes: nodes.map((node) => {
        const siblings = nodes.filter(
          (sibling) => sibling.depth === node.depth
        );
        return {
          ...node,
          x: 24 + node.depth * 238,
          y:
            top +
            ((maxColumns - siblings.length) / 2 + siblings.indexOf(node)) *
              rowHeight,
        };
      }),
      edges,
      width: Math.max(226, (levels.length - 1) * 238 + 226),
      height: maxColumns * rowHeight + top + 12,
    };
  }
  return {
    nodes,
    edges,
    width: width + longEdges.length * 24,
    height: Math.max(160, y - 18),
  };
}

export function roadmapNeighborhood(
  milestones: Milestone[],
  currentId?: string
) {
  if (!currentId) return milestones;
  const edges = roadmapEdges(milestones);
  const adjacent = new Set([
    currentId,
    ...edges
      .filter((e) => e.from === currentId || e.to === currentId)
      .flatMap((e) => [e.from, e.to]),
  ]);
  return milestones.filter((m) => adjacent.has(m.id));
}

export function validPrerequisiteGraph(
  nodes: { id: string; prerequisite_ids?: unknown }[]
): boolean {
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length || nodes.some((node) => !node.id)) return false;
  const parents = new Map<string, string[]>();
  for (const node of nodes) {
    if (
      node.prerequisite_ids !== undefined &&
      (!Array.isArray(node.prerequisite_ids) ||
        node.prerequisite_ids.some(
          (id) => typeof id !== "string" || !ids.has(id) || id === node.id
        ))
    )
      return false;
    parents.set(node.id, [
      ...new Set((node.prerequisite_ids || []) as string[]),
    ]);
  }
  const visited = new Set<string>(),
    visiting = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const parent of parents.get(id) || [])
      if (!visit(parent)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  return nodes.every((node) => visit(node.id));
}

/** Route through layer gaps; long links use an outside lane, never a lesson label. */
export function roadmapConnection(
  graph: ReturnType<typeof layoutRoadmap>,
  edge: RoadmapEdge,
  horizontal: boolean
): [number, number][] {
  const source = graph.nodes.find((n) => n.milestone.id === edge.from)!;
  const target = graph.nodes.find((n) => n.milestone.id === edge.to)!;
  const long = target.depth - source.depth > 1;
  const skipped = graph.edges.filter((e) => {
    const a = graph.nodes.find((n) => n.milestone.id === e.from)!;
    const b = graph.nodes.find((n) => n.milestone.id === e.to)!;
    return b.depth - a.depth > 1;
  });
  const lane = Math.max(0, skipped.indexOf(edge));
  if (horizontal) {
    const x1 = source.x + source.width + 4,
      x2 = target.x - 6;
    const y1 = source.y + source.height / 2,
      y2 = target.y + target.height / 2;
    if (long) {
      const rail = 12 + lane * 24;
      return [
        [x1, y1],
        [x1 + 12, y1],
        [x1 + 12, rail],
        [x2 - 12, rail],
        [x2 - 12, y2],
        [x2, y2],
      ];
    }
    const mid = (x1 + x2) / 2;
    return [
      [x1, y1],
      [mid, y1],
      [mid, y2],
      [x2, y2],
    ];
  }
  const x1 = source.x + source.width / 2,
    x2 = target.x + target.width / 2;
  const y1 = source.y + source.height + 4,
    y2 = target.y - 6;
  if (long) {
    const rail =
      Math.max(...graph.nodes.map((n) => n.x + n.width)) + 12 + lane * 24;
    return [
      [x1, y1],
      [x1, y1 + 10],
      [rail, y1 + 10],
      [rail, y2 - 10],
      [x2, y2 - 10],
      [x2, y2],
    ];
  }
  const mid = (y1 + y2) / 2;
  return [
    [x1, y1],
    [x1, mid],
    [x2, mid],
    [x2, y2],
  ];
}
