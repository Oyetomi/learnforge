import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  advanceWalkthrough,
  seekWalkthrough,
  startWalkthrough,
  validateStateModel,
  type StateModel,
} from "../../../services/learning/stateModel";
import { ScientificFigure, scientificConnections, scientificEntityRows, type FigureEntityBounds } from "../ScientificFigure";

function model(): StateModel {
  return {
    version: 1,
    presentation: { style: "scientific", layout: "lanes" },
    initialStateId: "ready",
    entities: [{ id: "source", label: "Source" }, { id: "recipient", label: "Recipient" }],
    states: [
      { id: "ready", label: "Before the change", description: "Choose whether the value is preserved or shared.", entities: [{ entityId: "source", status: "current", value: "`2`", tone: "active" }, { entityId: "recipient", status: "waiting", value: "—", tone: "waiting" }], relations: [] },
      { id: "copied", label: "A separate value", description: "The recipient keeps its original input.", entities: [{ entityId: "source", status: "current", value: "`3`", tone: "active" }, { entityId: "recipient", status: "preserved", value: "`2`", tone: "done" }], relations: [{ id: "copy", from: "source", to: "recipient", label: "Value at handoff", kind: "value" }] },
      { id: "shared", label: "A shared value", description: "The recipient follows the source's current value.", entities: [{ entityId: "source", status: "current", value: "`3`", tone: "active" }, { entityId: "recipient", status: "shared", value: "`3`", tone: "done" }], relations: [{ id: "shared-link", from: "recipient", to: "source", label: "Reads the same value", kind: "reference" }] },
    ],
    transitions: [
      { id: "copy", from: "ready", to: "copied", label: "Preserve the input", explanation: "The earlier value remains independent of the source.", sourceLines: [] },
      { id: "share", from: "ready", to: "shared", label: "Share the value", explanation: "Both refer to the current value.", sourceLines: [] },
      { id: "return-copy", from: "copied", to: "ready", label: "Return to the start", explanation: "Compare the other choice.", sourceLines: [] },
      { id: "return-shared", from: "shared", to: "ready", label: "Return to the start", explanation: "Compare the other choice.", sourceLines: [] },
    ],
  };
}

describe("scientific teaching figure contract", () => {
  it("keeps legacy state models unchanged and validates the optional publication presentation", () => {
    const legacy = model(); delete legacy.presentation;
    for (const state of legacy.states) delete state.relations;
    expect(validateStateModel(legacy)).toEqual(legacy);
    expect(validateStateModel(model())).toEqual(model());
    expect(validateStateModel({ ...model(), presentation: { style: "raw-html", layout: "lanes" } })).toBeNull();
    expect(validateStateModel({ ...model(), presentation: { style: "scientific", layout: "unknown" } })).toBeNull();
  });

  it("rejects missing endpoints, self-relations, duplicate IDs and unbounded or malformed annotations", () => {
    const invalid: unknown[] = [];
    for (const relation of [
      { id: "r", from: "source", to: "absent", kind: "flow" },
      { id: "r", from: "source", to: "source", kind: "value" },
      { id: "r", from: "source", to: "recipient", kind: "execute" },
      { id: 'r\" onclick=\"evil()', from: "source", to: "recipient", kind: "value" },
      { id: "r", from: "source", to: "recipient", kind: "value", label: "x".repeat(91) },
      { id: "r", from: "source", to: "recipient", kind: "value", label: { html: "unsafe" } },
    ]) {
      const value = model(); (value.states[0] as any).relations = [relation]; invalid.push(value);
    }
    const duplicate = model(); duplicate.states[1].relations!.push({ ...duplicate.states[1].relations![0] }); invalid.push(duplicate);
    const tooMany = model(); tooMany.states[0].relations = Array.from({ length: 13 }, (_, index) => ({ id: `r-${index}`, from: "source", to: "recipient", kind: "value" })); invalid.push(tooMany);
    for (const value of invalid) expect(validateStateModel(value)).toBeNull();
  });

  it("preserves authored cyclic references and stable entity placement across alternate states", () => {
    const figure = model();
    expect(validateStateModel(figure)).not.toBeNull();
    // The two alternate states point in opposite directions: neither is falsely ranked as a causal root.
    expect(scientificEntityRows(figure)).toEqual([["source", "recipient"]]);
    figure.states[2].relations = [{ id: "second-copy", from: "source", to: "recipient", kind: "flow" }];
    expect(scientificEntityRows(figure)).toEqual([["source"], ["recipient"]]);
    expect(scientificEntityRows({ ...figure, states: [...figure.states].reverse() })).toEqual(scientificEntityRows(figure));
  });

  it("changes values and relationship semantics on a real authored branch without retaining an abandoned future", () => {
    const figure = model();
    const initial = startWalkthrough(figure);
    const copy = advanceWalkthrough(figure, initial, "copy");
    expect(figure.states.find(state => state.id === copy.visits[copy.index].stateId)?.entities[1].value).toBe("`2`");
    expect(figure.states.find(state => state.id === copy.visits[copy.index].stateId)?.relations?.[0].kind).toBe("value");
    const share = advanceWalkthrough(figure, seekWalkthrough(copy, 0), "share");
    expect(share.visits.map(visit => visit.stateId)).toEqual(["ready", "shared"]);
    expect(figure.states.find(state => state.id === share.visits[share.index].stateId)?.entities[1].value).toBe("`3`");
    expect(figure.states.find(state => state.id === share.visits[share.index].stateId)?.relations?.[0].kind).toBe("reference");
    expect(initial.visits).toHaveLength(1);
    expect(advanceWalkthrough(figure, initial, "return-copy")).toBe(initial);
  });

  it("renders real math, escaped labels and highlighted code without generated markup or canvas execution", () => {
    const figure = model();
    figure.entities[0].label = "<img src=x onerror=evil()>";
    figure.states[0].entities[0].value = "$\\frac{1}{2}$";
    figure.states[0].entities[1].value = '`const message = "hello"`';
    figure.source = { language: "javascript", code: '<script>evil()</script>' };
    const html = renderToStaticMarkup(<ScientificFigure model={figure} onInteract={vi.fn()} />);
    expect(html).toContain('class="katex"');
    expect(html).toContain('class="hljs-keyword"');
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<canvas");
    expect(html).toContain("Illustrative states");
    expect(html).toContain("Preserve the input");
    expect(html).toContain("Share the value");
  });

  it("labels both comparison panels and keeps current-state relations accessible", () => {
    const figure = model();
    figure.presentation!.layout = "comparison";
    figure.initialStateId = "shared";
    const html = renderToStaticMarkup(<ScientificFigure model={figure} onInteract={vi.fn()} notes={[{ label: "Notice", description: "Compare what changes." }]} takeaway="Keep one condition fixed." />);
    expect(html).toContain('aria-label="Starting state"');
    expect(html).toContain('aria-label="Current state"');
    expect(html).toContain("Reads the same value");
    expect(html).toContain("(reference)");
    expect(html).toContain("Keep one condition fixed.");
    expect(html).not.toContain("recorded execution");
  });

  it("highlights related source and safely falls back to escaped text for an unknown grammar", () => {
    const figure = model();
    figure.source = { language: "javascript", code: 'const message = "<img onerror=evil()>";' };
    const highlighted = renderToStaticMarkup(<ScientificFigure model={figure} onInteract={vi.fn()} />);
    expect(highlighted).toContain('<pre><code><span class="hljs-keyword">const</span>');
    expect(highlighted).not.toContain("<img");
    figure.source.language = "unregistered-language";
    const fallback = renderToStaticMarkup(<ScientificFigure model={figure} onInteract={vi.fn()} />);
    expect(fallback).toContain('<pre><code>const message = &quot;&lt;img onerror=evil()&gt;&quot;;</code></pre>');
  });

  it("moves dense or parallel relationship descriptions to a numbered figure key", () => {
    const figure = model();
    figure.states[0].relations = Array.from({ length: 12 }, (_, index) => ({ id: `r-${index}`, from: "source", to: "recipient", kind: "flow", label: `Relationship ${index + 1}` }));
    const html = renderToStaticMarkup(<ScientificFigure model={figure} onInteract={vi.fn()} />);
    expect(html).toContain('class="scientific-figure-relation-key" aria-label="Figure relationships"');
    expect(html.match(/Relationship \d+/g)).toHaveLength(12);
    expect(html).not.toContain('class="scientific-figure-relation-text"');
  });

  it("routes skip-row links around intermediate text at both narrow and wide widths", () => {
    const relations = [
      { id: "a-b", from: "a", to: "b", kind: "flow" as const },
      { id: "b-c", from: "b", to: "c", kind: "flow" as const },
      { id: "a-c", from: "a", to: "c", kind: "reference" as const },
      { id: "c-a", from: "c", to: "a", kind: "reference" as const },
    ];
    const intersectsText = (a: { x: number; y: number }, b: { x: number; y: number }, box: FigureEntityBounds) => {
      if (a.x === b.x) return a.x > box.left - 2 && a.x < box.left + box.width + 2 && Math.max(a.y, b.y) > box.top - 2 && Math.min(a.y, b.y) < box.top + box.height + 2;
      return a.y > box.top - 2 && a.y < box.top + box.height + 2 && Math.max(a.x, b.x) > box.left - 2 && Math.min(a.x, b.x) < box.left + box.width + 2;
    };
    for (const width of [390, 720]) {
      const bounds: FigureEntityBounds[] = [
        { id: "a", left: width / 2 - 100, top: 24, width: 200, height: 90 },
        { id: "b", left: width / 2 - 100, top: 188, width: 200, height: 110 },
        { id: "c", left: width / 2 - 100, top: 372, width: 200, height: 90 },
      ];
      const routes = scientificConnections(relations, bounds, width);
      expect(routes.slice(0, 2).map(route => route.routing)).toEqual(["direct", "direct"]);
      for (const route of routes.slice(2)) {
        expect(route.routing).toBe("gutter");
        expect(route.waypoints!.every(point => point.x >= 0 && point.x <= width)).toBe(true);
        for (let i = 1; i < route.waypoints!.length; i++) {
          for (const box of bounds) expect(intersectsText(route.waypoints![i - 1], route.waypoints![i], box)).toBe(false);
        }
      }
      expect(routes[2].path).not.toBe(routes[3].path);
      const reordered = scientificConnections([...relations].reverse(), bounds, width);
      for (const route of routes) expect(reordered.find(item => item.relation.id === route.relation.id)?.path).toBe(route.path);
    }
  });
});
