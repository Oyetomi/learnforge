import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeVisualHelp, VisualHelpError } from "../scientificVisualHelp";
import { readHelp, requestSessionHelp, saveHelp, helpRequest } from "../sessionHelp";

const figure = {
  kind: "state-model", title: "Move an item", summary: "Track one transfer.",
  items: [{ id: "source", label: "Source", description: "Starts here." }, { id: "target", label: "Destination", description: "Arrives here." }],
  takeaway: "Moving changes the item's location.",
  stateModel: { version: 1, initialStateId: "before", entities: [{ id: "item", label: "Item" }],
    states: [
      { id: "before", label: "Before", description: "At the source.", entities: [{ entityId: "item", status: "Waiting", value: "At source", tone: "waiting" }] },
      { id: "after", label: "After", description: "At the destination.", entities: [{ entityId: "item", status: "Received", value: "At destination", tone: "done" }] },
    ], transitions: [{ id: "move", from: "before", to: "after", label: "Move item", explanation: "The destination receives the item." }] },
};
const envelope = (content: unknown, finish_reason = "stop") => ({ choices: [{ finish_reason, message: { content } }] });
const json = () => JSON.stringify({ explanation: "Watch the location.", visual: figure });
let values: Map<string, string>;
beforeEach(() => { values = new Map(); vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }); });
afterEach(() => vi.unstubAllGlobals());

describe("scientific help response boundary", () => {
  for (const format of ["plain", "json", "legacy"] as const) {
    it(`accepts complete ${format} replies and supplies paper appearance without changing the model`, () => {
      const content = format === "plain" ? json() : format === "json" ? '```json\n' + json() + '\n```' : 'A small example.\n\n```forge-visual\n' + JSON.stringify({ ...figure, stateModel: { ...figure.stateModel, presentation: { style: "scientific", layout: "lanes" } } }) + '\n```';
      const result = decodeVisualHelp(envelope(content));
      expect(result.visual.stateModel?.states).toEqual(figure.stateModel.states);
      expect(result.visual.stateModel?.presentation?.style).toBe("scientific");
    });
  }
  it("preserves code containing literal nested fences and typed provider text", () => {
    const code = 'const text = "```example```";\nprint(text);';
    const visual = { ...figure, stateModel: { ...figure.stateModel, presentation: { style: "scientific", layout: "lanes" }, states: figure.stateModel.states.map((state, i) => ({ ...state, entities: [{ ...state.entities[0], format: "code", language: "javascript", value: i ? code + '\nprint("done");' : code }] })) } };
    const content = '```forge-visual\n' + JSON.stringify(visual) + '\n```';
    expect(decodeVisualHelp(envelope([{ type: "reasoning", text: "private" }, { type: "text", text: content }])).visual.stateModel?.states[0].entities[0].value).toBe(code);
  });
  it("still rejects static, incomplete, dangling, and custom-runtime figures", () => {
    const cases = [
      { ...figure, stateModel: { ...figure.stateModel, states: figure.stateModel.states.map(s => ({ ...s, entities: figure.stateModel.states[0].entities })) } },
      { ...figure, stateModel: { ...figure.stateModel, states: [figure.stateModel.states[0], { ...figure.stateModel.states[1], entities: [] }] } },
      { ...figure, stateModel: { ...figure.stateModel, transitions: [{ ...figure.stateModel.transitions[0], to: "missing" }] } },
      { kind: "canvas", html: "<script>run()</script>" },
    ];
    for (const visual of cases) expect(() => decodeVisualHelp(envelope(JSON.stringify({ visual })))).toThrow(VisualHelpError);
  });
  it("rebuilds an invalid figure once, preserves context, and reports the repair phase", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(envelope('{"visual":{}}')))).mockResolvedValueOnce(new Response(JSON.stringify(envelope(json()))));
    vi.stubGlobal("fetch", fetch); const progress = vi.fn();
    const result = await requestSessionHelp("visual", null, null, "A pending transfer activity", false, new AbortController().signal, progress);
    expect(result.visual?.kind).toBe("state-model"); expect(fetch).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls.map(c => c[0])).toEqual(["generating", "repairing"]);
    const first = JSON.parse(fetch.mock.calls[0][1].body), second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(second.messages.slice(0, 2)).toEqual(first.messages);
    expect(second.messages[0].content).toContain("Do not reveal the answer");
    expect(helpRequest("visual", null, null, "", false)[0].content).not.toContain("Return ONE forge-visual");
  });
  it("stops after a second invalid response and does not rebuild on refusals, authentication errors, or cancellation", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(envelope('{"visual":{}}')))); vi.stubGlobal("fetch", fetch);
    await expect(requestSessionHelp("visual", null, null, "", false, new AbortController().signal)).rejects.toThrow(VisualHelpError); expect(fetch).toHaveBeenCalledTimes(2);
    for (const response of [new Response(JSON.stringify(envelope("", "content_filter"))), new Response("unavailable", { status: 401 })]) {
      fetch.mockClear(); fetch.mockImplementation(async () => response);
      await expect(requestSessionHelp("visual", null, null, "", false, new AbortController().signal)).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(1);
    }
    fetch.mockClear(); const controller = new AbortController(); controller.abort();
    await expect(requestSessionHelp("visual", null, null, "", false, controller.signal)).rejects.toMatchObject({ name: "AbortError" }); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not reuse an old text-only or non-paper cache as a successful visual", () => {
    saveHelp("text", { content: "Some prose" }); expect(readHelp("text", "visual")).toBeNull(); expect(readHelp("text", "hint")?.content).toBe("Some prose");
    const result = decodeVisualHelp(envelope(json())); saveHelp("valid", result); expect(readHelp("valid", "visual")?.visual?.kind).toBe("state-model");
  });
});
