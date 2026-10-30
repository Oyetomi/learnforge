import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, RotateCcw, Sparkles } from "lucide-react";
import {
  buildCanvasSimSrcDoc,
  buildStandaloneCanvasHtml,
  CANVAS_DEFAULT_HEIGHT,
  CANVAS_MAX_HEIGHT,
  INITIAL_CANVAS_BRIDGE_STATE,
  reduceCanvasBridgeState,
  type CanvasBridgeState,
  type CanvasSimSpec,
} from "../../services/learning/canvasSim";

export interface CanvasSandboxProps {
  spec: CanvasSimSpec;
  title: string;
  summary?: string;
  takeaway?: string;
  /** Render outer card chrome when embedded directly inside Markdown prose. */
  standalone?: boolean;
  isBusy?: boolean;
  onInteract?: () => void;
  onRuntimeError?: (errorMessage: string) => void;
  onRepairVisual?: (errorMessage: string) => void;
}

const slugifyFilename = (title: string): string =>
  (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "learnforge-simulation"
  ) + ".html";

export function CanvasSandbox({
  spec,
  title,
  summary,
  takeaway,
  standalone = false,
  isBusy = false,
  onInteract,
  onRuntimeError,
  onRepairVisual,
}: CanvasSandboxProps) {
  const reactId = useId();
  const [runCount, setRunCount] = useState(0);
  const [bridge, setBridge] = useState<CanvasBridgeState>(
    INITIAL_CANVAS_BRIDGE_STATE
  );
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const reportedInteract = useRef(false);
  const reportedError = useRef<string | null>(null);

  const channelToken = useMemo(
    () => `lf-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}-${runCount}`,
    [reactId, runCount]
  );

  const srcDoc = useMemo(
    () => buildCanvasSimSrcDoc(spec, channelToken),
    [spec, channelToken]
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        !iframeRef.current ||
        event.source !== iframeRef.current.contentWindow
      ) {
        return;
      }
      setBridge((prev) => reduceCanvasBridgeState(prev, event.data, channelToken));
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [channelToken]);

  useEffect(() => {
    if (bridge.interacted && !reportedInteract.current) {
      reportedInteract.current = true;
      onInteract?.();
    }
  }, [bridge.interacted, onInteract]);

  useEffect(() => {
    if (bridge.error && reportedError.current !== bridge.error) {
      reportedError.current = bridge.error;
      onRuntimeError?.(bridge.error);
    }
  }, [bridge.error, onRuntimeError]);

  const handleReset = () => {
    reportedError.current = null;
    setBridge(INITIAL_CANVAS_BRIDGE_STATE);
    onInteract?.();
    setRunCount((c) => c + 1);
  };

  const handleDownloadHtml = () => {
    if (typeof document === "undefined" || typeof Blob === "undefined") return;
    const html = buildStandaloneCanvasHtml(title, spec, { summary, takeaway });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = slugifyFilename(title);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const frameHeight = bridge.height ?? spec.height ?? CANVAS_DEFAULT_HEIGHT;
  const allowInnerScroll = frameHeight >= CANVAS_MAX_HEIGHT;

  const sandboxBody = (
    <div
      className="teaching-lab canvas-sandbox"
      aria-label={`Interactive simulation: ${title}`}
    >
      <div className="lab-toolbar canvas-sandbox-toolbar">
        <span className="canvas-sandbox-caption">
          <strong className="canvas-sandbox-badge">Interactive sandbox</strong>
          {spec.controlsHint && <span>{spec.controlsHint}</span>}
        </span>
        <div className="canvas-sandbox-actions">
          <button
            type="button"
            className="canvas-sandbox-btn"
            onClick={handleReset}
            title="Reset simulation to initial state"
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
          <button
            type="button"
            className="canvas-sandbox-btn"
            onClick={handleDownloadHtml}
            aria-label={`Save ${title} as standalone HTML`}
            title="Save as standalone offline HTML file"
          >
            <Download size={12} />
            <span>Save HTML</span>
          </button>
        </div>
      </div>

      {bridge.error && (
        <div className="canvas-sandbox-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <div className="canvas-sandbox-error-copy">
            <strong>This generated simulation hit a script error.</strong>
            <code>{bridge.error}</code>
          </div>
          {onRepairVisual && (
            <button
              type="button"
              className="canvas-sandbox-repair"
              disabled={isBusy}
              onClick={() => onRepairVisual(bridge.error!)}
            >
              <Sparkles size={12} />
              <span>Repair visual</span>
            </button>
          )}
        </div>
      )}

      <iframe
        key={runCount}
        ref={iframeRef}
        className="canvas-sandbox-frame"
        title={`Interactive simulation: ${title}`}
        // Strictly allow-scripts ONLY (never allow-same-origin): opaque null
        // origin isolates storage, cookies, parent DOM, and Tauri IPC.
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        scrolling={allowInnerScroll ? "yes" : "no"}
        srcDoc={srcDoc}
        style={{
          height: `${frameHeight}px`,
          boxSizing: "content-box",
        }}
      />
    </div>
  );

  if (!standalone) return sandboxBody;

  return (
    <figure className="canvas-sandbox-standalone">
      <figcaption className="canvas-sandbox-standalone-head">
        <strong>{title}</strong>
        {summary && <p>{summary}</p>}
      </figcaption>
      {sandboxBody}
      {takeaway && <p className="visual-takeaway">{takeaway}</p>}
    </figure>
  );
}
