import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Loader2, Maximize2, Minimize2, RotateCcw } from "lucide-react";
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
  const [expanded, setExpanded] = useState(false);
  const [bridge, setBridge] = useState<CanvasBridgeState>(
    INITIAL_CANVAS_BRIDGE_STATE
  );
  const neededVendors = useMemo(() => detectCanvasVendors(spec.js), [spec.js]);
  const [vendorScripts, setVendorScripts] = useState<string[] | null>(
    neededVendors.any ? null : []
  );

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
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
    () => `lf-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}-${runCount}`,
    [reactId, runCount]
  );

  const srcDoc = useMemo(
    () => buildCanvasSimSrcDoc(spec, channelToken, vendorScripts ?? []),
    [spec, channelToken, vendorScripts]
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
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

  const engineBadge = neededVendors.three
    ? "3D Interactive Scene"
    : neededVendors.d3
    ? "D3 Interactive Lab"
    : neededVendors.rough
    ? "Sketched Interactive Studio"
    : "Interactive Studio";

  // Fit the frame to the reported content height so there is never dead space
  // below the simulation. Compact mode caps tall scenes; Expand reveals all.
  const COMPACT_CAP = 460;
  const contentHeight = bridge.height ?? spec.height ?? CANVAS_DEFAULT_HEIGHT;
  const canExpand = contentHeight > COMPACT_CAP;
  const frameHeight =
    expanded || !canExpand ? contentHeight : COMPACT_CAP;
  const waitingForVendors =
    typeof window !== "undefined" && vendorScripts === null;

  const sandboxBody = (
    <div
      className={`teaching-lab canvas-sandbox ${expanded ? "is-expanded" : ""}`}
      aria-label={`Interactive simulation: ${title}`}
    >
      <div className="lab-toolbar canvas-sandbox-toolbar">
        <span className="canvas-sandbox-caption">
          <strong className="canvas-sandbox-badge">{engineBadge}</strong>
        </span>
        <div className="canvas-sandbox-actions">
          {canExpand && (
            <button
              type="button"
              className="canvas-sandbox-btn"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Show less" : "Show full simulation"}
            >
              {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              <span className="lbl">{expanded ? "Less" : "Full"}</span>
            </button>
          )}
          <button
            type="button"
            className="canvas-sandbox-btn"
            onClick={handleReset}
            aria-label="Restart simulation"
          >
            <RotateCcw size={12} />
            <span className="lbl">Restart</span>
          </button>
          <button
            type="button"
            className="canvas-sandbox-btn is-icon"
            onClick={handleDownloadHtml}
            aria-label={`Save ${title} as standalone HTML`}
          >
            <Download size={12} />
          </button>
        </div>
      </div>
      {spec.controlsHint && (
        <p className="canvas-sandbox-hint">
          <VisualRichText text={spec.controlsHint} />
        </p>
      )}

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
              <RotateCcw size={12} />
              <span>Repair visual</span>
            </button>
          )}
        </div>
      )}

      {waitingForVendors ? (
        <div
          className="canvas-sandbox-loading"
          style={{ height: `${frameHeight}px` }}
          role="status"
        >
          <Loader2 size={16} className="animate-spin" />
          <span>Loading {engineBadge.toLowerCase()} runtime…</span>
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
          scrolling="auto"
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
