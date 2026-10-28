import React, { useState } from "react";
import { RotateCcw, MousePointer2 } from "lucide-react";
import {
  newSlices,
  sliceAction,
  editSliceValue,
} from "../../services/learning/simulations";
export function SliceLab({ onInteract }: { onInteract: () => void }) {
  const [state, setState] = useState(newSlices);
  const act = (
    action: "copy" | "mutate" | "append" | "start" | "length",
    value?: number
  ) => {
    onInteract();
    setState((s) => sliceAction(s, action, value));
  };
  const visible = (name: "A" | "B", index: number, which: "s" | "t") =>
    which === "s"
      ? name === "A" &&
        index >= state.sStart &&
        index < state.sStart + state.sLength
      : state.t?.array === name &&
        index >= state.t.start &&
        index < state.t.start + state.t.length;
  const memory = (name: "A" | "B", values: number[]) => (
    <div className="slice-memory" key={name}>
      <div className="slice-array-name">
        <strong>Array {name}</strong>
        <span>
          {name === "A" ? "s points here" : "New allocation"}
          {state.t?.array === name ? " · t points here" : ""}
        </span>
      </div>
      <div
        className="slice-array"
        role="group"
        aria-label={`Array ${name}: ${values.join(", ")}`}
      >
        {values.map((value, i) => (
          <div
            className={`slice-cell ${visible(name, i, "s") ? "in-s" : ""} ${
              visible(name, i, "t") ? "in-t" : ""
            }`}
            key={i}
          >
            <small>{i}</small>
            <input
              aria-label={`Array ${name} element ${i}`}
              title="Edit this value"
              type="number"
              min={-999}
              max={999}
              value={value}
              onChange={(e) => {
                onInteract();
                setState((s) =>
                  editSliceValue(s, name, i, Number(e.target.value))
                );
              }}
            />
            <span>
              {visible(name, i, "s") ? "s" : ""}
              {visible(name, i, "s") && visible(name, i, "t") ? " · " : ""}
              {visible(name, i, "t") ? "t" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
  const header = (which: "s" | "t") => {
    const t =
      which === "s"
        ? {
            array: "A",
            start: state.sStart,
            length: state.sLength,
            capacity: 4 - state.sStart,
          }
        : state.t;
    return (
      <div className={t?.array === "B" ? "slice-new-array" : ""}>
        <strong>{which}</strong>
        {t ? (
          <>
            <dl>
              <div>
                <dt>pointer</dt>
                <dd key={`p-${t.array}-${t.start}`} className="slice-changing">
                  Array {t.array} [{t.start}]
                </dd>
              </div>
              <div>
                <dt>length</dt>
                <dd key={`l-${t.length}`} className="slice-changing">
                  {t.length}
                </dd>
              </div>
              <div>
                <dt>capacity</dt>
                <dd key={`c-${t.capacity}`} className="slice-changing">
                  {t.capacity}
                </dd>
              </div>
            </dl>
            <p className="slice-view-values">
              [
              {(t.array === "A" ? state.a : state.b!)
                .slice(t.start, t.start + t.length)
                .join(", ")}
              ]
            </p>
          </>
        ) : (
          <p>Use “Copy header” to create t.</p>
        )}
      </div>
    );
  };
  return (
    <div className="teaching-lab slice-lab">
      <div className="lab-toolbar">
        <span>Explore slice memory</span>
        <code>
          s := a[{state.sStart}:{state.sStart + state.sLength}]
        </code>
      </div>
      <p className="slice-direct-instruction">
        <MousePointer2 size={13} />
        Drag the bounds. Click any array value to edit it.
      </p>
      <div className="slice-bounds">
        <label>
          Start index <strong>{state.sStart}</strong>
          <input
            aria-label="Slice s start index"
            type="range"
            min={0}
            max={3}
            step={1}
            value={state.sStart}
            onChange={(e) => act("start", Number(e.target.value))}
          />
        </label>
        <label>
          Visible length <strong>{state.sLength}</strong>
          <input
            aria-label="Slice s visible length"
            type="range"
            min={0}
            max={4 - state.sStart}
            step={1}
            value={state.sLength}
            onChange={(e) => act("length", Number(e.target.value))}
          />
        </label>
      </div>
      <div className="slice-headers">
        {header("s")}
        {header("t")}
      </div>
      <div className="slice-memory-scene">
        {memory("A", state.a)}
        {state.b && memory("B", state.b)}
      </div>
      <div className="slice-operations">
        <button type="button" disabled={!!state.t} onClick={() => act("copy")}>
          <span>Copy header</span>
          <code>t := s</code>
        </button>
        <button
          type="button"
          disabled={!state.t || !state.t.length}
          onClick={() => act("mutate")}
        >
          <span>Change an element</span>
          <code>
            t[0] ={" "}
            {state.t &&
            (state.t.array === "A" ? state.a : state.b!)[state.t.start] === 99
              ? 10
              : 99}
          </code>
        </button>
        <button
          type="button"
          disabled={!state.t || state.t.length >= 8}
          onClick={() => act("append")}
        >
          <span>Append a value</span>
          <code>t = append(t, {state.nextValue})</code>
        </button>
      </div>
      <p className="lab-observation" role="status">
        {state.message}
      </p>
      <button
        type="button"
        className="lab-reset"
        onClick={() => {
          onInteract();
          setState(newSlices());
        }}
      >
        <RotateCcw size={13} />
        Reset memory
      </button>
      <details className="lab-scope">
        <summary>What this model shows</summary>
        <p>
          Two slice headers and integer arrays. The bounds controls represent
          re-slicing array A into s. Copying creates an independent t header.
          Labels below each cell show which slices can index that cell;
          unlabeled cells may still be within capacity. The first growth
          allocation uses capacity 8 for illustration; actual Go growth capacity
          may differ. This experiment stops at length 8.
        </p>
        <a
          href="https://go.dev/blog/slices-intro"
          target="_blank"
          rel="noreferrer"
        >
          Go documentation: slice storage and append
        </a>
      </details>
    </div>
  );
}
