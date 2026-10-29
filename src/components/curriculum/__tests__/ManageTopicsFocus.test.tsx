import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CourseTrack } from "../../../services/ai/types";

// Exercise the component's replacement/remount lifecycle without a browser DOM.
// Each newly mounted button receives a distinct focus target, reproducing the
// stale-node failure that a static render cannot detect.
const hooks = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  effects: [] as Array<() => unknown>,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useRef: (value: unknown) => {
      const index = hooks.cursor++;
      return (hooks.slots[index] ??= { current: value });
    },
    useState: (value: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = value;
      return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = next; }];
    },
    useEffect: (effect: () => unknown, deps: unknown[]) => {
      const index = hooks.cursor++;
      const previous = hooks.slots[index] as unknown[] | undefined;
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
        hooks.effects.push(effect);
      }
      hooks.slots[index] = deps;
    },
  };
});
import { ManageTopicsModal } from "../ManageTopicsModal";

type Node = React.ReactElement<any>;
function nodes(element: React.ReactNode): Node[] {
  if (!React.isValidElement(element)) return [];
  const node = element as Node;
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}
function label(node: Node): string {
  return node.props["aria-label"] || React.Children.toArray(node.props.children)
    .filter((child) => typeof child === "string").join("").trim();
}

function mount() {
  hooks.slots = [];
  hooks.cursor = 0;
  hooks.effects = [];
  let focused: { label: string; generation: number } | null = null;
  let generation = 0;
  let tree: Node;
  let refs: Array<{ ref: any; node: any }> = [];
  const onDelete = vi.fn();
  vi.stubGlobal("document", { activeElement: null });
  const tracks = [
    { id: "a", title: "First topic", milestones: [] },
    { id: "b", title: "Second topic", milestones: [] },
  ] as unknown as CourseTrack[];
  function render() {
    // Conditional confirmation removes all list buttons, invalidating old refs.
    for (const { ref } of refs) {
      if (typeof ref === "function") ref(null);
      else ref.current = null;
    }
    refs = [];
    hooks.cursor = 0;
    tree = ManageTopicsModal({
      tracks, visibleIds: ["a", "b"], removedIds: ["old"],
      onDelete, onClose: vi.fn(),
    });
    generation++;
    for (const element of nodes(tree)) {
      const ref = (element as any).ref;
      if (!ref) continue;
      const target = {
        label: label(element), generation,
        focus() { focused = this; }, showModal() {}, close() {},
      };
      if (typeof ref === "function") ref(target);
      else ref.current = target;
      refs.push({ ref, node: target });
    }
    const effects = hooks.effects.splice(0);
    effects.forEach((effect) => effect());
  }
  function click(name: string) {
    const button = nodes(tree).find((node) => node.type === "button" && label(node) === name);
    if (!button) throw new Error(`Missing button: ${name}`);
    button.props.onClick();
    render();
  }
  render();
  return {
    click, onDelete,
    focused: () => focused,
    escape() {
      tree.props.onCancel({ preventDefault: vi.fn() });
      render();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("topic deletion focus recovery", () => {
  it("returns Cancel to the newly mounted initiating topic rather than a stale node", () => {
    const ui = mount();
    ui.click("Delete topic: Second topic");
    expect(ui.focused()?.label).toBe("Cancel");
    const confirmationGeneration = ui.focused()!.generation;
    ui.click("Cancel");
    expect(ui.focused()).toEqual({
      label: "Delete topic: Second topic", generation: confirmationGeneration + 1,
      focus: expect.any(Function), showModal: expect.any(Function), close: expect.any(Function),
    });
    expect(ui.onDelete).not.toHaveBeenCalled();
  });
  it("returns Escape from legacy bulk confirmation to Clear permanently", () => {
    const ui = mount();
    ui.click("Clear permanently");
    expect(ui.focused()?.label).toBe("Cancel");
    ui.escape();
    expect(ui.focused()?.label).toBe("Clear permanently");
    expect(ui.onDelete).not.toHaveBeenCalled();
  });
});
