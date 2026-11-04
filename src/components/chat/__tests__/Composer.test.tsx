import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next;
    }];
  },
  useEffect: (effect: () => void) => { hooks.effects.push(effect); },
  useRef: () => ({ current: null }),
}));
import { Composer } from "../Composer";
import { VoiceDictationButton } from "../../learning/VoiceDictationButton";

type Node = React.ReactElement<any>;
function nodes(element: React.ReactNode): Node[] {
  if (!React.isValidElement(element)) return [];
  const node = element as Node;
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}
function setup() {
  const send = vi.fn(), stop = vi.fn();
  const render = (streaming = false) => {
    hooks.cursor = 0;
    hooks.effects = [];
    const tree = Composer({ compact: true, collapsible: true, draftKey: "draft", isStreaming: streaming,
      onSendMessage: send, onStopStreaming: stop });
    hooks.effects.forEach(effect => effect());
    const all = nodes(tree);
    return { all, input: all.find(node => node.type === "textarea")!,
      button: (label: string) => all.find(node => node.props["aria-label"] === label)! };
  };
  return { render, send, stop };
}
const key = (value: string) => ({ key: value, shiftKey: false, nativeEvent: { isComposing: false },
  preventDefault: vi.fn(), stopPropagation: vi.fn() });
beforeEach(() => {
  hooks.values = [];
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value) });
});
describe("collapsible message drafts", () => {
  it("keeps an unsent draft through button collapse, Escape, and remount", () => {
    const { render, send } = setup();
    let view = render();
    view.input.props.onChange({ target: { value: "Use a smaller example" } });
    view = render();
    view.button("Collapse message box").props.onClick();
    view = render();
    expect(view.input.props.value).toBe("Use a smaller example");
    expect(view.button("Expand message box")).toBeDefined();
    view.input.props.onFocus();
    view = render();
    view.input.props.onKeyDown(key("Escape"));
    view = render();
    expect(view.input.props.value).toBe("Use a smaller example");
    expect(send).not.toHaveBeenCalled();
    hooks.values = []; // Reload restores the saved draft rather than sending it.
    expect(render().input.props.value).toBe("Use a smaller example");
  });
  it("only clears on deliberate submission and blocks sending during a response", () => {
    const { render, send, stop } = setup();
    render().input.props.onChange({ target: { value: "  My question  " } });
    let view = render(true);
    view.input.props.onKeyDown(key("Enter"));
    view.button("Stop response").props.onClick();
    expect(send).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
    view = render();
    expect(view.input.props.value).toBe("  My question  ");
    view.input.props.onKeyDown(key("Enter"));
    expect(send).toHaveBeenCalledExactlyOnceWith("My question");
    view = render();
    expect(view.input.props.value).toBe("");
    expect(view.button("Expand message box")).toBeDefined();
    expect(localStorage.getItem("draft")).toBe("");
  });
  it("appends a transcript to an existing collapsed draft without sending", () => {
    const { render, send } = setup();
    render().input.props.onChange({ target: { value: "My thought " } });
    let view = render();
    view.button("Collapse message box").props.onClick();
    view = render();
    view.all.find(node => node.type === VoiceDictationButton)!.props.onTranscript("from dictation");
    view = render();
    expect(view.input.props.value).toBe("My thought from dictation");
    expect(view.button("Collapse message box")).toBeDefined();
    expect(send).not.toHaveBeenCalled();
  });
});
