import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  ArrowRight,
  Blocks,
  ExternalLink,
  Globe,
  Loader2,
  Compass,
  FileText,
  Search,
  Target,
  Upload,
} from "lucide-react";
import {
  PLUGINS_CHANGED_EVENT,
  getExaPluginConfig,
  isExaPluginReady,
  type ExaPluginConfig,
} from "../../services/plugins/registry";
import {
  ExaPluginError,
  fetchExaGrounding,
  parseDirectUrls,
  searchExaReferences,
  type ExaGroundedSource,
} from "../../services/plugins/exa";
import { generateCustomTrack } from "../../services/ai/curriculum";
import {
  generateCurriculumOutline,
  proposeLearningScope,
  type ScopeProposal,
} from "../../services/ai/curriculumOutline";
import {
  generateBoundaryProbes,
  summarizeBoundaryProbes,
  type BoundaryProbeQuestion,
  type BoundaryProbeResponse,
} from "../../services/ai/preProbe";
import {
  loadConceptLedger,
  relevantPriorConcepts,
} from "../../services/learning/conceptLedger";
import type { LearningScope } from "../../services/learning/curriculumPlan";
import { extractTextFromFile } from "../../services/learning/fileExtractor";
import type { CourseTrack } from "../../services/ai/types";
import type { ConfidenceLevel } from "../../types";
import { VoiceDictationButton } from "../learning/VoiceDictationButton";
import { PlanApproval } from "./PlanApproval";
import { CurriculumApproval } from "./CurriculumApproval";
import "./curriculum.css";

const draftKey = "learnforge:goal-draft";
const startingPoints = [
  "I’m not sure — help me find my starting point",
  "I’m starting from the beginning",
  "I know the basics and want to apply them",
  "I have experience and want to deepen it",
];
function savedDraft(): {
  interest?: string;
  destination?: string;
  startingPoint?: string;
} {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey) || "{}");
    return d && typeof d === "object"
      ? {
          interest:
            typeof d.interest === "string" ? d.interest.slice(0, 400) : "",
          destination:
            typeof d.destination === "string"
              ? d.destination.slice(0, 800)
              : "",
          startingPoint: startingPoints.includes(d.startingPoint)
            ? d.startingPoint
            : startingPoints[0],
        }
      : {};
  } catch {
    return {};
  }
}
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onTrackCreated: (track: CourseTrack) => void;
  onOpenPlugins?: () => void;
}
export const NewTopicModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onTrackCreated,
  onOpenPlugins,
}) => {
  const [interest, setInterest] = useState(() => savedDraft().interest || "");
  const [destination, setDestination] = useState(
    () => savedDraft().destination || ""
  );
  const [startingPoint, setStartingPoint] = useState(
    () =>
      savedDraft().startingPoint ||
      "I’m not sure — help me find my starting point"
  );
  const [referenceName, setReferenceName] = useState(""),
    [referenceContent, setReferenceContent] = useState("");
  const [exaConfig, setExaConfig] = useState<ExaPluginConfig>(() =>
    getExaPluginConfig()
  );
  const exaReady = isExaPluginReady(exaConfig);
  const [autoGroundWithExa, setAutoGroundWithExa] = useState<boolean>(() => {
    const cfg = getExaPluginConfig();
    return isExaPluginReady(cfg) && cfg.autoGroundNewTopics;
  });
  const [exaSources, setExaSources] = useState<ExaGroundedSource[]>([]);
  const [exaQuery, setExaQuery] = useState("");
  const [isFetchingExa, setIsFetchingExa] = useState(false);
  const [proposal, setProposal] = useState<ScopeProposal | null>(null),
    [scope, setScope] = useState<LearningScope>("curriculum");
  const [task, setTask] = useState<
    "idle" | "scoping" | "probing" | "creating"
  >("idle");
  const [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [probeQuestions, setProbeQuestions] = useState<BoundaryProbeQuestion[]>(
    []
  );
  const [probeResponses, setProbeResponses] = useState<
    Record<string, BoundaryProbeResponse>
  >({});

  const ledgerEntries = useMemo(
    () => (isOpen ? loadConceptLedger() : []),
    [isOpen]
  );
  const matchedPrior = useMemo(() => {
    const query = `${interest} ${destination}`.trim();
    if (!query || query.length < 3 || !ledgerEntries.length) return [];
    return relevantPriorConcepts(query, { entries: ledgerEntries, limit: 6 });
  }, [interest, destination, ledgerEntries]);

  const busy = task !== "idle" || isReadingFile || isFetchingExa;
  const [draftTrack, setDraftTrack] = useState<CourseTrack | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null),
    formRef = useRef<HTMLFormElement>(null),
    statusRef = useRef<HTMLDivElement>(null),
    inputRef = useRef<HTMLInputElement>(null),
    headingRef = useRef<HTMLHeadingElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    referenceDetailsRef = useRef<HTMLDetailsElement>(null),
    requestRef = useRef<AbortController | null>(null),
    exaControllerRef = useRef<AbortController | null>(null),
    errorRef = useRef<HTMLDivElement>(null),
    readSequence = useRef(0),
    readingFile = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    const syncPlugins = () => {
      const next = getExaPluginConfig();
      const nextReady = isExaPluginReady(next);
      setExaConfig((prev) => {
        const wasReady = isExaPluginReady(prev);
        if (!wasReady && nextReady) {
          setAutoGroundWithExa(next.autoGroundNewTopics);
        } else if (!nextReady) {
          setAutoGroundWithExa(false);
        }
        return next;
      });
    };
    window.addEventListener(PLUGINS_CHANGED_EVENT, syncPlugins);
    return () => window.removeEventListener(PLUGINS_CHANGED_EVENT, syncPlugins);
  }, []);
  useEffect(() => {
    if (exaSources.length > 0 && referenceDetailsRef.current) {
      referenceDetailsRef.current.open = true;
    }
  }, [exaSources.length]);
  useEffect(() => {
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ interest, destination, startingPoint })
      );
    } catch {}
  }, [interest, destination, startingPoint]);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    if (isOpen) {
      dialogRef.current?.showModal();
      inputRef.current?.focus();
    }
    return () => {
      mounted.current = false;
      requestRef.current?.abort();
      exaControllerRef.current?.abort();
      readSequence.current += 1;
      readingFile.current = false;
      dialogRef.current?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);
  useEffect(() => {
    if (proposal) {
      headingRef.current?.focus();
      formRef.current?.scrollTo({ top: 0 });
    }
  }, [proposal]);
  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  useEffect(() => {
    if (draftTrack || !proposal) return;
    headingRef.current?.focus({ preventScroll: true });
    formRef.current?.scrollTo({ top: 0 });
  }, [draftTrack]);
  useEffect(() => {
    if (task === "idle" && !isReadingFile && !isFetchingExa) return;
    const frame = requestAnimationFrame(() => {
      const form = formRef.current,
        status = statusRef.current;
      if (!form || !status) return;
      form.scrollTo({
        top: Math.max(
          0,
          form.scrollTop +
            status.getBoundingClientRect().top -
            form.getBoundingClientRect().top -
            30
        ),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [task, isReadingFile, isFetchingExa]);
  const close = () => {
    requestRef.current?.abort();
    exaControllerRef.current?.abort();
    onClose();
  };
  const cancel = () => {
    requestRef.current?.abort();
    exaControllerRef.current?.abort();
    readSequence.current += 1;
    readingFile.current = false;
    setIsReadingFile(false);
    setIsFetchingExa(false);
    setNotice(
      "Preparation cancelled. Your goal is still here; continue when you’re ready."
    );
  };

  const resolveGoalText = () =>
    interest.trim() ||
    (exaSources.length > 0
      ? `Teach me the key concepts in ${exaSources[0].title}`
      : referenceContent.trim()
      ? `Teach me the key concepts in ${referenceName || "my reference"}`
      : "");

  const handleFetchExaSources = async (explicitInput?: string) => {
    const rawInput = (explicitInput ?? exaQuery).trim() || interest.trim();
    if (
      task !== "idle" ||
      readingFile.current ||
      isFetchingExa ||
      !rawInput
    ) {
      return;
    }
    const controller = new AbortController();
    exaControllerRef.current = controller;
    setIsFetchingExa(true);
    setError("");
    setNotice("");
    try {
      const { mode, sources } = await fetchExaGrounding(rawInput, {
        config: exaConfig,
        signal: controller.signal,
      });
      if (!mounted.current || controller.signal.aborted) return;
      if (sources.length === 0) {
        setNotice("Exa returned no readable sources for that query. Try more specific keywords or a direct URL.");
        return;
      }
      setExaSources((prev) => {
        const merged = [...prev];
        for (const src of sources) {
          const exists = merged.some(
            (item) => item.url === src.url || item.id === src.id
          );
          if (!exists && merged.length < 6) {
            merged.push(src);
          }
        }
        return merged;
      });
      if (explicitInput === undefined) {
        setExaQuery("");
      }
      setInterest((prev) =>
        prev.trim()
          ? prev
          : `Teach me the key concepts in ${sources[0].title}`
      );
      setNotice(
        mode === "urls"
          ? `Extracted ${sources.length} web ${
              sources.length === 1 ? "source" : "sources"
            } via Exa.`
          : `Attached ${sources.length} live Exa ${
              sources.length === 1 ? "source" : "sources"
            } to ground your learning plan.`
      );
    } catch (e) {
      if (mounted.current && !controller.signal.aborted) {
        setError(
          e instanceof Error
            ? e.message
            : "Could not fetch sources from Exa."
        );
      }
    } finally {
      if (mounted.current) setIsFetchingExa(false);
      if (exaControllerRef.current === controller) {
        exaControllerRef.current = null;
      }
    }
  };

  const updateProbeResponse = (
    probeId: string,
    patch: Partial<BoundaryProbeResponse>
  ) => {
    setProbeResponses((prev) => {
      const current = prev[probeId] || {
        selectedOptionId: null,
        dontKnow: false,
        confidence: null,
        thinking: "",
      };
      return {
        ...prev,
        [probeId]: { ...current, ...patch },
      };
    });
  };

  const startBoundaryProbe = async () => {
    const goal = resolveGoalText();
    if (
      task !== "idle" ||
      requestRef.current ||
      readingFile.current ||
      isFetchingExa ||
      !goal
    )
      return;
    const controller = new AbortController();
    requestRef.current = controller;
    setTask("probing");
    setError("");
    setNotice("");
    setStatus("Preparing 3 quick boundary questions to calibrate your outline…");
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60000);
    try {
      const questions = await generateBoundaryProbes({
        goal,
        destination: destination.trim() || goal,
        startingPoint,
        priorConcepts: matchedPrior,
        signal: controller.signal,
      });
      if (!mounted.current || controller.signal.aborted) return;
      setProbeQuestions(questions);
      const initial: Record<string, BoundaryProbeResponse> = {};
      for (const q of questions) {
        initial[q.id] = {
          selectedOptionId: null,
          dontKnow: false,
          confidence: null,
          thinking: "",
        };
      }
      setProbeResponses(initial);
    } catch (e) {
      if (mounted.current && (!controller.signal.aborted || timedOut)) {
        setError(
          timedOut
            ? "Boundary probing took longer than expected. You can prepare the curriculum outline directly."
            : e instanceof Error
            ? e.message
            : "Could not prepare boundary questions."
        );
      }
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setTask("idle");
      if (requestRef.current === controller) requestRef.current = null;
    }
  };

  const run = async () => {
    const goal = resolveGoalText();
    if (
      task !== "idle" ||
      requestRef.current ||
      readingFile.current ||
      isFetchingExa ||
      !goal
    )
      return;
    const controller = new AbortController();
    requestRef.current = controller;
    setTask(proposal ? "creating" : "scoping");
    setError("");
    setNotice("");
    const updateStatus = (text: string) => {
      if (
        mounted.current &&
        requestRef.current === controller &&
        !controller.signal.aborted
      )
        setStatus(text);
    };
    setStatus(
      proposal
        ? "Preparing the scope and outcomes…"
        : "Understanding the scope of your goal…"
    );
    let timedOut = false;
    const timeout = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      proposal ? 240000 : 60000
    );
    try {
      if (!proposal) {
        const proposed = await proposeLearningScope(goal, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setScope(proposed.scope);
        setProposal(proposed);
      } else {
        let activeExaSources = exaSources;
        if (exaReady && autoGroundWithExa && activeExaSources.length === 0) {
          updateStatus("Searching live documentation & sources with Exa…");
          try {
            const fetched = await searchExaReferences(
              `${goal} ${destination}`.trim(),
              { config: exaConfig, signal: controller.signal }
            );
            if (!mounted.current || controller.signal.aborted) return;
            if (fetched.length > 0) {
              activeExaSources = fetched;
              setExaSources(fetched);
            }
          } catch (exaErr) {
            if (controller.signal.aborted) return;
            if (
              exaErr instanceof ExaPluginError &&
              (exaErr.status === 401 || exaErr.status === 403)
            ) {
              throw exaErr;
            }
            if (mounted.current) {
              setNotice(
                `Exa live grounding was unavailable (${
                  exaErr instanceof Error ? exaErr.message : "network error"
                }); preparing plan without web sources.`
              );
            }
          }
          updateStatus("Preparing the scope and outcomes…");
        }

        const options = {
          topic: goal,
          interest: goal,
          signal: controller.signal,
          references:
            activeExaSources.length > 0
              ? activeExaSources.map((s) => s.reference)
              : undefined,
          referenceMaterial: referenceContent.trim()
            ? {
                name: referenceName || "Reference notes",
                content: referenceContent,
              }
            : undefined,
        };
        const boundaryEvidence =
          scope === "curriculum" && probeQuestions.length > 0
            ? summarizeBoundaryProbes(probeQuestions, probeResponses)
            : undefined;
        const track =
          scope === "curriculum"
            ? await generateCurriculumOutline(
                {
                  ...options,
                  destination: destination.trim() || goal,
                  startingPoint,
                  priorConcepts: matchedPrior,
                  boundaryEvidence,
                },
                updateStatus
              )
            : await generateCustomTrack(
                {
                  ...options,
                  topic: destination.trim() || goal,
                  unitContext: JSON.stringify({
                    scope: "focused",
                    originalGoal: goal,
                    desiredAbility: destination.trim() || goal,
                    startingPoint,
                    instruction:
                      "Prepare exactly one focused lesson, not a full path.",
                  }),
                },
                updateStatus
              );
        if (!mounted.current || controller.signal.aborted) return;
        setDraftTrack(track);
      }
    } catch (e) {
      if (mounted.current && (!controller.signal.aborted || timedOut))
        setError(
          timedOut
            ? "This is taking longer than expected. Your goal is saved; try again."
            : e instanceof Error
            ? e.message
            : "This could not be prepared. Try again."
        );
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setTask("idle");
      if (requestRef.current === controller) requestRef.current = null;
    }
  };
  const processFile = async (file: File) => {
    if (task !== "idle" || readingFile.current) return;
    const sequence = ++readSequence.current;
    readingFile.current = true;
    setIsReadingFile(true);
    setError("");
    setNotice("");
    try {
      const content = await extractTextFromFile(file);
      if (!mounted.current || readSequence.current !== sequence) return;
      setReferenceName(file.name);
      setReferenceContent(content);
      setInterest((prev) =>
        prev.trim() ? prev : `Teach me the key concepts in ${file.name}`
      );
      setProposal(null);
      setProbeQuestions([]);
      setNotice(`Added ${file.name}. Review your goal before continuing.`);
    } catch (e) {
      if (mounted.current && readSequence.current === sequence)
        setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      if (readSequence.current === sequence) {
        readingFile.current = false;
        if (mounted.current) setIsReadingFile(false);
      }
    }
  };
  const approve = (track: CourseTrack) => {
    onTrackCreated(track);
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    onClose();
  };
  return (
    <dialog
      ref={dialogRef}
      className={`review-dialog new-topic-dialog ${
        draftTrack?.curriculum ? "curriculum-review-dialog" : ""
      }`}
      aria-labelledby="new-topic-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="review-surface">
        <header className="review-header">
          <div>
            <Compass size={18} />
            <h2 id="new-topic-title">
              {draftTrack
                ? "Review your learning plan"
                : "What would you like to learn?"}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close new topic"
          >
            <X size={18} />
          </button>
        </header>
        {draftTrack ? (
          draftTrack.curriculum ? (
            <CurriculumApproval
              track={draftTrack}
              onApprove={approve}
              onRevise={() => setDraftTrack(null)}
            />
          ) : (
            <PlanApproval
              track={draftTrack}
              onApprove={approve}
              onRevise={() => setDraftTrack(null)}
            />
          )
        ) : (
          <form
            ref={formRef}
            className="new-topic-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <div className="new-topic-intro">
              <h3 ref={headingRef} tabIndex={-1}>
                {proposal
                  ? "Shape the path around your goal"
                  : "Start with what you want to understand"}
              </h3>
              <p>
                {proposal
                  ? proposal.reason
                  : "A broad goal becomes a curriculum. A precise question becomes a focused lesson. You can adjust the scope before starting."}
              </p>
            </div>
            <label htmlFor="topic-input">Your learning goal</label>
            <input
              ref={inputRef}
              id="topic-input"
              value={interest}
              onChange={(e) => {
                setInterest(e.target.value);
                setProposal(null);
                setProbeQuestions([]);
                setError("");
              }}
              disabled={busy}
              maxLength={400}
              required={!referenceContent.trim() && exaSources.length === 0}
              autoComplete="off"
              placeholder="What would you like to be able to do?"
            />
            {exaReady ? (
              <div
                className={`exa-grounding-bar ${
                  autoGroundWithExa || exaSources.length > 0 ? "is-active" : ""
                }`}
              >
                <label className="exa-grounding-toggle">
                  <input
                    type="checkbox"
                    checked={autoGroundWithExa || exaSources.length > 0}
                    disabled={busy || exaSources.length > 0}
                    onChange={(e) => setAutoGroundWithExa(e.target.checked)}
                  />
                  <Globe size={13} aria-hidden="true" />
                  <span>
                    {exaSources.length > 0
                      ? `Grounded with ${exaSources.length} live Exa ${
                          exaSources.length === 1 ? "source" : "sources"
                        }`
                      : "Ground with live Exa docs & papers"}
                  </span>
                </label>
                {interest.trim() && (
                  <button
                    type="button"
                    className="exa-mini-action"
                    disabled={busy}
                    onClick={() =>
                      void handleFetchExaSources(
                        `${interest} ${destination}`.trim()
                      )
                    }
                  >
                    {exaSources.length > 0
                      ? "Fetch more sources"
                      : "Preview sources"}
                  </button>
                )}
              </div>
            ) : (
              onOpenPlugins && (
                <div className="exa-grounding-promo">
                  <span>
                    <Blocks size={13} aria-hidden="true" /> Learning a
                    fast-moving library, API, or paper?
                  </span>
                  <button
                    type="button"
                    className="exa-mini-action"
                    disabled={busy}
                    onClick={onOpenPlugins}
                  >
                    Connect Exa plugin
                  </button>
                </div>
              )
            )}
            {matchedPrior.length > 0 && (
              <details className="prior-ledger-pill">
                <summary>
                  <Compass size={13} aria-hidden="true" />
                  <span>
                    Prior knowledge recognized:{" "}
                    <strong>
                      {matchedPrior.length}{" "}
                      {matchedPrior.length === 1 ? "concept" : "concepts"}
                    </strong>{" "}
                    from earlier sessions
                  </span>
                </summary>
                <ul>
                  {matchedPrior.map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.title}</strong>
                      <span> · {entry.trackTitle}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {proposal && (
              <section className="curriculum-brief" aria-label="Learning scope">
                <div className="curriculum-scope-options">
                  {(["curriculum", "focused"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={scope === value}
                      disabled={busy}
                      onClick={() => setScope(value)}
                    >
                      {value === "curriculum"
                        ? "Full curriculum"
                        : "Focused lesson"}
                    </button>
                  ))}
                </div>
                <p>
                  {scope === "curriculum"
                    ? "A complete outline for an agreed goal, taught one unit at a time."
                    : "One small question or skill, with explanation, practice and feedback."}
                </p>
                <label htmlFor="goal-destination">
                  What do you want to be able to do? <span>(optional)</span>
                </label>
                <input
                  id="goal-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  maxLength={800}
                  disabled={busy}
                  placeholder="A practical outcome, or leave blank to use your goal"
                />
                <label htmlFor="goal-starting-point">
                  Where are you starting?
                </label>
                <select
                  id="goal-starting-point"
                  value={startingPoint}
                  onChange={(e) => setStartingPoint(e.target.value)}
                  disabled={busy}
                >
                  {startingPoints.map((point) => (
                    <option key={point}>{point}</option>
                  ))}
                </select>
                {scope === "curriculum" &&
                  startingPoint !== "I’m starting from the beginning" &&
                  probeQuestions.length === 0 && (
                    <div className="boundary-probe-cta">
                      <div>
                        <strong>Calibrate before freezing the outline</strong>
                        <small>
                          Answer 3 quick boundary questions so already-known
                          basics are pruned upfront.
                        </small>
                      </div>
                      <button
                        type="button"
                        className="check-coach-button"
                        disabled={busy}
                        onClick={() => void startBoundaryProbe()}
                      >
                        <Target size={13} />
                        Probe my starting boundary
                      </button>
                    </div>
                  )}
                {scope === "curriculum" && probeQuestions.length > 0 && (
                  <div
                    className="boundary-probe-panel"
                    role="region"
                    aria-label="Pre-outline boundary probe"
                  >
                    <div className="boundary-probe-header">
                      <div>
                        <strong>Quick boundary check</strong>
                        <small>
                          Your answers prune redundant basics before generating
                          the curriculum.
                        </small>
                      </div>
                      <button
                        type="button"
                        className="check-coach-button"
                        disabled={busy}
                        onClick={() => setProbeQuestions([])}
                      >
                        Skip probe
                      </button>
                    </div>
                    {probeQuestions.map((q, idx) => {
                      const reply = probeResponses[q.id] || {
                        selectedOptionId: null,
                        dontKnow: false,
                        confidence: null,
                        thinking: "",
                      };
                      return (
                        <fieldset key={q.id} className="boundary-probe-card">
                          <legend>
                            <span className="boundary-probe-tier">
                              {idx + 1}. {q.conceptTested}
                            </span>
                            {q.question}
                          </legend>
                          <div className="boundary-probe-options">
                            {q.options.map((opt) => (
                              <label
                                key={opt.id}
                                className={
                                  reply.selectedOptionId === opt.id &&
                                  !reply.dontKnow
                                    ? "is-selected"
                                    : ""
                                }
                              >
                                <input
                                  type="radio"
                                  name={`boundary-probe-${q.id}`}
                                  checked={
                                    reply.selectedOptionId === opt.id &&
                                    !reply.dontKnow
                                  }
                                  disabled={busy}
                                  onChange={() =>
                                    updateProbeResponse(q.id, {
                                      selectedOptionId: opt.id,
                                      dontKnow: false,
                                    })
                                  }
                                />
                                <span>{opt.label}</span>
                              </label>
                            ))}
                            <label
                              className={reply.dontKnow ? "is-selected" : ""}
                            >
                              <input
                                type="radio"
                                name={`boundary-probe-${q.id}`}
                                checked={reply.dontKnow}
                                disabled={busy}
                                onChange={() =>
                                  updateProbeResponse(q.id, {
                                    selectedOptionId: null,
                                    dontKnow: true,
                                  })
                                }
                              />
                              <span>I’m not sure yet</span>
                            </label>
                          </div>
                          {!reply.dontKnow && reply.selectedOptionId && (
                            <div className="boundary-probe-meta">
                              <div
                                className="boundary-probe-confidence"
                                role="group"
                                aria-label={`Confidence for question ${idx + 1}`}
                              >
                                {(
                                  [
                                    ["unsure", "Guessing"],
                                    ["somewhat", "Fairly sure"],
                                    ["confident", "Certain"],
                                  ] as [ConfidenceLevel, string][]
                                ).map(([val, text]) => (
                                  <button
                                    key={val}
                                    type="button"
                                    aria-pressed={reply.confidence === val}
                                    disabled={busy}
                                    onClick={() =>
                                      updateProbeResponse(q.id, {
                                        confidence:
                                          reply.confidence === val ? null : val,
                                      })
                                    }
                                  >
                                    {text}
                                  </button>
                                ))}
                              </div>
                              <div className="boundary-probe-thinking">
                                <input
                                  type="text"
                                  aria-label={`Optional reasoning for ${q.conceptTested}`}
                                  placeholder="Think out loud (optional, 1 line)…"
                                  maxLength={240}
                                  disabled={busy}
                                  value={reply.thinking}
                                  onChange={(e) =>
                                    updateProbeResponse(q.id, {
                                      thinking: e.target.value,
                                    })
                                  }
                                />
                                <VoiceDictationButton
                                  compact
                                  disabled={busy}
                                  label="Dictate reasoning"
                                  onTranscript={(chunk) =>
                                    updateProbeResponse(q.id, {
                                      thinking: reply.thinking
                                        ? `${reply.thinking.trimEnd()} ${chunk}`.slice(
                                            0,
                                            240
                                          )
                                        : chunk.slice(0, 240),
                                    })
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </fieldset>
                      );
                    })}
                  </div>
                )}
                <small>
                  Placement is optional. The plan is reviewed before anything is
                  added.
                </small>
              </section>
            )}
            <details
              ref={referenceDetailsRef}
              className={`new-topic-reference ${
                referenceContent.trim() || exaSources.length > 0
                  ? "has-file"
                  : ""
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy && e.dataTransfer.files[0])
                  void processFile(e.dataTransfer.files[0]);
              }}
            >
              <summary>
                <FileText size={14} />{" "}
                {exaReady
                  ? "Teach from live docs, URLs, or my own material"
                  : "Teach from my own material"}{" "}
                {(exaSources.length > 0 || referenceContent.trim()) && (
                  <em>
                    {exaSources.length > 0 && referenceContent.trim()
                      ? `${exaSources.length} Exa + 1 note`
                      : exaSources.length > 0
                      ? `${exaSources.length} Exa ${
                          exaSources.length === 1 ? "source" : "sources"
                        }`
                      : "Attached"}
                  </em>
                )}
              </summary>
              <div className="new-topic-reference-body">
                {exaReady && (
                  <div className="exa-importer-box">
                    <div className="exa-importer-row">
                      <input
                        type="text"
                        aria-label="Search docs or paste URLs for Exa"
                        value={exaQuery}
                        disabled={busy}
                        placeholder="Paste https:// URL(s) or search docs & papers with Exa…"
                        onChange={(e) => setExaQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (exaQuery.trim() || interest.trim()) {
                              void handleFetchExaSources();
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="check-coach-button"
                        disabled={busy || (!exaQuery.trim() && !interest.trim())}
                        onClick={() => void handleFetchExaSources()}
                      >
                        {isFetchingExa ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Search size={13} />
                        )}
                        {parseDirectUrls(exaQuery).length > 0
                          ? "Extract URL"
                          : "Fetch with Exa"}
                      </button>
                    </div>
                    <small className="exa-importer-hint">
                      Paste 1–5 URLs to extract clean markdown via Exa{" "}
                      <code>/contents</code>, or enter a topic to pull live
                      documentation.
                    </small>
                  </div>
                )}

                {exaSources.length > 0 && (
                  <div className="exa-source-list-wrap">
                    <div className="exa-source-list-header">
                      <span>
                        Attached Exa sources ({exaSources.length})
                      </span>
                      <button
                        type="button"
                        className="exa-mini-action"
                        disabled={busy}
                        onClick={() => setExaSources([])}
                      >
                        Clear all
                      </button>
                    </div>
                    <ul
                      className="exa-source-list"
                      aria-label="Attached Exa sources"
                    >
                      {exaSources.map((src) => (
                        <li key={src.id} className="exa-source-card">
                          <div className="exa-source-card-main">
                            <div className="exa-source-card-title">
                              <span className="exa-source-badge">Exa</span>
                              <strong>{src.title}</strong>
                              <span className="exa-source-domain">
                                {src.domain}
                              </span>
                              {src.publishedDate && (
                                <span className="exa-source-date">
                                  {src.publishedDate}
                                </span>
                              )}
                            </div>
                            {src.snippet && <p>{src.snippet}</p>}
                          </div>
                          <div className="exa-source-card-actions">
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="icon-button"
                              aria-label={`Open ${src.title}`}
                              title={src.url}
                            >
                              <ExternalLink size={13} />
                            </a>
                            <button
                              type="button"
                              className="icon-button"
                              disabled={busy}
                              aria-label={`Remove ${src.title}`}
                              onClick={() =>
                                setExaSources((prev) =>
                                  prev.filter((item) => item.id !== src.id)
                                )
                              }
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  aria-label="Upload reference file or code"
                  accept=".md,.txt,.pdf,.go,.rs,.py,.ts,.tsx,.js,.jsx,.json,.csv,.html,.sql,.sh,.yaml,.yml,.toml,.c,.cpp,.h,.java"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void processFile(file);
                    e.target.value = "";
                  }}
                />
                <div className="new-topic-file-row">
                  <button
                    type="button"
                    className="check-coach-button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={13} /> Choose local file
                  </button>
                  {referenceName && <small>{referenceName}</small>}
                </div>
                <textarea
                  rows={3}
                  aria-label="Reference notes"
                  value={referenceContent}
                  disabled={busy}
                  onChange={(e) => {
                    setReferenceContent(e.target.value);
                    if (!referenceName) setReferenceName("Pasted notes");
                  }}
                  placeholder="Paste notes or selectable source text…"
                />
                {referenceContent && (
                  <button
                    type="button"
                    className="check-coach-button"
                    disabled={busy}
                    onClick={() => {
                      setReferenceName("");
                      setReferenceContent("");
                    }}
                  >
                    Remove reference
                  </button>
                )}
              </div>
            </details>
            {busy && (
              <div
                ref={statusRef}
                className="topic-generation-status"
                role="status"
              >
                <Loader2 size={15} className="animate-spin" />
                <div>
                  <strong>
                    {isReadingFile
                      ? "Reading your material"
                      : isFetchingExa
                      ? "Fetching live sources with Exa"
                      : task === "scoping"
                      ? "Finding the right scope"
                      : task === "probing"
                      ? "Preparing boundary questions"
                      : scope === "curriculum"
                      ? "Preparing the curriculum outline"
                      : "Preparing a focused lesson"}
                  </strong>
                  <p>
                    {isReadingFile
                      ? "Extracting the text before planning. Your material stays attached to this goal."
                      : isFetchingExa
                      ? "Pulling clean documentation excerpts and citations to ground your learning plan."
                      : status}
                  </p>
                  <small>You can cancel. Your goal stays saved.</small>
                </div>
              </div>
            )}
            {error && (
              <div
                ref={errorRef}
                tabIndex={-1}
                className="topic-error"
                role="alert"
              >
                {error}
              </div>
            )}
            {notice && (
              <p className="curriculum-notice" role="status">
                {notice}
              </p>
            )}
            <footer className="new-topic-footer">
              <button
                className="dialog-secondary-button"
                type="button"
                onClick={busy ? cancel : close}
              >
                {busy ? "Cancel preparation" : "Cancel"}
              </button>
              <button
                className="dialog-primary-button"
                type="submit"
                disabled={
                  busy ||
                  (!interest.trim() &&
                    !referenceContent.trim() &&
                    exaSources.length === 0)
                }
              >
                {busy ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <ArrowRight size={14} />
                )}
                {error
                  ? "Try again"
                  : proposal
                  ? scope === "curriculum"
                    ? probeQuestions.length > 0
                      ? "Prepare calibrated outline"
                      : "Prepare curriculum outline"
                    : "Prepare focused lesson"
                  : "Shape my learning goal"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </dialog>
  );
};
