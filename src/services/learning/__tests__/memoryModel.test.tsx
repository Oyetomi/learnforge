import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parsePointerTarget,
  validateMemoryModel,
  type MemoryModelSpec,
} from "../memoryModel";

// Stateful hook harness that stays completely inert (delegating to real React)
// during renderToStaticMarkup, and activates only inside mountInteractive().
const hookHarness = vi.hoisted(() => {
  const state = {
    active: false,
    cursor: 0,
    states: [] as unknown[],
    refs: [] as Array<{ current: unknown }>,
    memos: [] as Array<{ deps: readonly unknown[] | undefined; value: unknown }>,
    callbacks: [] as Array<{
      deps: readonly unknown[] | undefined;
      value: unknown;
    }>,
  };
  return {
    state,
    reset() {
      state.cursor = 0;
      state.states = [];
      state.refs = [];
      state.memos = [];
      state.callbacks = [];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const depsEqual = (
    a: readonly unknown[] | undefined,
    b: readonly unknown[] | undefined
  ) =>
    a !== undefined &&
    b !== undefined &&
    a.length === b.length &&
    a.every((item, idx) => Object.is(item, b[idx]));

  return {
    ...actual,
    useId: () => (hookHarness.state.active ? "mem-test-id" : actual.useId()),
    useState: <T,>(initial: T | (() => T)) => {
      if (!hookHarness.state.active) return actual.useState(initial);
      const slot = hookHarness.state.cursor++;
      if (!(slot in hookHarness.state.states)) {
        hookHarness.state.states[slot] =
          typeof initial === "function" ? (initial as () => T)() : initial;
      }
      const setState = (next: T | ((prev: T) => T)) => {
        const prev = hookHarness.state.states[slot] as T;
        hookHarness.state.states[slot] =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      };
      return [hookHarness.state.states[slot] as T, setState] as const;
    },
    useRef: <T,>(initial: T) => {
      if (!hookHarness.state.active) return actual.useRef(initial);
      const slot = hookHarness.state.cursor++;
      if (!hookHarness.state.refs[slot]) {
        hookHarness.state.refs[slot] = { current: initial };
      }
      return hookHarness.state.refs[slot] as React.MutableRefObject<T>;
    },
    useMemo: <T,>(factory: () => T, deps: React.DependencyList) => {
      if (!hookHarness.state.active) return actual.useMemo(factory, deps);
      const slot = hookHarness.state.cursor++;
      const prev = hookHarness.state.memos[slot];
      if (prev && depsEqual(prev.deps, deps)) {
        return prev.value as T;
      }
      const value = factory();
      hookHarness.state.memos[slot] = { deps, value };
      return value;
    },
    useCallback: <T extends Function>(fn: T, deps: React.DependencyList) => {
      if (!hookHarness.state.active) return actual.useCallback(fn, deps);
      const slot = hookHarness.state.cursor++;
      const prev = hookHarness.state.callbacks[slot];
      if (prev && depsEqual(prev.deps, deps)) {
        return prev.value as T;
      }
      hookHarness.state.callbacks[slot] = { deps, value: fn };
      return fn;
    },
    useEffect: (
      effect: React.EffectCallback,
      deps?: React.DependencyList
    ) => {
      if (!hookHarness.state.active) return actual.useEffect(effect, deps);
    },
  };
});

import {
  computeMemoryPointerRoutes,
  MemoryDiagram,
} from "../../../components/learning/MemoryDiagram";

const sliceReallocationSpec: MemoryModelSpec = {
  version: 1,
  language: "go",
  source: [
    "s := make([]int, 2, 3)",
    "s[0], s[1] = 10, 20",
    "s = append(s, 30)",
    "s = append(s, 40)",
  ].join("\n"),
  frames: [
    {
      id: "init",
      label: "Initial slice with spare capacity",
      explanation:
        "The stack header `s` points into slot 0 of the heap array, with one spare capacity slot at index 2.",
      codeLine: 2,
      blocks: [
        {
          id: "slice_s",
          label: "s (slice header)",
          region: "stack",
          kind: "slice",
          fields: [
            { name: "ptr", value: "0xc00010", pointsTo: "arr_old:0" },
            { name: "len", value: "2" },
            { name: "cap", value: "3" },
          ],
        },
        {
          id: "arr_old",
          label: "Backing array A",
          region: "heap",
          kind: "array",
          meta: "len=2, cap=3",
          cells: [
            { index: "0", value: "10", highlight: true },
            { index: "1", value: "20" },
            { index: "2", value: "0", inactive: true },
          ],
        },
      ],
    },
    {
      id: "append_in_place",
      label: "Append fits in spare capacity",
      explanation:
        "Because `len < cap`, `append` writes `30` into index 2 without allocating a new backing array.",
      codeLine: 3,
      predictionPrompt:
        "Will appending 30 allocate a new heap array or reuse Backing array A?",
      blocks: [
        {
          id: "slice_s",
          label: "s (slice header)",
          region: "stack",
          kind: "slice",
          changed: true,
          fields: [
            { name: "ptr", value: "0xc00010", pointsTo: "arr_old:0" },
            { name: "len", value: "3", changed: true },
            { name: "cap", value: "3" },
          ],
        },
        {
          id: "arr_old",
          label: "Backing array A",
          region: "heap",
          kind: "array",
          meta: "len=3, cap=3",
          changed: true,
          cells: [
            { index: "0", value: "10" },
            { index: "1", value: "20" },
            { index: "2", value: "30", highlight: true },
          ],
        },
      ],
    },
    {
      id: "reallocate",
      label: "Capacity exceeded triggers reallocation",
      explanation:
        "Appending `40` allocates Backing array B with doubled capacity and detaches Backing array A.",
      codeLine: 4,
      predictionPrompt:
        "What happens to `s.ptr` and Backing array A when appending 40?",
      blocks: [
        {
          id: "slice_s",
          label: "s (slice header)",
          region: "stack",
          kind: "slice",
          changed: true,
          fields: [
            {
              name: "ptr",
              value: "0xc00080",
              pointsTo: "arr_new:0",
              changed: true,
            },
            { name: "len", value: "4", changed: true },
            { name: "cap", value: "6", changed: true },
          ],
        },
        {
          id: "arr_old",
          label: "Backing array A",
          region: "heap",
          kind: "array",
          meta: "old cap=3",
          stale: true,
          cells: [
            { index: "0", value: "10" },
            { index: "1", value: "20" },
            { index: "2", value: "30" },
          ],
        },
        {
          id: "arr_new",
          label: "Backing array B",
          region: "heap",
          kind: "array",
          meta: "len=4, cap=6",
          changed: true,
          cells: [
            { index: "0", value: "10" },
            { index: "1", value: "20" },
            { index: "2", value: "30" },
            { index: "3", value: "40", highlight: true },
            { index: "4", value: "0", inactive: true },
            { index: "5", value: "0", inactive: true },
          ],
        },
      ],
    },
  ],
};

type El = React.ReactElement<Record<string, unknown>>;

function collectElements(node: React.ReactNode): El[] {
  if (!React.isValidElement(node)) return [];
  const el = node as El;
  return [
    el,
    ...React.Children.toArray(el.props.children as React.ReactNode).flatMap(
      collectElements
    ),
  ];
}

function textContent(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (React.isValidElement(node)) {
    const props = node.props as Record<string, unknown>;
    if (typeof node.type === "function") {
      try {
        return textContent((node.type as (p: Record<string, unknown>) => React.ReactNode)(props));
      } catch {
        return "";
      }
    }
    return textContent(props.children as React.ReactNode);
  }
  return "";
}

function mountInteractive(spec: MemoryModelSpec, language?: string) {
  hookHarness.reset();
  const onInteract = vi.fn();

  const render = () => {
    hookHarness.state.active = true;
    hookHarness.state.cursor = 0;
    try {
      return MemoryDiagram({ spec, language, onInteract });
    } finally {
      hookHarness.state.active = false;
    }
  };

  let tree = render();

  const rerender = () => {
    tree = render();
  };

  const allNodes = () => collectElements(tree);

  const findButtonByText = (label: string) =>
    allNodes().find(
      (el) =>
        el.type === "button" &&
        textContent(el.props.children as React.ReactNode).trim() === label
    );

  const clickButton = (label: string) => {
    const btn = findButtonByText(label);
    if (!btn) {
      throw new Error(`Button "${label}" not found`);
    }
    if (btn.props.disabled) return;
    (btn.props.onClick as () => void)();
    rerender();
  };

  return {
    onInteract,
    getTree: () => tree,
    allNodes,
    findButtonByText,
    clickButton,
    fullText: () => textContent(tree),
  };
}

describe("memoryModel validation and pointer parsing", () => {
  it("parses block-level and cell-level pointer targets", () => {
    expect(parsePointerTarget("arr_old")).toEqual({ blockId: "arr_old" });
    expect(parsePointerTarget("arr_old:0")).toEqual({
      blockId: "arr_old",
      cellIndex: "0",
    });
    expect(parsePointerTarget(" arr_old : 2 ")).toEqual({
      blockId: "arr_old",
      cellIndex: "2",
    });
    expect(parsePointerTarget("arr_old:")).toEqual({ blockId: "arr_old" });
  });

  it("validates a multi-frame slice reallocation spec with stack pointers and inactive capacity slots", () => {
    const safe = validateMemoryModel({
      ...sliceReallocationSpec,
      version: undefined,
      extraUntrustedField: "should be stripped",
    });
    expect(safe).not.toBeNull();
    expect(safe!.version).toBe(1);
    expect(safe).not.toHaveProperty("extraUntrustedField");
    expect(safe!.frames).toHaveLength(3);
    expect(safe!.frames[0].blocks[0].fields?.[0].pointsTo).toBe("arr_old:0");
    expect(safe!.frames[0].blocks[1].cells?.[2].inactive).toBe(true);
    expect(safe!.frames[2].blocks[1].stale).toBe(true);
  });

  it("coerces numeric cell indices and applies region and kind defaults", () => {
    const raw = {
      frames: [
        {
          id: "f1",
          label: "Defaulted layout",
          explanation: "Checks defaults for kind, region, and numeric cell indices.",
          blocks: [
            {
              id: "local_x",
              label: "main frame",
              fields: [{ name: "x", value: "42", pointsTo: "buf:1" }],
            },
            {
              id: "buf",
              label: "buffer",
              cells: [
                { index: 0, value: "a" },
                { index: 1, value: "b", highlight: true },
              ],
            },
          ],
        },
      ],
    };
    const safe = validateMemoryModel(raw);
    expect(safe).not.toBeNull();
    expect(safe!.frames[0].blocks[0]).toMatchObject({
      kind: "struct",
      region: "stack",
    });
    expect(safe!.frames[0].blocks[1]).toMatchObject({
      kind: "array",
      region: "heap",
    });
    expect(safe!.frames[0].blocks[1].cells?.[0].index).toBe("0");
    expect(safe!.frames[0].blocks[1].cells?.[1].index).toBe("1");
  });

  it("drops dangling pointsTo references without rejecting an otherwise valid model", () => {
    const copy = structuredClone(sliceReallocationSpec);
    copy.frames[0].blocks[0].fields![0].pointsTo = "arr_new:0"; // exists only in frame 2, not frame 0
    copy.frames[0].blocks[0].fields![1].pointsTo = "nonexistent_block";
    const safe = validateMemoryModel(copy);
    expect(safe).not.toBeNull();
    expect(safe!.frames[0].blocks[0].fields![0].pointsTo).toBeUndefined();
    expect(safe!.frames[0].blocks[0].fields![1].pointsTo).toBeUndefined();
    // Valid pointer in frame 1 remains intact
    expect(safe!.frames[1].blocks[0].fields![0].pointsTo).toBe("arr_old:0");
  });

  it("rejects malformed specs, invalid bounds, duplicate ids, and out-of-range code lines", () => {
    expect(validateMemoryModel(null)).toBeNull();
    expect(validateMemoryModel({ ...sliceReallocationSpec, version: 2 })).toBeNull();
    expect(validateMemoryModel({ ...sliceReallocationSpec, frames: [] })).toBeNull();

    // > 12 frames
    const tooManyFrames = Array.from({ length: 13 }, (_, idx) => ({
      ...sliceReallocationSpec.frames[0],
      id: `f_${idx}`,
    }));
    expect(
      validateMemoryModel({ ...sliceReallocationSpec, frames: tooManyFrames })
    ).toBeNull();

    // Duplicate frame IDs
    const dupFrames = structuredClone(sliceReallocationSpec);
    dupFrames.frames[1].id = dupFrames.frames[0].id;
    expect(validateMemoryModel(dupFrames)).toBeNull();

    // Duplicate block IDs within one frame
    const dupBlocks = structuredClone(sliceReallocationSpec);
    dupBlocks.frames[0].blocks[1].id = dupBlocks.frames[0].blocks[0].id;
    expect(validateMemoryModel(dupBlocks)).toBeNull();

    // Block with neither fields nor cells
    const emptyBlock = structuredClone(sliceReallocationSpec);
    delete emptyBlock.frames[0].blocks[0].fields;
    expect(validateMemoryModel(emptyBlock)).toBeNull();

    // Invalid codeLine > source lines
    const badLine = structuredClone(sliceReallocationSpec);
    badLine.frames[0].codeLine = 99;
    expect(validateMemoryModel(badLine)).toBeNull();

    // codeLine without source
    const lineNoSource = structuredClone(sliceReallocationSpec);
    delete lineNoSource.source;
    expect(validateMemoryModel(lineNoSource)).toBeNull();

    // Source exceeding 50 lines
    const longSource = structuredClone(sliceReallocationSpec);
    longSource.source = Array.from({ length: 51 }, (_, i) => `x := ${i}`).join("\n");
    expect(validateMemoryModel(longSource)).toBeNull();

    // Too many cells (> 16)
    const tooManyCells = structuredClone(sliceReallocationSpec);
    tooManyCells.frames[0].blocks[1].cells = Array.from({ length: 17 }, (_, i) => ({
      index: String(i),
      value: String(i),
    }));
    expect(validateMemoryModel(tooManyCells)).toBeNull();

    // Invalid block ID characters
    const badBlockId = structuredClone(sliceReallocationSpec);
    badBlockId.frames[0].blocks[0].id = 'bad"id';
    expect(validateMemoryModel(badBlockId)).toBeNull();
  });
});

describe("MemoryDiagram SSR and pointer routing", () => {
  it("renders cleanly via renderToStaticMarkup with Stack/Heap, contiguous cells, source highlight, and XSS escaping", () => {
    const spec = structuredClone(sliceReallocationSpec);
    spec.frames[0].blocks[0].label = "<img src=x onerror=evil()>";
    spec.source = [
      'func demo() { msg := "<script>evil()</script>" }',
      "s := make([]int, 2, 3)",
      "s = append(s, 30)",
      "s = append(s, 40)",
    ].join("\n");
    spec.frames[0].codeLine = 2;

    const html = renderToStaticMarkup(
      <MemoryDiagram spec={spec} onInteract={vi.fn()} />
    );

    expect(html).toContain('class="memory-diagram"');
    expect(html).toContain('aria-label="Stack memory"');
    expect(html).toContain('aria-label="Heap memory"');
    expect(html).toContain('class="memory-regions is-two-column"');
    expect(html).toContain('data-pointer-origin="slice_s:0"');
    expect(html).toContain('data-pointer-target="arr_old:0"');
    expect(html).toContain('data-memory-cell="arr_old:0"');
    expect(html).toContain("is-inactive");
    expect(html).toContain("is-highlight");
    expect(html).toContain("len=2, cap=3");
    expect(html).toContain('data-active-line="true"');
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("Light paper");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");

    const invalidHtml = renderToStaticMarkup(
      <MemoryDiagram
        spec={{ version: 1, frames: [] }}
        onInteract={vi.fn()}
      />
    );
    expect(invalidHtml).toContain('class="memory-diagram-invalid"');
  });

  it("collapses to a single column when all blocks live in one region", () => {
    const stackOnly: MemoryModelSpec = {
      version: 1,
      frames: [
        {
          id: "stack-only",
          label: "Call stack frame",
          explanation: "Only stack primitives are active.",
          blocks: [
            {
              id: "main_frame",
              label: "main()",
              region: "stack",
              kind: "frame",
              fields: [
                { name: "a", value: "10" },
                { name: "b", value: "20" },
              ],
            },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(
      <MemoryDiagram spec={stackOnly} onInteract={vi.fn()} />
    );
    expect(html).toContain('aria-label="Stack memory"');
    expect(html).not.toContain('aria-label="Heap memory"');
    expect(html).toContain('class="memory-regions is-single-column"');
  });

  it("computes non-overlapping curved SVG routes for stack-to-heap, inner-cell, and single-column pointers", () => {
    const routes = computeMemoryPointerRoutes(
      [
        {
          id: "stack-to-cell0",
          origin: { left: 220, top: 64, width: 8, height: 8 },
          originBlock: { left: 20, top: 30, width: 220, height: 90 },
          target: { left: 320, top: 60, width: 48, height: 48 },
          targetBlock: { left: 310, top: 30, width: 200, height: 96 },
          isCellTarget: true,
          sameBlock: false,
          changed: false,
          stale: false,
        },
        {
          id: "stack-to-inner-cell2",
          origin: { left: 220, top: 90, width: 8, height: 8 },
          originBlock: { left: 20, top: 30, width: 220, height: 90 },
          target: { left: 416, top: 60, width: 48, height: 48 },
          targetBlock: { left: 310, top: 30, width: 200, height: 96 },
          isCellTarget: true,
          sameBlock: false,
          changed: true,
          stale: false,
        },
        {
          id: "same-col",
          origin: { left: 220, top: 60, width: 8, height: 8 },
          originBlock: { left: 20, top: 30, width: 220, height: 80 },
          target: { left: 20, top: 150, width: 220, height: 80 },
          targetBlock: { left: 20, top: 150, width: 220, height: 80 },
          isCellTarget: false,
          sameBlock: false,
          changed: false,
          stale: true,
        },
      ],
      560
    );

    expect(routes).toHaveLength(3);
    // Direct cell 0 target lands on left edge of cell
    expect(routes[0].path).toContain("M ");
    expect(routes[0].path).toContain(" C ");
    expect(routes[0].x2).toBe(316);
    // Inner cell 2 target arcs to top-center of cell 2 rather than crossing cells 0 and 1
    expect(routes[1].x2).toBe(440);
    expect(routes[1].y2).toBe(56);
    expect(routes[1].changed).toBe(true);
    // Same-column route goes through right outer gutter beyond block right edge (240)
    expect(routes[2].stale).toBe(true);
    expect(routes[2].x2).toBe(244);
  });
});

describe("MemoryDiagram interactive controls", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reveals the prediction prompt before stepping on Next, advances on Reveal, allows direct pill jumps, and resets", () => {
    const view = mountInteractive(sliceReallocationSpec);

    // Starts on frame 01
    expect(view.fullText()).toContain("Initial slice with spare capacity");
    expect(view.findButtonByText("Previous")?.props.disabled).toBe(true);
    expect(view.findButtonByText("Reset")?.props.disabled).toBe(true);

    // Clicking Next when frame 02 has a predictionPrompt shows inline prompt without advancing yet
    view.clickButton("Next");
    expect(view.onInteract).toHaveBeenCalledTimes(1);
    expect(view.fullText()).toContain("Initial slice with spare capacity");
    expect(view.fullText()).toContain(
      "Before stepping: Will appending 30 allocate a new heap array or reuse Backing array A?"
    );
    expect(view.findButtonByText("Reveal next frame")).toBeDefined();

    // Clicking Reveal next frame advances to frame 02 and clears the prompt
    view.clickButton("Reveal next frame");
    expect(view.onInteract).toHaveBeenCalledTimes(2);
    expect(view.fullText()).toContain("Append fits in spare capacity");
    expect(view.fullText()).not.toContain("Before stepping:");

    // Clicking pill 03 jumps directly to frame 03 without prediction pause, showing detached block
    view.clickButton("03");
    expect(view.onInteract).toHaveBeenCalledTimes(3);
    expect(view.fullText()).toContain("Capacity exceeded triggers reallocation");
    expect(view.fullText()).toContain("detached");
    expect(view.fullText()).not.toContain("Before stepping:");
    expect(view.findButtonByText("Next")?.props.disabled).toBe(true);

    // Clicking Previous steps back to frame 02
    view.clickButton("Previous");
    expect(view.fullText()).toContain("Append fits in spare capacity");

    // Clicking Reset returns to frame 01
    view.clickButton("Reset");
    expect(view.fullText()).toContain("Initial slice with spare capacity");
    expect(view.findButtonByText("Reset")?.props.disabled).toBe(true);
  });

  it("toggles between dark and light paper via useFigureTheme", () => {
    const view = mountInteractive(sliceReallocationSpec);

    expect((view.getTree() as El).props["data-theme"]).toBe("dark");
    expect(view.findButtonByText("Light paper")?.props["aria-pressed"]).toBe(
      false
    );

    view.clickButton("Light paper");
    expect((view.getTree() as El).props["data-theme"]).toBe("light");
    expect(view.findButtonByText("Light paper")?.props["aria-pressed"]).toBe(
      true
    );

    view.clickButton("Light paper");
    expect((view.getTree() as El).props["data-theme"]).toBe("dark");
  });
});
