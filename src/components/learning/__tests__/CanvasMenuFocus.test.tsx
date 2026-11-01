import React from "react";
import { describe, expect, it, vi } from "vitest";

// Exercise the real CanvasSandbox action/focus handlers against a ref-mounted
// tools disclosure. No runtime script, window event or vendor fetch is needed.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useId: () => "canvas-menu",
    useRef: (value: unknown) => ({ current: value }),
    useState: (value: unknown) => [value, vi.fn()],
    useMemo: (factory: () => unknown) => factory(),
    useEffect: () => {},
  };
});
import { CanvasSandbox } from "../CanvasSandbox";

type Node = React.ReactElement<any>;
function nodes(element: React.ReactNode): Node[] {
  if (!React.isValidElement(element)) return [];
  const node = element as Node;
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}

function mountTools(disabled = false) {
  const action = vi.fn();
  const tree = CanvasSandbox({
    title: "A generated model",
    spec: { html: "<button>Change</button>", js: "document.querySelector('button').onclick = () => {};" },
    extraTools: <button disabled={disabled} onClick={action}>Generate another visual</button>,
  });
  const all = nodes(tree);
  const disclosure = all.find((node) => node.type === "details" && node.props.className === "canvas-sandbox-tools")!;
  const menu = all.find((node) => node.props.className === "canvas-sandbox-tools-menu")!;
  const focus = vi.fn();
  const target = { open: true, querySelector: vi.fn(() => ({ focus })) };
  (disclosure as any).ref.current = target;
  const injectedAction = all.find((node) => node.type === "button" && node.props.children === "Generate another visual")!;
  const activate = () => {
    // Browser disabled controls do not dispatch their own click handler.
    if (!injectedAction.props.disabled) injectedAction.props.onClick();
    const closest = vi.fn(() => ({ disabled: injectedAction.props.disabled }));
    menu.props.onClick({ target: { closest } });
    expect(closest).toHaveBeenCalledWith("button");
  };
  return { action, disclosure, target, focus, activate };
}

describe("shared simulation tools focus", () => {
  it("closes the same tools disclosure and restores its summary after an injected visual action", () => {
    const tools = mountTools();
    tools.activate();
    expect(tools.action).toHaveBeenCalledOnce();
    expect(tools.target.open).toBe(false);
    expect(tools.target.querySelector).toHaveBeenCalledWith("summary");
    expect(tools.focus).toHaveBeenCalledOnce();
  });

  it("keeps disabled actions inert and lets Escape return focus to the menu trigger", () => {
    const tools = mountTools(true);
    tools.activate();
    expect(tools.action).not.toHaveBeenCalled();
    expect(tools.target.open).toBe(true);
    expect(tools.focus).not.toHaveBeenCalled();
    const event = { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() };
    tools.disclosure.props.onKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(tools.target.open).toBe(false);
    expect(tools.focus).toHaveBeenCalledOnce();
  });
});
