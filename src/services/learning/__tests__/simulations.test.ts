import { describe, expect, it } from "vitest";
import {
  newChannel,
  channelAction,
  newHttpResponse,
  httpResponseAction,
} from "../simulations";
import { validateVisualExample, visualForSubject } from "../visuals";
describe("channel teaching model", () => {
  it("blocks an unbuffered send until a receive and never stores the value", () => {
    const initial = newChannel(),
      waiting = channelAction(initial, "send");
    expect(waiting.pendingSend).toBe(7);
    expect(waiting.queue).toEqual([]);
    expect(initial.pendingSend).toBeNull();
    const delivered = channelAction(waiting, "receive");
    expect(delivered.received).toBe(7);
    expect(delivered.pendingSend).toBeNull();
    expect(delivered.queue).toEqual([]);
  });
  it("lets a waiting receiver rendezvous with a later sender", () => {
    const waiting = channelAction(newChannel(), "receive");
    expect(waiting.receiverWaiting).toBe(true);
    const delivered = channelAction(waiting, "send");
    expect(delivered.receiverWaiting).toBe(false);
    expect(delivered.received).toBe(7);
  });
  it("preserves FIFO and lets a pending send complete when a receive frees buffer space", () => {
    let s = newChannel(2);
    s = channelAction(s, "send");
    s = channelAction(s, "send");
    s = channelAction(s, "send");
    expect(s.queue).toEqual([7, 8]);
    expect(s.pendingSend).toBe(9);
    expect(channelAction(s, "send").nextValue).toBe(s.nextValue);
    s = channelAction(s, "receive");
    expect(s.received).toBe(7);
    expect(s.queue).toEqual([8, 9]);
    expect(s.pendingSend).toBeNull();
    s = channelAction(s, "receive");
    expect(s.received).toBe(8);
  });
});
describe("HTTP final status teaching model", () => {
  it("commits an implicit 200 on the first body write, and cannot change it with a later final status", () => {
    const sent = httpResponseAction(newHttpResponse(), "body");
    expect(sent.status).toBe(200);
    const late = httpResponseAction(sent, "status");
    expect(late.status).toBe(200);
    expect(late.body).toBe("Hello");
    expect(late.message).toContain("cannot change");
  });
  it("keeps a 404 set before writing and appends later writes without changing the final status", () => {
    let s = httpResponseAction(newHttpResponse(), "status");
    s = httpResponseAction(s, "body");
    s = httpResponseAction(s, "body");
    expect(s.status).toBe(404);
    expect(s.body).toBe("HelloHello");
  });
});
it("accepts only owned simulation models and prevents coding models in non-coding lessons", () => {
  const notes = {
    title: "An experiment",
    summary: "Try both orders.",
    takeaway: "Order matters.",
    items: [
      { id: "a", label: "First", description: "One note." },
      { id: "b", label: "Second", description: "Another note." },
    ],
  };
  const valid = validateVisualExample({
    ...notes,
    kind: "simulation",
    model: "http-response",
  });
  expect(valid?.model).toBe("http-response");
  expect(visualForSubject(valid, "go")).toEqual(valid);
  expect(visualForSubject(valid, null)).toBeNull();
  expect(visualForSubject(valid, "rust")).toBeNull();
  expect(
    validateVisualExample({
      ...notes,
      kind: "simulation",
      model: "javascript-eval",
    })
  ).toBeNull();
  expect(
    validateVisualExample({ ...notes, kind: "phrase-builder" })?.kind
  ).toBe("phrase-builder");
});

describe("slice storage teaching model", () => {
  it("copies only the header, so a mutation is visible through both slices", async () => {
    const { newSlices, sliceAction } = await import("../simulations");
    const initial = newSlices();
    let s = sliceAction(initial, "copy");
    s = sliceAction(s, "mutate");
    expect(s.t).toEqual({ array: "A", start: 0, length: 2, capacity: 4 });
    expect(s.a[0]).toBe(99);
    expect(initial.a[0]).toBe(10);
  });
  it("grows t independently within capacity, then allocates separate storage when full", async () => {
    const { newSlices, sliceAction } = await import("../simulations");
    let s = sliceAction(newSlices(), "copy");
    s = sliceAction(s, "append");
    expect(s.t?.array).toBe("A");
    expect(s.t?.length).toBe(3);
    expect(s.a).toEqual([10, 20, 50, 40]);
    s = sliceAction(s, "append");
    s = sliceAction(s, "append");
    expect(s.t?.array).toBe("B");
    expect(s.t?.length).toBe(5);
    expect(s.b?.slice(0, 5)).toEqual([10, 20, 50, 60, 70]);
    s = sliceAction(s, "mutate");
    expect(s.b?.[0]).toBe(99);
    expect(s.a[0]).toBe(10);
  });
});

it("updates the start pointer, length and capacity when re-slicing without altering the array", async () => {
  const { newSlices, sliceAction } = await import("../simulations");
  const initial = newSlices();
  let s = sliceAction(initial, "start", 2);
  s = sliceAction(s, "length", 1);
  expect(s.sStart).toBe(2);
  expect(s.sLength).toBe(1);
  expect(s.a).toEqual(initial.a);
  s = sliceAction(s, "copy");
  expect(s.t).toEqual({ array: "A", start: 2, length: 1, capacity: 2 });
  s = sliceAction(s, "start", 0);
  expect(s.t?.start).toBe(2);
  s = sliceAction(s, "append");
  expect(s.a).toEqual([10, 20, 30, 50]);
  s = sliceAction(s, "append");
  expect(s.b?.slice(0, 3)).toEqual([30, 50, 60]);
  expect(s.t?.start).toBe(0);
});
it("direct array edits are visible through shared slice views but not a reallocated copy", async () => {
  const { newSlices, sliceAction, editSliceValue } = await import(
    "../simulations"
  );
  let s = sliceAction(newSlices(), "copy");
  s = editSliceValue(s, "A", 0, 123);
  expect(s.a[0]).toBe(123);
  expect(s.t?.array).toBe("A");
  for (let i = 0; i < 3; i++) s = sliceAction(s, "append");
  s = editSliceValue(s, "A", 0, 456);
  expect(s.a[0]).toBe(456);
  expect(s.b?.[0]).toBe(123);
  expect(editSliceValue(s, "A", 0, Infinity)).toBe(s);
});
it("allows an empty slice without making index zero valid", async () => {
  const { newSlices, sliceAction } = await import("../simulations");
  let s = sliceAction(newSlices(), "length", 0);
  s = sliceAction(s, "copy");
  expect(sliceAction(s, "mutate").a).toEqual([10, 20, 30, 40]);
  s = sliceAction(s, "append");
  expect(s.t?.length).toBe(1);
  expect(s.a[0]).toBe(50);
});
