import React, { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { LearningCheck, Milestone } from "../../types";
import { helpTitle, readHelp, requestSessionHelp, saveHelp, type HelpKind, type HelpResult } from "../../services/learning/sessionHelp";
import type { VisualExample as VisualSpec } from "../../services/learning/visuals";
import { MarkdownView } from "./MarkdownView";
import { VisualExample } from "../learning/VisualExample";
import { NarrationButton } from "../learning/NarrationButton";

export function LearningHelpPanel({ open, kind, contextKey, context, milestone, check, answered, existingVisual, narrow, onClose, onKind, onSupport, language }: {
  language?: string;
  open: boolean; kind: HelpKind; contextKey: string; context: string; milestone: Milestone | null;
  check: LearningCheck | null; answered: boolean; existingVisual?: VisualSpec; narrow: boolean;
  onClose: () => void; onKind: (kind: HelpKind) => void;
  onSupport: () => void;
}) {
  const cacheKey = `${contextKey}:${kind}`;
  const [result, setResult] = useState<HelpResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const forceNext = useRef(false);
  const pane = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const cached = forceNext.current ? null : readHelp(cacheKey);
    const savedFigure = !forceNext.current && kind === "visual" && existingVisual ? { content: "", visual: existingVisual } : null;
    forceNext.current = false;
    const ready = cached || savedFigure;
    setResult(ready); setError(""); setLoading(!ready);
    if (ready) { saveHelp(cacheKey, ready); return; }
    void requestSessionHelp(kind, milestone, check, context, answered, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      saveHelp(cacheKey, value); setResult(value); setLoading(false);
    }).catch(err => {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Could not prepare help. Try again."); setLoading(false);
    });
    return () => controller.abort();
    // A context key identifies immutable lesson/question content; drafts never restart help.
  }, [open, cacheKey, revision]);
  useEffect(() => {
    if (!open || !result || !body.current) return;
    try { body.current.scrollTop = Number(localStorage.getItem(`learnforge:help-scroll:${cacheKey}`)) || 0; } catch {}
  }, [open, cacheKey, result]);
  useEffect(() => { if (open && result && !loading) onSupport(); }, [open, cacheKey, result, loading]);
  if (!open) return null;
  const retry = () => { forceNext.current = true; setRevision(value => value + 1); };
  return <aside ref={pane} className="learning-help-panel" role="region" aria-label={`${helpTitle[kind]} for this activity`} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (narrow && event.key === "Tab") {
      const controls = Array.from(pane.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') || []).filter(node => node.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <header><div><small>Help for this activity</small><h2>{helpTitle[kind]}</h2></div><button ref={closeButton} type="button" className="help-close" onClick={onClose} aria-label={`Close ${helpTitle[kind].toLowerCase()}`}><X size={16}/><span>Back to activity</span></button></header>
    <nav aria-label="Help options">{(["hint", "walkthrough", "visual"] as HelpKind[]).map(option => <button type="button" key={option} aria-pressed={kind === option} onClick={() => onKind(option)}>{helpTitle[option]}</button>)}</nav>
    <div ref={body} className="learning-help-body" onScroll={() => { try { localStorage.setItem(`learnforge:help-scroll:${cacheKey}`, String(body.current?.scrollTop || 0)); } catch {} }}>
      {loading ? <p role="status" className="help-loading"><Loader2 size={16} className="animate-spin"/>Preparing your {helpTitle[kind].toLowerCase()}…</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={retry}>Try again</button></div> : result && <>
        {result.content && <><div className="narration-reading-action"><NarrationButton text={result.content} label="Listen to explanation" onListen={onSupport}/></div><MarkdownView compactFigures content={result.content} languageHint={milestone?.learning_intent?.programmingLanguage} derivationPositionKey={cacheKey}/></>}
        {result.visual && <VisualExample visual={result.visual} language={language || milestone?.learning_intent?.programmingLanguage} visualId={`help:${cacheKey}`} supportCheckId={!answered ? check?.id : undefined} onRequestFreshVisual={retry}/>}
      </>}
    </div>
    <footer><span>Your activity and answer stay in place.</span>{!loading && result && <button type="button" onClick={retry}>Try another explanation</button>}</footer>
  </aside>;
}
