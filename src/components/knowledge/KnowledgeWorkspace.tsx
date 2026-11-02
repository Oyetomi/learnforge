import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, RefreshCw, Search } from "lucide-react";
import type { CourseTrack } from "../../services/ai/types";
import type { LocalDatabase } from "../../services/db";
import { buildKnowledgeGraph, collectKnowledgeSources, loadKnowledgeGraph, mergeKnowledgeGraphs, saveKnowledgeGraph, type KnowledgeGraph } from "../../services/learning/knowledgeGraph";
import { loadKnowledgePractices, outcomeFor, practiceRecommendations, saveKnowledgePractice, startKnowledgePractice, type KnowledgePractice } from "../../services/learning/knowledgePractice";
import { MarkdownView } from "../chat/MarkdownView";
import { OUTCOME_LABELS, PracticeWorkspace } from "./PracticeWorkspace";
import "./knowledge.css";
function Connections({ graph, selected, onSelect }: {
    graph: KnowledgeGraph;
    selected: string;
    onSelect: (id: string) => void;
}) {
    const links = graph.arguments.filter(a => a.conclusionId === selected || a.premiseIds.includes(selected));
    return <section className="knowledge-connections" aria-label="Reasoning connections"><p>Select a premise or conclusion to inspect its source. Each group uses all its premises together.</p>{!links.length && <p>No reasoning links have been extracted for this idea yet.</p>}{links.map((a, index) => <figure className="knowledge-inference" key={a.id}><figcaption>Reasoning {index + 1} · {a.premiseIds.length === 1 ? "One premise" : "All premises together"}</figcaption><ol>{a.premiseIds.map(id => <li key={id}><button aria-pressed={id === selected} onClick={() => onSelect(id)}>{graph.propositions.find(p => p.id === id)?.statement}</button></li>)}</ol><div className="knowledge-therefore"><span aria-hidden="true">∴</span><button aria-pressed={a.conclusionId === selected} onClick={() => onSelect(a.conclusionId)}>{graph.propositions.find(p => p.id === a.conclusionId)?.statement}</button></div></figure>)}</section>;
}
export function KnowledgeWorkspace({ tracks, initialTrackId, database, onReturn, onOpenTopic, pendingQuestion }: {
    tracks: CourseTrack[];
    initialTrackId: string;
    database: LocalDatabase;
    onReturn: () => void;
    onOpenTopic: (id: string) => void;
    pendingQuestion?: boolean;
}) {
    const [trackId, setTrackId] = useState(initialTrackId || tracks[0]?.id || "");
    const track = tracks.find(t => t.id === trackId);
    const [graph, setGraph] = useState<KnowledgeGraph | null>(() => loadKnowledgeGraph(trackId));
    const [runs, setRuns] = useState(() => loadKnowledgePractices(trackId));
    const [historyLimit, setHistoryLimit] = useState(20);
    const [run, setRun] = useState<KnowledgePractice | null>(null), [selected, setSelected] = useState(""), [chosen, setChosen] = useState<string[]>([]), [query, setQuery] = useState(""), [view, setView] = useState<"ideas" | "connections">("ideas");
    const [busy, setBusy] = useState(false), [error, setError] = useState("");
    const request = useRef<AbortController | null>(null), heading = useRef<HTMLHeadingElement>(null), inspector = useRef<HTMLHeadingElement>(null);
    const sources = useMemo(() => collectKnowledgeSources(database.getSessions().filter(s => s.track_id === trackId || (!s.track_id && !track?.learningIntent && s.title === track?.title)).map(session => ({ session, milestones: database.getMilestones(session.id), messages: database.getMessages(session.id) }))), [trackId, database, track]);
    useEffect(() => {
        request.current?.abort();
        request.current = null;
        setBusy(false);
        setError("");
        setRun(null);
        setQuery("");
        setHistoryLimit(20);
        const next = loadKnowledgeGraph(trackId), history = loadKnowledgePractices(trackId);
        setGraph(next);
        setRuns(history);
        const recommended = next ? practiceRecommendations(next, history) : [];
        setChosen(recommended);
        setSelected(recommended[0] || next?.propositions[0]?.id || "");
        heading.current?.focus();
        return () => request.current?.abort();
    }, [trackId]);
    const idea = graph?.propositions.find(p => p.id === selected) || graph?.propositions[0];
    const matches = graph?.propositions.filter(p => p.statement.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) || [];
    const suggested = graph ? practiceRecommendations(graph, runs) : [];
    const select = (id: string) => { setSelected(id); requestAnimationFrame(() => { inspector.current?.focus({ preventScroll: true }); inspector.current?.scrollIntoView({ block: "nearest" }); }); };
    const update = async () => {
        if (!track || request.current)
            return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        setError("");
        const timer = setTimeout(() => controller.abort(), 35000);
        try {
            const incoming = await buildKnowledgeGraph(trackId, sources, controller.signal);
            if (controller.signal.aborted)
                return;
            const next = mergeKnowledgeGraphs(graph, incoming);
            saveKnowledgeGraph(next);
            setGraph(next);
            setSelected(incoming.propositions[0].id);
            setChosen(practiceRecommendations(next, runs));
        }
        catch (e) {
            if (!controller.signal.aborted)
                setError(e instanceof Error ? e.message : "The map could not be saved. Your previous map is unchanged.");
            else
                setError("Map preparation paused. Your saved material is unchanged.");
        }
        finally {
            clearTimeout(timer);
            if (request.current === controller) {
                request.current = null;
                setBusy(false);
            }
        }
    };
    const start = () => {
        if (!graph || !track)
            return;
        try {
            const next = startKnowledgePractice(graph, track.title, chosen);
            saveKnowledgePractice(next);
            setRuns(loadKnowledgePractices(trackId));
            setRun(next);
            setError("");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Practice could not be saved. Free some storage and try again.");
        }
    };
    if (run)
        return <PracticeWorkspace key={run.id} initial={run} onBack={() => { setRun(null); setRuns(loadKnowledgePractices(trackId)); requestAnimationFrame(() => heading.current?.focus()); }} onSaved={() => setRuns(loadKnowledgePractices(trackId))}/>;
    return <section className="knowledge-workspace" aria-labelledby="knowledge-title">
    <header className="knowledge-heading"><div><span className="knowledge-eyebrow">Your learning, connected</span><h1 id="knowledge-title" ref={heading} tabIndex={-1}>Knowledge & practice</h1><p>See where an idea came from, explore its reasoning, and try it in a new situation.</p></div><button className="check-coach-button" onClick={onReturn}><ArrowLeft size={14}/> Back to learning</button></header>
    {pendingQuestion && <p className="knowledge-note" role="status">Lesson question saved · returning will count as supported practice.</p>}
    <div className="knowledge-toolbar"><label className="knowledge-topic">Material from<select value={trackId} onChange={e => setTrackId(e.target.value)} disabled={busy} aria-label="Knowledge topic">{tracks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label><button className="dialog-secondary-button" disabled={busy || !sources.length} onClick={() => void update()}>{busy ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} {busy ? "Connecting saved ideas…" : graph ? "Add from saved material" : "Build from saved material"}</button>{busy && <button className="check-coach-button" onClick={() => request.current?.abort()}>Cancel</button>}</div>
    <details className="knowledge-about"><summary>How this map works</summary><p>Saved explanations and source excerpts provide the ideas. The map does not measure understanding. Updating uses your configured AI connection and retains earlier ideas and practice records.</p></details>
    {error && <div className="continuation-error" role="alert">{error}</div>}
    {!graph ? <div className="knowledge-empty"><h2>{sources.length ? "Turn your saved material into connected ideas" : "Your knowledge map will grow from your learning"}</h2><p>{sources.length ? `${sources.length} saved passages are available in this topic. Build a first map to inspect their sources and choose ideas to practise.` : "Start a lesson or add source material first. There are no preset concepts or generated mastery scores here."}</p><button className="check-coach-button" onClick={() => onOpenTopic(trackId)}>Open this topic <ArrowRight size={14}/></button></div> : <>
      <div className="knowledge-practice-offer"><div><strong>{chosen.length} {chosen.length === 1 ? "idea" : "ideas"} selected for practice</strong><p>Choose up to three. Suggestions prioritize difficulty, untried ideas, then older practice.</p></div><button className="dialog-primary-button" disabled={!chosen.length || busy} onClick={start}>Practise selected ideas <ArrowRight size={14}/></button></div>
      <div className="knowledge-layout"><div className="knowledge-library"><div className="knowledge-library-tools"><label><Search size={14}/><input aria-label="Search saved ideas" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an idea…"/></label><div className="knowledge-view" aria-label="Knowledge view"><button aria-pressed={view === "ideas"} onClick={() => setView("ideas")}>Ideas ({graph.propositions.length})</button><button aria-pressed={view === "connections"} onClick={() => setView("connections")}>Connections</button></div></div>
        {view === "connections" && idea ? <Connections graph={graph} selected={idea.id} onSelect={select}/> : <ul className="knowledge-ideas">{matches.map(p => { const history = runs.flatMap(s => s.rounds.filter(r => r.targetId === p.id && r.attempt).map(r => ({ session: s, round: r }))).sort((a, b) => b.round.attempt!.submittedAt - a.round.attempt!.submittedAt); return <li key={p.id}><button className={idea?.id === p.id ? "is-selected" : ""} onClick={() => select(p.id)} aria-pressed={idea?.id === p.id}><span>{p.statement}</span><small>{history[0] ? OUTCOME_LABELS[outcomeFor(history[0].session, history[0].round)] : "Not practised"}{suggested.includes(p.id) ? " · suggested" : ""}</small></button><input type="checkbox" aria-label={`Include in practice: ${p.statement}`} checked={chosen.includes(p.id)} disabled={!chosen.includes(p.id) && chosen.length >= 3} onChange={e => setChosen(ids => e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))}/></li>; })}{!matches.length && <li className="knowledge-note">No ideas match this search.</li>}</ul>}
      </div>{idea && <aside className="knowledge-inspector" aria-label="Selected idea"><span className="knowledge-eyebrow">Extracted idea · source-backed, not certified</span><h2 ref={inspector} tabIndex={-1}>{idea.statement}</h2><button className="dialog-secondary-button" disabled={!chosen.includes(idea.id) && chosen.length >= 3} onClick={() => setChosen(ids => ids.includes(idea.id) ? ids.filter(id => id !== idea.id) : [...ids, idea.id])}>{chosen.includes(idea.id) ? <><Check size={14}/> Selected for practice</> : "Include in practice"}</button><h3>Where it came from</h3>{idea.anchors.map((a, i) => <details key={`${a.sourceId}:${i}`} open={i === 0}><summary>{graph.sources.find(s => s.id === a.sourceId)?.title || "Saved material"}</summary><blockquote><MarkdownView content={a.quote} compactFigures/></blockquote><small>{graph.sources.find(s => s.id === a.sourceId)?.kind} · exact saved passage</small></details>)}<h3>Reasoning links</h3>{graph.arguments.some(a => a.conclusionId === idea.id || a.premiseIds.includes(idea.id)) ? <button className="check-coach-button" onClick={() => setView("connections")}>Inspect complete premise groups <ArrowRight size={14}/></button> : <p>No reasoning link is recorded for this idea.</p>}<h3>Your practice evidence</h3>{runs.flatMap(s => s.rounds.filter(r => r.targetId === idea.id && r.attempt).map(r => ({ session: s, round: r }))).slice(0, 4).map(({ session: s, round: r }) => <button className="knowledge-evidence" key={`${s.id}:${r.id}`} onClick={() => setRun(s)}><span>{OUTCOME_LABELS[outcomeFor(s, r)]}</span><small>{new Date(r.attempt!.submittedAt).toLocaleDateString()} · review run</small></button>)}{!runs.some(s => s.rounds.some(r => r.targetId === idea.id && r.attempt)) && <p>No practice attempts yet. Reading this passage does not count as an attempt.</p>}<button className="check-coach-button" onClick={() => onOpenTopic(trackId)}>Open original topic <ArrowRight size={14}/></button></aside>}</div>
    </>}
    {runs.length > 0 && <section className="knowledge-history" aria-label="Saved practice runs"><h2>Pick up earlier practice</h2>{runs.slice(0, historyLimit).map(s => <button key={s.id} onClick={() => setRun(s)}><span>{s.status === "active" ? "Resume practice" : "Review practice"} · {s.targetIds.length} {s.targetIds.length === 1 ? "idea" : "ideas"}</span><small>{new Date(s.updatedAt).toLocaleDateString()} · {s.rounds.filter(r => r.attempt).length} answers saved</small><ArrowRight size={14}/></button>)}{runs.length>historyLimit&&<button onClick={()=>setHistoryLimit(n=>n+20)}>Show earlier runs <ArrowRight size={14}/></button>}</section>}
  </section>;
}
