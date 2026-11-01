import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Loader2, MoreHorizontal, RotateCcw } from "lucide-react";
import "./canvas-sandbox.css";
import {
  buildCanvasSimSrcDoc,
  buildStandaloneCanvasHtml,
  CANVAS_DEFAULT_HEIGHT,
  INITIAL_CANVAS_BRIDGE_STATE,
  reduceCanvasBridgeState,
  type CanvasBridgeState,
  type CanvasSimSpec,
} from "../../services/learning/canvasSim";
import {
  detectCanvasVendors,
  loadCanvasVendorScripts,
} from "../../services/learning/canvasVendors";
import { VisualRichText } from "./VisualRichText";

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
  /** Visual-level actions share the figure's single secondary-action menu. */
  extraTools?: React.ReactNode;
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
  extraTools,
}: CanvasSandboxProps) {
  const reactId = useId();
  const [runCount, setRunCount] = useState(0);
  const [bridge, setBridge] = useState<CanvasBridgeState>(
    INITIAL_CANVAS_BRIDGE_STATE
  );
  const neededVendors = useMemo(() => detectCanvasVendors(spec.js), [spec.js]);
  const [vendorScripts, setVendorScripts] = useState<string[] | null>(
    neededVendors.any ? null : []
  );

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const toolsRef = useRef<HTMLDetailsElement | null>(null);
  const frameRevision = useRef(0);
  const reportedInteract = useRef(false);
  const reportedError = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!neededVendors.any) {
      setVendorScripts([]);
      return;
    }
    setVendorScripts(null);
    loadCanvasVendorScripts(spec.js)
      .then((scripts) => {
        if (active) setVendorScripts(scripts);
      })
      .catch(() => {
        if (active) setVendorScripts([]);
      });
    return () => {
      active = false;
    };
  }, [spec.js, neededVendors.any]);

  const channelToken = useMemo(
    () => `lf-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}-${runCount}-${++frameRevision.current}`,
    [reactId, runCount, spec]
  );

  const srcDoc = useMemo(
    () => buildCanvasSimSrcDoc(spec, channelToken, vendorScripts ?? []),
    [spec, channelToken, vendorScripts]
  );

  useEffect(() => {
    reportedInteract.current = false;
    reportedError.current = null;
    setBridge(INITIAL_CANVAS_BRIDGE_STATE);
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== "object") return;
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

  const closeTools = () => {
    if (!toolsRef.current) return;
    toolsRef.current.open = false;
    toolsRef.current.querySelector("summary")?.focus();
  };

  const handleDownloadHtml = () => {
    if (typeof document === "undefined" || typeof Blob === "undefined") return;
    const html = buildStandaloneCanvasHtml(
      title,
      spec,
      { summary, takeaway },
      vendorScripts ?? []
    );
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

  // The lesson owns scrolling. Fit every ordinary model, including its controls,
  // rather than clipping the frame at an unrelated compact-view threshold.
  const contentHeight = bridge.height ?? spec.height ?? CANVAS_DEFAULT_HEIGHT;
  const frameHeight = contentHeight;
  const waitingForVendors =
    typeof window !== "undefined" && vendorScripts === null;

  const sandboxBody = (
    <div
      className="teaching-lab canvas-sandbox is-auto-sized"
      aria-label={`Interactive simulation: ${title}`}
    >
      <div className="lab-toolbar canvas-sandbox-toolbar">
        {spec.controlsHint ? (
          <p className="canvas-sandbox-hint">
            <VisualRichText text={spec.controlsHint} />
          </p>
        ) : <span className="canvas-sandbox-caption">Explore the model</span>}
        <details
          ref={toolsRef}
          className="canvas-sandbox-tools"
          onKeyDown={(event) => {
            if (event.key === "Escape" && toolsRef.current?.open) {
              event.preventDefault();
              event.stopPropagation();
              closeTools();
            }
          }}
        >
          <summary aria-label="More visual options">
            <MoreHorizontal size={16} aria-hidden="true" />
            <span>More options</span>
          </summary>
          <div
            className="canvas-sandbox-tools-menu"
            onClick={(event) => {
              const button = (event.target as Element).closest("button") as HTMLButtonElement | null;
              if (button && !button.disabled) closeTools();
            }}
          >
            <button type="button" onClick={handleReset}>
              <RotateCcw size={13} aria-hidden="true" />
              Restart model
            </button>
            <button
              type="button"
              disabled={waitingForVendors}
              onClick={handleDownloadHtml}
              aria-label={`Save ${title} as standalone HTML`}
            >
              <Download size={13} aria-hidden="true" />
              Save interactive HTML
            </button>
            {extraTools && <div className="canvas-sandbox-extra-tools">{extraTools}</div>}
          </div>
        </details>
      </div>

      {bridge.error && (
        <div className="canvas-sandbox-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <div className="canvas-sandbox-error-copy">
            <strong>This model couldn’t run.</strong>
            <details><summary>Technical details</summary><code>{bridge.error}</code></details>
          </div>
          {onRepairVisual && (
            <button
              type="button"
              className="canvas-sandbox-repair"
              disabled={isBusy}
              onClick={() => onRepairVisual(bridge.error!)}
            >
              <RotateCcw size={12} />
              <span>Repair visual</span>
            </button>
          )}
        </div>
      )}

      {bridge.heightLimited && (
        <p className="canvas-sandbox-size-notice" role="status">
          This model needs more space. Scroll inside it to reach all controls,
          or save it from More options to open separately.
        </p>
      )}

      {bridge.error ? null : waitingForVendors ? (
        <div
          className="canvas-sandbox-loading"
          style={{ height: `${frameHeight}px` }}
          role="status"
        >
          <Loader2 size={16} className="animate-spin" />
          <span>Preparing the model…</span>
        </div>
      ) : (
        <iframe
          key={`${runCount}:${vendorScripts?.length ?? 0}`}
          ref={iframeRef}
          className="canvas-sandbox-frame"
          aria-label={`Interactive simulation: ${title}`}
          // Strictly allow-scripts ONLY (never allow-same-origin): opaque null
          // origin isolates storage, cookies, parent DOM, and Tauri IPC.
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          scrolling={bridge.heightLimited ? "auto" : "no"}
          srcDoc={srcDoc}
          style={{
            height: `${frameHeight}px`,
            boxSizing: "content-box",
          }}
        />
      )}
    </div>
  );

  if (!standalone) return sandboxBody;

  return (
    <figure className="canvas-sandbox-standalone">
      <figcaption className="canvas-sandbox-standalone-head">
        <strong>{title}</strong>
        {summary && (
          <p>
            <VisualRichText text={summary} />
          </p>
        )}
      </figcaption>
      {sandboxBody}
      {takeaway && (
        <p className="visual-takeaway">
          <VisualRichText text={takeaway} />
        </p>
      )}
    </figure>
  );
}
