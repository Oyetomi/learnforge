import React, { useRef, useState } from "react";
import { helpPaneBounds } from "../../services/learning/helpLayout";

/** A captured pointer drag and keyboard equivalent resize the existing panes. */
export function HelpPaneDivider({ stage, width, stageWidth, controls, onResize, onReset }: {
  stage: React.RefObject<HTMLDivElement>; width: number; stageWidth: number; controls: string;
  onResize: (ratio: number, persist: boolean) => void; onReset: () => void;
}) {
  const drag = useRef<{ pointerId: number; start: number; latest: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const bounds = helpPaneBounds(stageWidth);
  const ratio = bounds.available ? width / bounds.available : .5;
  const finish = (cancel = false) => {
    if (!drag.current) return;
    onResize(cancel ? drag.current.start : drag.current.latest, !cancel);
    drag.current = null; setDragging(false);
  };
  return <div role="separator" aria-label="Resize help pane" aria-orientation="vertical" aria-controls={controls}
    aria-valuemin={Math.round(100 * bounds.min / (bounds.available || 1))}
    aria-valuemax={Math.round(100 * bounds.max / (bounds.available || 1))}
    aria-valuenow={Math.round(ratio * 100)} aria-valuetext={`${Math.round(ratio * 100)}% help pane`}
    tabIndex={0} className={`help-pane-divider ${dragging ? "is-dragging" : ""}`}
    title="Drag to resize. Left/Right arrows adjust width. Double-click to reset."
    onDoubleClick={onReset}
    onKeyDown={event => {
      const min = bounds.min / (bounds.available || 1), max = bounds.max / (bounds.available || 1);
      const next = event.key === "ArrowLeft" ? ratio + .02 : event.key === "ArrowRight" ? ratio - .02 : event.key === "Home" ? min : event.key === "End" ? max : null;
      if (next === null) return;
      event.preventDefault(); onResize(Math.min(max, Math.max(min, next)), true);
    }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus();
      drag.current = { pointerId: event.pointerId, start: ratio, latest: ratio };
      event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
    }}
    onPointerMove={event => {
      if (!drag.current || drag.current.pointerId !== event.pointerId || !stage.current) return;
      const rect = stage.current.getBoundingClientRect(), limits = helpPaneBounds(rect.width);
      const next = Math.min(limits.max, Math.max(limits.min, rect.right - event.clientX)) / (limits.available || 1);
      drag.current.latest = next; onResize(next, false);
    }}
    onPointerUp={event => { if (drag.current?.pointerId === event.pointerId) { finish(); event.currentTarget.releasePointerCapture(event.pointerId); } }}
    onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish()}
  ><span aria-hidden="true"/></div>;
}
