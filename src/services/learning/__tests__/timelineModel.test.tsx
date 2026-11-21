import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  validateTimelineModel,
  type TimelineModelSpec,
} from "../timelineModel";

interface HookSlotStore {
  states: Map<string, unknown[]>;
  refs: Map<string, Array<{ current: unknown }>>;
  currentPath: string;
  stateCursor: number;
  refCursor: number;
  idCursor: number;
  active: boolean;
}

const hookStore: HookSlotStore = {
  states: new Map(),
  refs: new Map(),
  currentPath: "root",
  stateCursor: 0,
  refCursor: 0,
  idCursor: 0,
  active: false,
};

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hookStore.active) {
        return actual.useState(initial as never);
      }
      const path = hookStore.currentPath;
      const idx = hookStore.stateCursor++;
      let slots = hookStore.states.get(path);
      if (!slots) {
        slots = [];
        hookStore.states.set(path, slots);
      }
      if (idx >= slots.length) {
        slots[idx] =
          typeof initial === "function"
            ? (initial as () => unknown)()
            : initial;
      }
      const setState = (updater: unknown) => {
        const list = hookStore.states.get(path)!;
        list[idx] =
          typeof updater === "function"
            ? (updater as (prev: unknown) => unknown)(list[idx])
            : updater;
      };
      return [slots[idx], setState];
    },
    useRef: (initial: unknown) => {
      if (!hookStore.active) {
        return actual.useRef(initial);
      }
      const path = hookStore.currentPath;
      const idx = hookStore.refCursor++;
      let refs = hookStore.refs.get(path);
      if (!refs) {
        refs = [];
        hookStore.refs.set(path, refs);
      }
      if (idx >= refs.length) {
        refs[idx] = { current: initial };
      }
      return refs[idx];
    },
    useMemo: (factory: () => unknown, deps: React.DependencyList) =>
      hookStore.active ? factory() : actual.useMemo(factory, deps),
    useCallback: <T extends (...args: never[]) => unknown>(
      fn: T,
      deps: React.DependencyList
    ) => (hookStore.active ? fn : actual.useCallback(fn, deps)),
    useEffect: (
      effect: React.EffectCallback,
      deps?: React.DependencyList
    ) => {
      if (!hookStore.active) {
        actual.useEffect(effect, deps);
      }
    },
    useId: () =>
      hookStore.active ? `tl-${++hookStore.idCursor}` : actual.useId(),
  };
});

import { TimelineDiagram } from "../../../components/learning/TimelineDiagram";

const GO_WORKER_SOURCE = [
  "jobs := make(chan Job)",
  "go worker(ctx, jobs)",
  "jobs <- Job{ID: 1}",
  "cancel()",
  "<-done",
].join("\n");

function makeValidSpec(): TimelineModelSpec {
  return {
    version: 1,
    language: "go",
    source: GO_WORKER_SOURCE,
    actors: [
      { id: "main", label: "main()", role: "goroutine" },
      { id: "jobs", label: "jobs chan", role: "channel" },
      { id: "worker", label: "worker-1", role: "worker" },
    ],
    steps: [
      {
        id: "t1",
        label: "Sender blocks on unbuffered channel",
        explanation:
          "`main()` attempts to send on `jobs` before `worker-1` reaches receive.",
        codeLine: 3,
        lanes: [
          { actorId: "main", state: "blocked", label: "jobs <- j1" },
          { actorId: "jobs", state: "waiting", label: "unbuffered" },
          { actorId: "worker", state: "running", label: "startup" },
        ],
        messages: [
          { from: "main", to: "jobs", label: "jobs <- Job{ID: 1}", kind: "send" },
        ],
      },
      {
        id: "t2",
        label: "Rendezvous handoff completes",
        explanation:
          "`worker-1` reads from `jobs`, unblocking `main()` and starting work.",
        codeLine: 3,
        lanes: [
          { actorId: "main", state: "running", label: "resumed" },
          { actorId: "jobs", state: "idle" },
          { actorId: "worker", state: "running", label: "process(j1)" },
        ],
        messages: [
          { from: "jobs", to: "worker", label: "j1 := <-jobs", kind: "receive" },
        ],
      },
      {
        id: "t3",
        label: "Context cancellation sent",
        explanation:
          "`main()` invokes `cancel()`, closing `ctx.Done()` while `worker-1` observes abort.",
        codeLine: 4,
        lanes: [
          { actorId: "main", state: "waiting", label: "<-done" },
          { actorId: "jobs", state: "idle" },
          { actorId: "worker", state: "error", label: "ctx.Err()" },
        ],
        messages: [
          { from: "main", to: "worker", label: "ctx.Done()", kind: "cancel" },
        ],
      },
      {
        id: "t4",
        label: "Worker exits cleanly",
        explanation:
          "`worker-1` signals completion and both goroutines finish cleanly.",
        codeLine: 5,
        lanes: [
          { actorId: "main", state: "done", label: "exit 0" },
          { actorId: "jobs", state: "done", label: "closed" },
          { actorId: "worker", state: "done", label: "returned" },
        ],
        messages: [
          { from: "worker", to: "main", label: "close(done)", kind: "response" },
        ],
      },
    ],
  };
}

type El = React.ReactElement<Record<string, unknown>>;

function expandElement(node: React.ReactNode, path = "0"): React.ReactNode {
  if (node === null || node === undefined || typeof node === "boolean") {
    return node;
  }
  if (typeof node === "string" || typeof node === "number") return node;
  if (Array.isArray(node)) {
    return node.map((child, i) => expandElement(child, `${path}.${i}`));
  }
  if (!React.isValidElement(node)) return node;

  const element = node as El;
  if (typeof element.type === "function") {
    const keyPart = element.key !== null ? `:${String(element.key)}` : "";
    const fnPath = `${path}/${element.type.name || "fn"}${keyPart}`;
    const prevPath = hookStore.currentPath;
    const prevState = hookStore.stateCursor;
    const prevRef = hookStore.refCursor;
    hookStore.currentPath = fnPath;
    hookStore.stateCursor = 0;
    hookStore.refCursor = 0;
    const rendered = (element.type as (p: Record<string, unknown>) => React.ReactNode)(
      element.props
    );
    hookStore.currentPath = prevPath;
    hookStore.stateCursor = prevState;
    hookStore.refCursor = prevRef;
    return expandElement(rendered, fnPath);
  }

  const children = element.props.children as React.ReactNode;
  if (children === undefined) return element;
  if (Array.isArray(children)) {
    const expanded = children.map((child, i) =>
      expandElement(child, `${path}.c.${i}`)
    );
    return React.cloneElement(element, undefined, ...expanded);
  }
  return React.cloneElement(
    element,
    undefined,
    expandElement(children, `${path}.c`)
  );
}

function collectElements(node: React.ReactNode): El[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectElements);
  if (!React.isValidElement(node)) return [];
  const el = node as El;
  return [el, ...collectElements(el.props.children as React.ReactNode)];
}

function textContent(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (React.isValidElement(node)) {
    return textContent((node as El).props.children as React.ReactNode);
  }
  return "";
}

function mountTimeline(spec: TimelineModelSpec, onInteract = vi.fn()) {
  hookStore.states.clear();
  hookStore.refs.clear();
  const render = () => {
    hookStore.active = true;
    hookStore.idCursor = 0;
    try {
      return expandElement(
        <TimelineDiagram spec={spec} language="go" onInteract={onInteract} />
      );
    } finally {
      hookStore.active = false;
    }
  };
  return { render, onInteract };
}

afterEach(() => {
  hookStore.active = false;
  vi.unstubAllGlobals();
});

describe("validateTimelineModel", () => {
  it("validates a concurrent worker and channel timeline and defaults omitted version to 1", () => {
    const spec = makeValidSpec();
    const { version: _omitted, ...withoutVersion } = spec;
    const validated = validateTimelineModel(withoutVersion);
    expect(validated).toEqual(spec);
  });

  it("auto-fills missing actor lanes as idle in declared actor order and defaults unknown states to idle", () => {
    const raw = {
      actors: [
        { id: "client", label: "HTTP Client", role: "client" },
        { id: "server", label: "API Server", role: "server" },
        { id: "db", label: "Primary DB", role: "node" },
      ],
      steps: [
        {
          id: "req",
          label: "Client sends GET",
          explanation: "Client issues a request while DB is not yet involved.",
          lanes: [
            { actorId: "client", state: "running", label: "GET /items" },
            { actorId: "server", state: "unknown-state-value" },
          ],
        },
        {
          id: "res",
          label: "Response returned",
          explanation: "Server responds with 200 OK.",
          lanes: [{ actorId: "server", state: "done", label: "200 OK" }],
        },
      ],
    };

    const validated = validateTimelineModel(raw);
    expect(validated).not.toBeNull();
    expect(validated!.steps[0].lanes).toEqual([
      { actorId: "client", state: "running", label: "GET /items" },
      { actorId: "server", state: "idle" },
      { actorId: "db", state: "idle" },
    ]);
    expect(validated!.steps[1].lanes).toEqual([
      { actorId: "client", state: "idle" },
      { actorId: "server", state: "done", label: "200 OK" },
      { actorId: "db", state: "idle" },
    ]);
  });

  it("filters out self-loop, undeclared, and empty messages while preserving valid messages up to 6", () => {
    const spec = makeValidSpec();
    const noisy = {
      ...spec,
      steps: [
        {
          ...spec.steps[0],
          messages: [
            { from: "main", to: "main", label: "self loop", kind: "send" },
            { from: "main", to: "ghost", label: "missing target" },
            { from: "ghost", to: "worker", label: "missing source" },
            { from: "main", to: "worker", label: "   " },
            { from: "main", to: "worker", label: "x".repeat(71) },
            { from: "main", to: "jobs", label: "valid-1", kind: "send" },
            { from: "jobs", to: "worker", label: "valid-2", kind: "unknown-kind" },
            { from: "worker", to: "main", label: "valid-3", kind: "response" },
            { from: "main", to: "worker", label: "valid-4", kind: "call" },
            { from: "worker", to: "jobs", label: "valid-5", kind: "lock" },
            { from: "main", to: "worker", label: "valid-6", kind: "cancel" },
            { from: "jobs", to: "main", label: "valid-7-trimmed", kind: "receive" },
          ],
        },
        spec.steps[1],
      ],
    };

    const validated = validateTimelineModel(noisy);
    expect(validated).not.toBeNull();
    expect(validated!.steps[0].messages).toEqual([
      { from: "main", to: "jobs", label: "valid-1", kind: "send" },
      { from: "jobs", to: "worker", label: "valid-2" },
      { from: "worker", to: "main", label: "valid-3", kind: "response" },
      { from: "main", to: "worker", label: "valid-4", kind: "call" },
      { from: "worker", to: "jobs", label: "valid-5", kind: "lock" },
      { from: "main", to: "worker", label: "valid-6", kind: "cancel" },
    ]);
  });

  it("rejects invalid specs and strips unknown top-level fields", () => {
    const valid = makeValidSpec();
    const invalidCases: unknown[] = [
      null,
      [],
      { ...valid, version: 2 },
      { ...valid, actors: [valid.actors[0]] },
      {
        ...valid,
        actors: Array.from({ length: 7 }, (_, i) => ({
          id: `a${i}`,
          label: `Actor ${i}`,
        })),
      },
      {
        ...valid,
        actors: [
          { id: "dup", label: "First" },
          { id: "dup", label: "Second" },
        ],
      },
      {
        ...valid,
        actors: [
          { id: "bad id!", label: "Invalid ID" },
          { id: "ok", label: "Second" },
        ],
      },
      { ...valid, steps: [valid.steps[0]] },
      {
        ...valid,
        steps: Array.from({ length: 17 }, (_, i) => ({
          ...valid.steps[0],
          id: `s${i}`,
        })),
      },
      {
        ...valid,
        steps: [valid.steps[0], { ...valid.steps[1], id: valid.steps[0].id }],
      },
      {
        ...valid,
        steps: [{ ...valid.steps[0], lanes: "not-an-array" }, valid.steps[1]],
      },
      {
        ...valid,
        steps: [
          {
            ...valid.steps[0],
            lanes: [{ actorId: "undeclared", state: "running" }],
          },
          valid.steps[1],
        ],
      },
      {
        ...valid,
        steps: [
          {
            ...valid.steps[0],
            lanes: [{ actorId: "main", state: "running", label: "x".repeat(81) }],
          },
          valid.steps[1],
        ],
      },
      { ...valid, language: "x".repeat(41) },
      { ...valid, source: "x".repeat(4001) },
      { ...valid, source: Array(51).fill("line").join("\n") },
    ];

    for (const candidate of invalidCases) {
      expect(validateTimelineModel(candidate)).toBeNull();
    }

    const withExtra = validateTimelineModel({
      ...valid,
      injectedScript: "evil()",
    });
    expect(withExtra).not.toBeNull();
    expect(withExtra).not.toHaveProperty("injectedScript");
  });
});

describe("TimelineDiagram SSR rendering", () => {
  it("renders swimlanes, role badges, state cues, causal SVG arrows, legend, and highlighted source", () => {
    const spec = makeValidSpec();
    const html = renderToStaticMarkup(
      <TimelineDiagram spec={spec} language="go" onInteract={vi.fn()} />
    );

    expect(html).toContain('class="timeline-diagram"');
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain("Light paper");
    expect(html).toContain("Active");
    expect(html).toContain("Blocked");
    expect(html).toContain("Waiting");
    expect(html).toContain("Done");
    expect(html).toContain("Error");
    expect(html).toContain("goroutine");
    expect(html).toContain("channel");
    expect(html).toContain("worker");
    expect(html).toContain("t1");
    expect(html).toContain("t4");
    expect(html).toContain("timeline-arrows-svg");
    expect(html).toContain("jobs &lt;- Job{ID: 1}");
    expect(html).toContain("Messages at t1");
    expect(html).toContain("Sender blocks on unbuffered channel");
    expect(html).toContain("Step 1 of 4");
    expect(html).toContain('data-code-line="3" data-active-line="true"');
    expect(html).toContain("hljs-keyword");
  });

  it("supports non-programming subject timelines with universal roles and message kinds", () => {
    const bioSpec = validateTimelineModel({
      actors: [
        { id: "pancreas", label: "Pancreas", role: "system" },
        { id: "blood", label: "Bloodstream", role: "signal" },
        { id: "liver", label: "Liver cells", role: "entity" },
      ],
      steps: [
        {
          id: "rise",
          label: "Blood glucose rises after a meal",
          explanation: "Pancreatic beta cells detect elevated glucose and release insulin.",
          lanes: [
            { actorId: "pancreas", state: "running", label: "secretes insulin" },
            { actorId: "blood", state: "waiting", label: "high glucose" },
            { actorId: "liver", state: "idle" },
          ],
          messages: [
            { from: "pancreas", to: "blood", label: "Insulin released", kind: "signal" },
          ],
        },
        {
          id: "uptake",
          label: "Liver stores glucose as glycogen",
          explanation: "Insulin triggers liver receptors to absorb glucose and restore balance.",
          lanes: [
            { actorId: "pancreas", state: "done" },
            { actorId: "blood", state: "done", label: "baseline" },
            { actorId: "liver", state: "running", label: "stores glycogen" },
          ],
          messages: [
            { from: "blood", to: "liver", label: "Glucose uptake", kind: "transfer" },
          ],
        },
      ],
    });
    expect(bioSpec).not.toBeNull();
    const html = renderToStaticMarkup(
      <TimelineDiagram spec={bioSpec!} onInteract={vi.fn()} />
    );
    expect(html).toContain("Pancreas");
    expect(html).toContain("Insulin released");
    expect(html).toContain("Active");
  });

  it("safely escapes untrusted markup and renders a status message for invalid specs", () => {
    const spec = makeValidSpec();
    spec.language = "custom-dsl";
    spec.source = '<script>alert("xss")</script>\nsecond line';
    spec.actors[0].label = "<img src=x onerror=evil()>";
    spec.steps[0].codeLine = 1;

    const html = renderToStaticMarkup(
      <TimelineDiagram spec={spec} onInteract={vi.fn()} />
    );
    expect(html).toContain("&lt;img src=x onerror=evil()&gt;");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");

    const invalidHtml = renderToStaticMarkup(
      <TimelineDiagram
        spec={{ version: 1, actors: [], steps: [] }}
        onInteract={vi.fn()}
      />
    );
    expect(invalidHtml).toContain("This timeline is incomplete");
  });
});

describe("TimelineDiagram interactive controls", () => {
  it("steps forward, jumps to any time column, resets, and toggles light paper theme", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });

    const spec = makeValidSpec();
    const { render, onInteract } = mountTimeline(spec);

    const inspect = () => {
      const tree = render();
      const all = collectElements(tree);
      const figure = all.find((el) => el.type === "figure")!;
      const buttons = all.filter((el) => el.type === "button");
      const counter = all.find(
        (el) => el.props.className === "timeline-step-counter"
      )!;
      const caption = all.find(
        (el) => el.props.className === "timeline-caption"
      )!;
      const activeCodeLine = all.find(
        (el) => el.props["data-active-line"] === "true"
      );
      return { figure, buttons, counter, caption, activeCodeLine };
    };

    // Initial state: Step 1 of 4, dark paper, code line 3 highlighted.
    let view = inspect();
    expect(view.figure.props["data-theme"]).toBe("dark");
    expect(textContent(view.counter)).toBe("Step 1 of 4");
    expect(textContent(view.caption)).toContain(
      "Sender blocks on unbuffered channel"
    );
    expect(view.activeCodeLine?.props["data-code-line"]).toBe(3);

    const findButton = (buttons: El[], label: string) =>
      buttons.find((btn) => textContent(btn).includes(label))!;

    expect(findButton(view.buttons, "Previous").props.disabled).toBe(true);
    expect(findButton(view.buttons, "Reset").props.disabled).toBe(true);

    // Click Next -> Step 2 of 4.
    (findButton(view.buttons, "Next").props.onClick as () => void)();
    expect(onInteract).toHaveBeenCalledTimes(1);
    view = inspect();
    expect(textContent(view.counter)).toBe("Step 2 of 4");
    expect(textContent(view.caption)).toContain("Rendezvous handoff completes");
    expect(findButton(view.buttons, "Previous").props.disabled).toBe(false);

    // Click column t4 button directly -> jump to Step 4 of 4 (codeLine 5).
    const t4Button = view.buttons.find((btn) =>
      String(btn.props["aria-label"] ?? "").includes("(t4)")
    )!;
    (t4Button.props.onClick as () => void)();
    expect(onInteract).toHaveBeenCalledTimes(2);
    view = inspect();
    expect(textContent(view.counter)).toBe("Step 4 of 4");
    expect(textContent(view.caption)).toContain("Worker exits cleanly");
    expect(view.activeCodeLine?.props["data-code-line"]).toBe(5);
    expect(findButton(view.buttons, "Next").props.disabled).toBe(true);

    // Click Previous -> Step 3 of 4 (codeLine 4).
    (findButton(view.buttons, "Previous").props.onClick as () => void)();
    expect(onInteract).toHaveBeenCalledTimes(3);
    view = inspect();
    expect(textContent(view.counter)).toBe("Step 3 of 4");
    expect(textContent(view.caption)).toContain("Context cancellation sent");
    expect(view.activeCodeLine?.props["data-code-line"]).toBe(4);

    // Click Reset -> returns to Step 1 of 4.
    (findButton(view.buttons, "Reset").props.onClick as () => void)();
    expect(onInteract).toHaveBeenCalledTimes(4);
    view = inspect();
    expect(textContent(view.counter)).toBe("Step 1 of 4");
    expect(findButton(view.buttons, "Reset").props.disabled).toBe(true);

    // Toggle Light paper -> switches theme to light and persists in storage.
    const themeBtn = findButton(view.buttons, "Light paper");
    expect(themeBtn.props["aria-pressed"]).toBe(false);
    (themeBtn.props.onClick as () => void)();
    view = inspect();
    expect(view.figure.props["data-theme"]).toBe("light");
    expect(findButton(view.buttons, "Light paper").props["aria-pressed"]).toBe(
      true
    );
    expect(storage.get("learnforge:figure-theme")).toBe("light");

    // Toggle Light paper again -> returns to dark.
    (findButton(view.buttons, "Light paper").props.onClick as () => void)();
    view = inspect();
    expect(view.figure.props["data-theme"]).toBe("dark");
    expect(storage.get("learnforge:figure-theme")).toBe("dark");
  });
});
