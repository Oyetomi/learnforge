import React, { useState } from "react";
import { SliceLab } from "./SliceLab";
import { Check, CheckCircle2, CircleX, LockKeyhole, Radio, RotateCcw } from "lucide-react";
import {
  channelAction,
  newChannel,
  httpResponseAction,
  newHttpResponse,
} from "../../services/learning/simulations";
import type { VisualExample } from "../../services/learning/visuals";
interface Props {
  model: "go-channel" | "http-response" | "go-slice";
  onInteract: () => void;
}
export function TeachingSimulation({ model, onInteract }: Props) {
  return model === "go-slice" ? (
    <SliceLab onInteract={onInteract} />
  ) : model === "go-channel" ? (
    <ChannelLab onInteract={onInteract} />
  ) : (
    <ResponseLab onInteract={onInteract} />
  );
}
function ChannelLab({ onInteract }: { onInteract: () => void }) {
  const [state, setState] = useState(() => newChannel());
  const act = (action: "send" | "receive") => {
    onInteract();
    setState((s) => channelAction(s, action));
  };
  return (
    <div className="teaching-lab channel-lab">
      <div className="lab-toolbar">
        <span>
          <Radio size={14} /> Channel lab
        </span>
        <label>
          Buffer slots{" "}
          <select
            aria-label="Channel buffer slots"
            value={state.capacity}
            onChange={(e) => {
              onInteract();
              setState(newChannel(Number(e.target.value)));
            }}
          >
            <option value={0}>0 · unbuffered</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
      </div>
      <div className="channel-scene" aria-label="Channel state">
        <div
          className={`channel-process ${
            state.pendingSend !== null ? "is-waiting" : ""
          }`}
        >
          <span className="lab-eyebrow">Sender</span>
          <code>ch &lt;- {state.pendingSend ?? state.nextValue}</code>
          <span className="process-state">
            {state.pendingSend !== null
              ? "Waiting for receiver or buffer space"
              : "Ready to send"}
          </span>
          <button
            type="button"
            onClick={() => act("send")}
            disabled={state.pendingSend !== null}
          >
            Send {state.nextValue}
          </button>
        </div>
        <div className="channel-buffer">
          <span className="lab-eyebrow">
            {state.capacity ? "Buffer" : "Direct handoff"}
          </span>
          <div
            className="channel-vessel"
            aria-label={
              state.capacity
                ? `${state.queue.length} of ${state.capacity} slots occupied`
                : "Unbuffered channel: no storage slots"
            }
          >
            {state.capacity ? (
              Array.from({ length: state.capacity }, (_, i) => (
                <span
                  className={`channel-slot ${
                    state.queue[i] !== undefined ? "has-value" : ""
                  }`}
                  key={i}
                >
                  {state.queue[i] ?? "·"}
                </span>
              ))
            ) : (
              <span
                className={`channel-handoff ${
                  state.pendingSend !== null ? "has-value" : ""
                }`}
              >
                {state.pendingSend ?? "↔"}
              </span>
            )}
          </div>
          <small>
            {state.capacity
              ? `${state.queue.length} / ${state.capacity} occupied`
              : "No storage"}
          </small>
        </div>
        <div
          className={`channel-process ${
            state.receiverWaiting ? "is-waiting" : ""
          }`}
        >
          <span className="lab-eyebrow">Receiver</span>
          <code>value := &lt;-ch</code>
          <span className="process-state">
            {state.receiverWaiting
              ? "Waiting for a value"
              : state.received !== null
              ? `Received ${state.received}`
              : "Ready to receive"}
          </span>
          <button
            type="button"
            onClick={() => act("receive")}
            disabled={state.receiverWaiting}
          >
            Receive value
          </button>
        </div>
      </div>
      <p className="lab-observation" role="status">
        {state.message}
      </p>
      <button
        type="button"
        className="lab-reset"
        onClick={() => {
          onInteract();
          setState(newChannel(state.capacity));
        }}
      >
        <RotateCcw size={13} />
        Reset experiment
      </button>
      <details className="lab-scope">
        <summary>What this model shows</summary>
        <p>
          One sender, one receiver and an open integer channel. You choose which
          operation runs next. Receiving frees a full buffer slot, allowing a
          waiting send to complete. Nil channels, closing and select are outside
          this experiment. Changing capacity starts a new channel.
        </p>
        <a
          href="https://go.dev/ref/spec#Channel_types"
          target="_blank"
          rel="noreferrer"
        >
          Go specification: channels
        </a>
      </details>
    </div>
  );
}
function ResponseLab({ onInteract }: { onInteract: () => void }) {
  const [state, setState] = useState(newHttpResponse);
  const act = (action: "status" | "body") => {
    onInteract();
    setState((s) => httpResponseAction(s, action));
  };
  return (
    <div className="teaching-lab response-lab">
      <div className="lab-toolbar">
        <span>Response writer lab</span>
        <span className={state.status ? "response-committed" : ""}>
          {state.status ? (
            <>
              <LockKeyhole size={12} /> Status committed
            </>
          ) : (
            "Status not committed"
          )}
        </span>
      </div>
      <div className="response-experiment">
        <div className="response-actions">
          <span className="lab-eyebrow">Choose what the handler does</span>
          <button type="button" onClick={() => act("body")}>
            <code>
              <span className="code-object">w.</span>Write([]byte(
              <span className="code-string">"Hello"</span>))
            </code>
            <small>Write the body</small>
          </button>
          <button type="button" onClick={() => act("status")}>
            <code>
              <span className="code-object">w.</span>WriteHeader(
              <span className="code-number">404</span>)
            </code>
            <small>Try setting an error status</small>
          </button>
        </div>
        <div className="response-preview">
          <span className="lab-eyebrow">
            Resulting response · status and body
          </span>
          <div
            className="response-status"
            aria-label={
              state.status
                ? `Final status ${state.status}`
                : "No final status yet"
            }
          >
            {state.status ? (
              <>
                <span>HTTP/1.1</span>{" "}
                <strong
                  className={
                    state.status === 404 ? "status-error" : "status-ok"
                  }
                >
                  {state.status} {state.status === 404 ? "Not Found" : "OK"}
                </strong>
              </>
            ) : (
              <span className="response-empty">No response committed</span>
            )}
          </div>
          <pre className="response-body">{state.body || "Body is empty"}</pre>
        </div>
      </div>
      <p className="lab-observation" role="status">
        {state.message}
      </p>
      {state.calls.length > 0 && (
        <div
          className="lab-call-history"
          aria-label="Handler operations, most recent six"
        >
          {state.calls.map((call, i) => (
            <div key={i}>
              <span>{i + 1}</span>
              <code>{call}</code>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="lab-reset"
        onClick={() => {
          onInteract();
          setState(newHttpResponse());
        }}
      >
        <RotateCcw size={13} />
        Reset and reverse the order
      </button>
      <details className="lab-scope">
        <summary>What this model shows</summary>
        <p>
          A simplified Go response writer with final 200 and 404 statuses and a
          text body. Headers, informational responses, flushing and network
          timing are omitted. Committed means the final status is fixed, not
          that the browser has received every byte.
        </p>
        <a
          href="https://pkg.go.dev/net/http#ResponseWriter"
          target="_blank"
          rel="noreferrer"
        >
          Go documentation: ResponseWriter
        </a>
      </details>
    </div>
  );
}
/** Reconstruct an analogous phrase with the model-provided order; this is supported practice. */
export function PhraseBuilder({
  visual,
  onInteract,
  initialPlaced = [],
  initialChecked = false,
}: {
  visual: VisualExample;
  onInteract: () => void;
  initialPlaced?: string[];
  initialChecked?: boolean;
}) {
  const [placed, setPlaced] = useState<string[]>(initialPlaced),
    [checked, setChecked] = useState(initialChecked);
  const available = [...visual.items].sort((a, b) => b.id.localeCompare(a.id));
  const correct =
    placed.length === visual.items.length &&
    placed.every((id, i) => id === visual.items[i].id);
  const add = (id: string) => {
    onInteract();
    setChecked(false);
    setPlaced((p) => [...p, id]);
  };
  return (
    <div className="teaching-lab phrase-lab">
      <span className="lab-eyebrow">
        Build the phrase · choose the parts in order
      </span>
      <div
        className={`phrase-workbench ${
          checked ? (correct ? "is-correct" : "is-wrong") : ""
        }`.trim()}
        aria-label="Your phrase"
      >
        {placed.length ? (
          placed.map((id, i) => {
            const item = visual.items.find((entry) => entry.id === id)!;
            const isRight = checked && visual.items[i]?.id === id;
            const isWrong = checked && !isRight;
            return (
              <button
                type="button"
                key={id}
                className={
                  isRight ? "is-right" : isWrong ? "is-wrong" : undefined
                }
                aria-label={`Remove ${item.label}`}
                onClick={() => {
                  onInteract();
                  setPlaced((p) => p.filter((_, j) => j !== i));
                  setChecked(false);
                }}
              >
                {isRight && (
                  <Check
                    size={14}
                    className="phrase-tile-check"
                    aria-hidden="true"
                  />
                )}
                {item.label}
                <small>×</small>
              </button>
            );
          })
        ) : (
          <span>Choose a part below to begin</span>
        )}
      </div>
      <div
        className="phrase-bank"
        role="group"
        aria-label="Available phrase parts"
      >
        {available.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={placed.includes(item.id)}
            onClick={() => add(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <button
        className={`phrase-check ${checked ? "is-checked" : ""}`.trim()}
        type="button"
        disabled={placed.length !== visual.items.length || checked}
        onClick={() => {
          onInteract();
          setChecked(true);
        }}
      >
        Check phrase order
      </button>
      {checked && (
        <div
          className={`lab-observation ${correct ? "is-correct" : "is-wrong"}`}
          role="status"
        >
          <strong className="lab-observation-title">
            {correct ? (
              <CheckCircle2 size={16} aria-hidden="true" />
            ) : (
              <CircleX size={16} aria-hidden="true" />
            )}
            <span>
              {correct
                ? "Correct — the phrase is in order."
                : "Not quite — try a different order."}
            </span>
          </strong>
          <p>
            {correct
              ? visual.takeaway
              : "Select a placed part to remove it, then rebuild the phrase. Use the text version below if you need a reminder."}
          </p>
          {correct &&
            visual.items.map((item) => (
              <p key={item.id}>
                <b>{item.label}</b> · {item.description}
              </p>
            ))}
        </div>
      )}
      <button
        type="button"
        className="lab-reset"
        onClick={() => {
          onInteract();
          setPlaced([]);
          setChecked(false);
        }}
      >
        <RotateCcw size={13} />
        Start a new attempt
      </button>
    </div>
  );
}
