import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Code2,
  History,
  ListTree,
  Loader2,
  X,
  ArrowRight,
  Eye,
  Lightbulb,
} from "lucide-react";
import type {
  ChatMessage,
  Milestone,
  LearningCheck,
  CheckAttempt,
} from "../../types";
import {
  AI_CONNECTION_EVENT,
  AI_STATUS_EVENT,
  type AIStatusDetail,
  contextWindowFor,
  fetchProviderModels,
  loadAIConnection,
  presetFor,
  readUsage,
} from "../../services/ai/connection";
import { ContextRing } from "./ContextRing";
import {
  hideLearningCheckBlocks,
  learningEvidence,
  starterLearningCheck,
} from "../../services/learning/checks";
import { approvedLessonIds } from "../../services/learning/adaptation";
import {
  readLessonStep,
  saveLessonStep,
  splitLessonIntoSlides,
  writeLessonProgress,
} from "../../services/learning/steps";
import { MarkdownView } from "./MarkdownView";
import { VisualExample } from "../learning/VisualExample";
import { ReferenceShelf } from "../learning/ReferenceShelf";
import { useLearningPreferences } from "../learning/useLearningPreferences";
import {
  recordVisualSupport,
  visualSupportFor,
} from "../../services/learning/preferences";
import {
  askBtwQuestion,
  buildAnkiTsv,
  buildStudySheet,
  buildStudySheetMarkdown,
} from "../../services/learning/studySheet";
import {
  formatCheckContext,
  questionPresentation,
} from "../learning/questionPresentation";
import { QuestionCard } from "../learning/QuestionCard";
import { MasteryMeter } from "../learning/MasteryMeter";
import { Composer } from "./Composer";
import { cleanMilestoneTitle } from "../milestones/MilestoneSidebar";

interface ChatPaneProps {
  trackId: string;
  isRequestingCheck: boolean;
  onRequestCheck: () => void;
  onSubmitCheck: (check: LearningCheck, attempt: CheckAttempt) => void;
  onContinueCheck: (check: LearningCheck) => void;
  onDisputeCheck?: (check: LearningCheck) => void;
  isCodeWorkspaceOpen: boolean;
  onToggleCode: () => void;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent?: string;
  activeMilestone: Milestone | null;
  milestones?: Milestone[];
  milestoneIndex: number;
  milestoneCount: number;
  onSendMessage: (message: string) => void;
  onStopStreaming: () => void;
  onApplyCodeToEditor?: (code: string) => void;
  onQuickAction?: (
    action: "hint" | "explain" | "review" | "derivation" | "visual" | "clarify"
  ) => void;
  onOpenEditor: () => void;
  onNextMilestone?: () => void;
  onOpenSettings?: () => void;
  language?: string;
  allowCoding?: boolean;
}

/** Earlier versions stored quick-action instructions as the learner's message. */
const LEGACY_QUICK_ACTIONS: [string, string][] = [
  ["Give me a Socratic hint", "Can I have a hint?"],
  ["Explain the idea behind this lesson", "Can you explain this idea?"],
  ["Deep dive into the core mental model", "Can you explain this idea?"],
  ["Review my current code in the editor", "Can you review my code?"],
  [
    "Walk through the core concept of this specific challenge",
    "Show me the steps.",
  ],
  ["Provide a step-by-step state derivation ladder", "Show me the steps."],
];
const visibleText = (message: ChatMessage) =>
  message.role === "user"
    ? LEGACY_QUICK_ACTIONS.find(([prefix]) =>
        message.content.startsWith(prefix)
      )?.[1] ?? message.content
    : message.content;

/** Teaching tools share one session. The learner never has to choose a teaching mode. */
function previewText(text: string, maxLen = 75): string {
  const clean = text
    .replace(/[#*`_~[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "View details";
  return clean.length > maxLen ? `${clean.slice(0, maxLen).trim()}…` : clean;
}

export const ChatPane: React.FC<ChatPaneProps> = ({
  trackId,
  isRequestingCheck,
  onRequestCheck,
  onSubmitCheck,
  onContinueCheck,
  onDisputeCheck,
  isCodeWorkspaceOpen,
  onToggleCode,
  messages,
  isStreaming,
  streamingContent,
  activeMilestone,
  milestones,
  milestoneIndex,
  milestoneCount,
  onSendMessage,
  onStopStreaming,
  onApplyCodeToEditor,
  onQuickAction,
  onOpenEditor,
  onNextMilestone,
  onOpenSettings,
  language,
  allowCoding = true,
}) => {
  const preferences = useLearningPreferences();
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDialogElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<"timeline" | "sheet">("timeline");
  const [copiedSheet, setCopiedSheet] = useState(false);
  const [btwMode, setBtwMode] = useState(false);
  const [aiConn, setAiConn] = useState(() => loadAIConnection());
  const [usage, setUsage] = useState(() => readUsage());
  const [aiStatus, setAiStatus] = useState<AIStatusDetail>({
    ok: true,
    message: "",
  });
  const [contextWindow, setContextWindow] = useState(() =>
    contextWindowFor(loadAIConnection().model)
  );
  const [tokensBumped, setTokensBumped] = useState(false);
  const lastTokenTotal = useRef(0);

  useEffect(() => {
    const syncTelemetry = () => {
      const conn = loadAIConnection();
      setAiConn(conn);
      setUsage(readUsage());
      setContextWindow(contextWindowFor(conn.model));
    };
    const onStatus = (e: Event) =>
      setAiStatus((e as CustomEvent<AIStatusDetail>).detail);
    window.addEventListener(AI_CONNECTION_EVENT, syncTelemetry);
    window.addEventListener(AI_STATUS_EVENT, onStatus);
    return () => {
      window.removeEventListener(AI_CONNECTION_EVENT, syncTelemetry);
      window.removeEventListener(AI_STATUS_EVENT, onStatus);
    };
  }, []);

  // Learn the real context window from live model metadata (ChatGPT / Codex).
  useEffect(() => {
    if (aiConn.provider !== "chatgpt-codex") return;
    let cancelled = false;
    void fetchProviderModels(aiConn).then(() => {
      if (!cancelled) setContextWindow(contextWindowFor(aiConn.model));
    });
    return () => {
      cancelled = true;
    };
  }, [aiConn.provider, aiConn.model]);

  useEffect(() => {
    setUsage(readUsage());
    setAiConn(loadAIConnection());
  }, [messages.length, isStreaming, btwMode]);

  const formatTok = (n: number): string => {
    if (n < 1000) return `${n}`;
    return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  };
  const contextChars =
    (activeMilestone?.lesson?.length || 0) +
    (activeMilestone?.prompt?.length || 0) +
    (activeMilestone?.starter_code?.length || 0) +
    messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const contextTokens = Math.max(1, Math.ceil(contextChars / 4));
  const turnCount = messages.filter(
    (m) => m.role !== "system" && !m.internal
  ).length;
  const totalUsedTokens = usage.prompt + usage.completion;
  useEffect(() => {
    if (lastTokenTotal.current && totalUsedTokens > lastTokenTotal.current) {
      setTokensBumped(true);
      const t = window.setTimeout(() => setTokensBumped(false), 320);
      lastTokenTotal.current = totalUsedTokens;
      return () => window.clearTimeout(t);
    }
    lastTokenTotal.current = totalUsedTokens;
  }, [totalUsedTokens]);
  const contextRatio = Math.min(1, contextTokens / Math.max(1, contextWindow));
  const inShare =
    totalUsedTokens > 0 ? (usage.prompt / totalUsedTokens) * 100 : 0;
  const providerLabel = presetFor(aiConn.provider).label.replace(
    /\s*\(.*?\)\s*/g,
    ""
  );
  const [btwState, setBtwState] = useState<{
    question: string;
    answer?: string;
    loading: boolean;
    error?: string;
  } | null>(null);
  const btwRequest = useRef<AbortController | null>(null);
  const pendingBtwCheck = useRef<string | null>(null);
  useEffect(() => {
    setBtwState(null);
    setBtwMode(false);
    return () => btwRequest.current?.abort();
  }, [activeMilestone?.id]);
  useEffect(() => {
    if (btwState && !btwState.loading) setUsage(readUsage());
  }, [btwState?.loading]);
  const handleComposerSend = (text: string) => {
    const trimmed = text.trim();
    if (btwMode || /^\/btw\b/i.test(trimmed)) {
      const cleanQ = trimmed.replace(/^\/btw\b\s*/i, "").trim();
      if (!cleanQ) return;
      btwRequest.current?.abort();
      const controller = new AbortController();
      btwRequest.current = controller;
      const checkId = pendingBtwCheck.current;
      setBtwMode(false);
      setBtwState({ question: cleanQ, loading: true });
      void askBtwQuestion(cleanQ, activeMilestone, latest || null, controller.signal)
        .then((answer) => {
          if (controller.signal.aborted) return;
          if (checkId && pendingBtwCheck.current === checkId)
            recordVisualSupport(checkId, "help:side-question");
          setBtwState({ question: cleanQ, answer, loading: false });
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setBtwState({
            question: cleanQ,
            loading: false,
            error: err?.message || "Could not answer side question.",
          });
        });
      return;
    }
    onSendMessage(text);
  };
  const relevant = messages.filter(
    (m) =>
      m.milestone_id === activeMilestone?.id ||
      m.learning_check?.milestoneId === activeMilestone?.id ||
      m.check_attempt?.milestoneId === activeMilestone?.id
  );
  const lastReply = [...relevant]
    .reverse()
    .find((m) => m.role === "assistant" && !m.internal && !m.roadmap_change && !m.generation_error && !m.content.startsWith("**Your coach couldn’t connect.**"));
  const lastError = [...relevant].reverse().find((m) => m.generation_error || m.content.startsWith("**Your coach couldn’t connect.**"));
  const continuationError = lastError && messages.indexOf(lastError) > messages.findIndex((m) => m.id === lastReply?.id)
    ? lastError : undefined;
  const starter = activeMilestone
    ? starterLearningCheck(trackId, activeMilestone, milestoneIndex)
    : null;
  const latest =
    [...relevant].reverse().find((m) => m.learning_check)?.learning_check ||
    starter;
  const attemptFor = (check: LearningCheck) =>
    messages.find((m) => m.check_attempt?.checkId === check.id)?.check_attempt;
  const attempt = latest ? attemptFor(latest) : undefined;
  pendingBtwCheck.current = latest && !attempt ? latest.id : null;
  const approved =
    !!activeMilestone && approvedLessonIds(messages).has(activeMilestone.id);
  const evidence = activeMilestone
    ? learningEvidence(messages, activeMilestone.id)
    : null;
  const lessonSteps = React.useMemo(
    () => splitLessonIntoSlides(activeMilestone?.lesson),
    [activeMilestone?.lesson]
  );
  const replySteps = React.useMemo(
    () =>
      splitLessonIntoSlides(hideLearningCheckBlocks(lastReply?.content || "")),
    [lastReply?.content]
  );
  const referenceFor = (check: LearningCheck) => {
    const presentation = questionPresentation(check.question);
    return [
      check.context ? formatCheckContext(check.context, language) : "",
      ...presentation.snippets.map(
        (code) => `\`\`\`${language || "text"}\n${code}\n\`\`\``
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
  };
  const reference = latest ? referenceFor(latest) : "";
  const seenReferences = useRef(new Set<string>());
  const checkEntry = (): Activity =>
    latest && reference && !attempt && !seenReferences.current.has(latest.id)
      ? "reference"
      : "check";
  type Activity = "lesson" | "reference" | "check" | "reply" | "visual";
  const awaitingReview =
    !!attempt &&
    messages.findIndex((m) => m.check_attempt?.checkId === latest?.id) >
      messages.findIndex((m) => m.id === lastReply?.id);
  const entryActivity = (): Activity =>
    awaitingReview
      ? "check"
      : lastReply?.visual_example
      ? "visual"
      : lastReply?.learning_check
      ? checkEntry()
      : lastReply
      ? "reply"
      : lessonSteps.length
      ? "lesson"
      : checkEntry();
  const [activity, setActivity] = useState<Activity>(entryActivity);
  const [stepIndex, setStepIndex] = useState(() =>
    readLessonStep(activeMilestone?.id)
  );
  const [replyIndex, setReplyIndex] = useState(0);
  const [overview, setOverview] = useState(preferences.pace === "overview");
  const [lessonVisual, setLessonVisual] = useState(!lastReply?.visual_example);
  const [inlineVisualOpen, setInlineVisualOpen] = useState(false);
  const visibleStep = Math.min(stepIndex, Math.max(0, lessonSteps.length - 1));
  const replyStep = Math.min(replyIndex, Math.max(0, replySteps.length - 1));
  const visual = lessonVisual
    ? activeMilestone?.visual
    : lastReply?.visual_example;
  const availableVisual =
    lastReply?.visual_example || activeMilestone?.visual;
  const busy = isStreaming || isRequestingCheck;
  const ask = () => composerRef.current?.querySelector("textarea")?.focus();
  const lastSeenReply = useRef(lastReply?.id);
  // After an answer, keep that question's feedback on screen (even while the
  // follow-up is generated in the background) until the learner continues.
  const [heldCheck, setHeldCheck] = useState<LearningCheck | null>(null);
  // Mirrors the hold synchronously so effects in the same commit see it.
  const heldRef = useRef(false);
  const continuationRequested = useRef(false);
  const holdCheck = (check: LearningCheck | null) => {
    heldRef.current = !!check;
    setHeldCheck(check);
  };
  const answeredId = attempt ? latest?.id : undefined;
  const previousAnsweredId = useRef(answeredId);
  useEffect(() => {
    if (
      answeredId &&
      answeredId !== previousAnsweredId.current &&
      activity === "check" &&
      latest
    )
      holdCheck(latest);
    previousAnsweredId.current = answeredId;
  }, [answeredId]);
  useEffect(() => {
    if (activity !== "check" && heldRef.current) holdCheck(null);
  }, [activity]);
  const reviewCheck = heldCheck || latest;
  const reviewAttempt = reviewCheck ? attemptFor(reviewCheck) : undefined;
  const held = !!heldCheck;
  useEffect(() => {
    setStepIndex(readLessonStep(activeMilestone?.id));
    setReplyIndex(0);
    setOverview(preferences.pace === "overview");
    setLessonVisual(!lastReply?.visual_example);
    setActivity(entryActivity());
    holdCheck(null);
    continuationRequested.current = false;
    lastSeenReply.current = lastReply?.id;
  }, [activeMilestone?.id]);
  useEffect(
    () => setOverview(preferences.pace === "overview"),
    [preferences.pace]
  );
  const showLatestReply = () => {
    if (isStreaming) setActivity("reply");
    else if (lastReply?.id && lastReply.id !== lastSeenReply.current) {
      lastSeenReply.current = lastReply.id;
      setReplyIndex(0);
      setLessonVisual(false);
      setActivity(
        lastReply.visual_example
          ? "visual"
          : lastReply.learning_check && lastReply.content.length < 280
          ? checkEntry()
          : "reply"
      );
    }
  };
  useEffect(() => {
    if (!heldRef.current) showLatestReply();
  }, [isStreaming, lastReply?.id]);
  const continueFromFeedback = (check: LearningCheck) => {
    const answeredAt = messages.findIndex(
      (m) => m.check_attempt?.checkId === check.id
    );
    const prepared =
      isStreaming ||
      (!!lastReply && messages.indexOf(lastReply) > answeredAt);
    if (busy) return;
    if (prepared) {
      holdCheck(null);
      showLatestReply();
    } else {
      continuationRequested.current = true;
      holdCheck(check);
      onContinueCheck(check);
    }
  };
  useEffect(() => {
    if (!continuationRequested.current || busy) return;
    const answeredAt = messages.findIndex((m) => m.check_attempt?.checkId === reviewCheck?.id);
    if (lastReply && messages.indexOf(lastReply) > answeredAt) {
      continuationRequested.current = false;
      holdCheck(null);
      showLatestReply();
    } else if (continuationError) {
      continuationRequested.current = false;
      setActivity("check");
    }
  }, [busy, lastReply?.id, continuationError?.id]);
  useEffect(() => {
    if (activeMilestone?.id && lessonSteps.length)
      writeLessonProgress(
        activeMilestone.id,
        overview ? lessonSteps.length : visibleStep + 1,
        lessonSteps.length
      );
  }, [activeMilestone?.id, lessonSteps.length, visibleStep, overview]);
  const useReadingLayout =
    typeof window === "undefined" ? useEffect : useLayoutEffect;
  useReadingLayout(() => {
    // A focused activity always opens at its beginning; no conversation-length scroll.
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [
    activity,
    stepIndex,
    replyIndex,
    activeMilestone?.id,
    held ? null : lastReply?.id,
    reviewCheck?.id,
  ]);
  useEffect(() => {
    if (!historyOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = historyRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [historyOpen]);
  const goToQuestion = () => {
    if (latest) setActivity(checkEntry());
    else onRequestCheck();
  };
  const openVisualCompanion = () => {
    if ((availableVisual?.kind === "graph" || availableVisual?.kind === "state-model")) {
      if (latest && !attempt) recordVisualSupport(latest.id, "open-book:interactive-visual");
      setLessonVisual(!lastReply?.visual_example);
      setInlineVisualOpen(false);
      setActivity("visual");
    } else setInlineVisualOpen(v => !v);
  };
  const continueFromTeaching = () => {
    if (latest && attemptFor(latest)) onContinueCheck(latest);
    else goToQuestion();
  };
  const advanceLesson = () => {
    if (!overview && visibleStep < lessonSteps.length - 1) {
      const next = visibleStep + 1;
      setStepIndex(next);
      if (activeMilestone) saveLessonStep(activeMilestone.id, next);
    } else if (activeMilestone?.visual && preferences.visuals === "auto") {
      setLessonVisual(true);
      setActivity("visual");
    } else goToQuestion();
  };
  const stageLabel = busy && !held
    ? "Preparing the next step"
    : activity === "reference"
    ? "Read the reference"
    : activity === "check"
    ? reviewAttempt
      ? "Review your answer"
      : "Try this question"
    : activity === "visual"
    ? "Explore the idea"
    : activity === "lesson"
    ? `Explanation · ${
        overview
          ? "overview"
          : `step ${visibleStep + 1} of ${Math.max(1, lessonSteps.length)}`
      }`
    : `Coach · step ${replyStep + 1} of ${Math.max(1, replySteps.length)}`;
  const slideCount =
    activity === "lesson"
      ? overview
        ? 1
        : Math.max(1, lessonSteps.length)
      : activity === "reply"
      ? Math.max(1, replySteps.length)
      : activity === "visual"
      ? 1
      : reference
      ? 3
      : 2;
  const slideNumber =
    activity === "lesson"
      ? overview
        ? 1
        : visibleStep + 1
      : activity === "reply"
      ? replyStep + 1
      : activity === "visual" || activity === "reference"
      ? 1
      : reviewAttempt
      ? slideCount
      : reference
      ? 2
      : 1;
  return (
    <section
      className="lesson-pane workspace-panel unified-session focused-session"
      aria-label="Guided learning session"
    >
      <div className="session-toolbar">
        <span>
          <BookOpen size={15} />
          Learning session
        </span>
        {activeMilestone && evidence && (
          <MasteryMeter
            milestoneId={activeMilestone.id}
            independentCorrect={evidence.independentCorrect}
            readyToAdvance={evidence.readyToAdvance}
            approved={approved}
          />
        )}
        <div>
          <button
            onClick={() => setHistoryOpen(true)}
            title="Saved explanations and conversation"
          >
            <History size={14} />
            <span>Saved explanations</span>
          </button>
          {allowCoding && (
            <button
              onClick={onToggleCode}
              aria-pressed={isCodeWorkspaceOpen}
              title={
                isCodeWorkspaceOpen
                  ? "Hide coding practice"
                  : "Open coding practice"
              }
            >
              <Code2 size={14} />
              <span>
                {isCodeWorkspaceOpen ? "Hide code" : "Coding practice"}
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="session-activity-bar">
        <span>{stageLabel}</span>
        {slideCount > 1 && (!busy || held) && (
          <span
            className="slide-progress"
            aria-label={`Slide ${slideNumber} of ${slideCount}`}
          >
            {Array.from({ length: slideCount }, (_, i) => (
              <i
                key={i}
                className={
                  i === slideNumber - 1
                    ? "is-current"
                    : i < slideNumber - 1
                    ? "is-seen"
                    : ""
                }
              />
            ))}
            <small>
              {slideNumber} / {slideCount}
            </small>
          </span>
        )}
        <div>
          {!busy &&
            activity !== "check" &&
            activity !== "reference" &&
            latest && (
              <button onClick={goToQuestion}>
                {attempt ? "Review answer" : "Back to question"}
              </button>
            )}
          {!busy && activity !== "lesson" && lessonSteps.length > 0 && (
            <button
              title={
                activity === "check" && latest && !attempt
                  ? "Peek at explanation (marks this question as open-book practice)"
                  : undefined
              }
              onClick={() => {
                if (activity === "check" && latest && !attempt) {
                  recordVisualSupport(latest.id, "open-book:lesson");
                }
                setActivity("lesson");
              }}
            >
              Review explanation
            </button>
          )}
        </div>
      </div>
      <div className="session-flow" ref={scrollRef}>
        {(activity === "lesson" || activity === "reply" || !latest) && (
          <div className="lesson-heading">
            <div className="lesson-position">
              LESSON {milestoneIndex + 1} <span>OF {milestoneCount}</span>
            </div>
            <h1>
              {activeMilestone
                ? cleanMilestoneTitle(activeMilestone.title)
                : "Your learning session"}
            </h1>
          </div>
        )}
        <ReferenceShelf references={activeMilestone?.references} pendingCheckId={latest && !attempt ? latest.id : undefined} />
        {continuationError && (
          <div className="continuation-error" role="alert">
            <p>{reviewAttempt
              ? "Couldn’t prepare the next step. Your answer is saved. Try Continue again."
              : "Your coach couldn’t connect. Your message and draft are saved. Check your connection and try again."}</p>
            {onOpenSettings && <button type="button" className="check-coach-button" onClick={onOpenSettings}>Check AI connection</button>}
          </div>
        )}
        <div
          className="activity-slide"
          key={`${activity}:${stepIndex}:${replyIndex}:${
            activity === "check" ? reviewCheck?.id || "" : lastReply?.id || ""
          }`}
        >
          {activity === "lesson" && !busy && (
            <>
              {activeMilestone?.adaptation_reason && (
                <div className="adaptive-context">
                  <span>Let’s take a smaller step</span>
                  <p>
                    We’ll work through one idea, then return to where you left
                    off.
                  </p>
                  <details>
                    <summary>Why this step?</summary>
                    <MarkdownView
                      content={activeMilestone.adaptation_reason}
                      languageHint={language}
                    />
                  </details>
                </div>
              )}
              <div className="lesson-reading lesson-steps">
                {(overview ? lessonSteps : [lessonSteps[visibleStep]])
                  .filter(Boolean)
                  .map((step, i) => (
                    <div
                      className="lesson-step is-current"
                      key={`${activeMilestone?.id}:${
                        overview ? i : visibleStep
                      }`}
                    >
                      <MarkdownView
                        languageHint={language}
                        content={step}
                        onApplyCode={onApplyCodeToEditor}
                      />
                    </div>
                  ))}
              </div>
              {inlineVisualOpen && availableVisual && (
                <div className="session-inline-visual">
                  <div className="session-inline-visual-bar">
                    <span>Visual companion · {availableVisual.title}</span>
                    <div>
                      <button
                        type="button"
                        onClick={() => onQuickAction?.("visual")}
                        disabled={busy}
                      >
                        Fresh visual
                      </button>
                      <button
                        type="button"
                        onClick={() => setInlineVisualOpen(false)}
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                  <VisualExample
                    key={`inline-lesson:${activeMilestone?.id}:${lastReply?.id}`}
                    visual={availableVisual}
                    visualId={`inline-lesson:${activeMilestone?.id}:${lastReply?.id}`}
                    defaultOpen
                    supportCheckId={latest && !attempt ? latest.id : undefined}
                    onTryFreshCase={onRequestCheck}
                    isBusy={busy}
                  />
                </div>
              )}
              <div className="activity-continue">
                {!overview && visibleStep > 0 && (
                  <button
                    className="check-coach-button"
                    onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                  >
                    Previous step
                  </button>
                )}
                <button
                  className="dialog-primary-button"
                  onClick={advanceLesson}
                >
                  {!overview && visibleStep < lessonSteps.length - 1
                    ? "Continue"
                    : "Try this idea"}
                  <ArrowRight size={14} />
                </button>
              </div>
            </>
          )}
          {activity === "reference" && !busy && latest && (
            <div className="question-reference-slide">
              <p className="slide-reference-intro">
                Read this example. The question comes next.
              </p>
              <MarkdownView
                content={reference}
                languageHint={language}
                onApplyCode={onApplyCodeToEditor}
              />
              <div className="activity-continue">
                <button
                  className="dialog-primary-button"
                  onClick={() => {
                    seenReferences.current.add(latest.id);
                    setActivity("check");
                  }}
                >
                  Continue to question
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
          {activity === "check" && (!busy || held) && (
            <>
              <div className="check-context-pills">
                {latest && reference && !held && (
                  <button
                    className="slide-reference-button"
                    onClick={() => setActivity("reference")}
                  >
                    View reference
                  </button>
                )}
                {availableVisual && (
                  <button
                    type="button"
                    className="slide-reference-button"
                    aria-expanded={(availableVisual.kind === "graph" || availableVisual.kind === "state-model") ? undefined : inlineVisualOpen}
                    onClick={openVisualCompanion}
                  >
                    <Eye size={13} />
                    {inlineVisualOpen
                      ? "Hide visual aid"
                      : `Inspect visual: ${availableVisual.title}`}
                  </button>
                )}
              </div>
              {inlineVisualOpen && availableVisual && (
                <div className="session-inline-visual">
                  <div className="session-inline-visual-bar">
                    <span>Visual companion · {availableVisual.title}</span>
                    <div>
                      <button
                        type="button"
                        onClick={() => onQuickAction?.("visual")}
                        disabled={busy}
                      >
                        Fresh visual
                      </button>
                      <button
                        type="button"
                        onClick={() => setInlineVisualOpen(false)}
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                  <VisualExample
                    key={`inline:${activeMilestone?.id}:${lastReply?.id}`}
                    visual={availableVisual}
                    visualId={`inline:${activeMilestone?.id}:${lastReply?.id}`}
                    defaultOpen
                    supportCheckId={latest && !attempt ? latest.id : undefined}
                    onTryFreshCase={onRequestCheck}
                    isBusy={busy}
                  />
                </div>
              )}
              {reviewCheck ? (
                <QuestionCard
                  key={reviewCheck.id}
                  check={reviewCheck}
                  references={activeMilestone?.references}
                  onDispute={onDisputeCheck}
                  hideContext
                  attempt={reviewAttempt}
                  language={language}
                  isBusy={busy && !reviewAttempt}
                  assistedSoFar={
                    visualSupportFor(reviewCheck.id).length > 0
                  }
                  continuePending={busy}
                  onSubmit={onSubmitCheck}
                  onAskCoach={ask}
                  onClarify={() => onQuickAction?.("clarify")}
                  onNewQuestion={onRequestCheck}
                  onContinue={
                    reviewAttempt && !approved
                      ? () => continueFromFeedback(reviewCheck)
                      : undefined
                  }
                  continueLabel={
                    reviewAttempt && !reviewAttempt.correct
                      ? "Work through this"
                      : evidence?.readyToAdvance
                      ? "Review readiness"
                      : "Continue"
                  }
                  showActions={false}
                  showCoachLink={false}
                />
              ) : (
                <div className="lesson-start-check">
                  <p>Your response will guide what comes next.</p>
                  <button
                    className="dialog-primary-button"
                    onClick={onRequestCheck}
                  >
                    Start this lesson
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
          {activity === "visual" && !busy && visual && (
            <div className="focused-visual">
              <VisualExample
                key={`${
                  lessonVisual ? activeMilestone?.id : lastReply?.id
                }:visual`}
                visual={visual}
                visualId={`${
                  lessonVisual ? activeMilestone?.id : lastReply?.id
                }:visual`}
                defaultOpen
                supportCheckId={latest && !attempt ? latest.id : undefined}
                onTryFreshCase={onRequestCheck}
                isBusy={busy}
              />
              <div className="activity-continue">
                <button
                  className="dialog-primary-button"
                  onClick={continueFromTeaching}
                >
                  {attempt ? "Continue" : "Try the question"}
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
          {activity === "reply" && !busy && lastReply && (
            <article
              className="session-turn from-coach"
              data-response={lastReply.id}
            >
              {lastReply.competency_assessment && (
                <div className="readiness-review">
                  <strong>
                    {approved
                      ? "Ready for the next concept"
                      : "More practice will help"}
                  </strong>
                  <p>{lastReply.competency_assessment.rationale}</p>
                </div>
              )}
              {replySteps[replyStep] && (
                <MarkdownView
                  content={replySteps[replyStep]}
                  languageHint={language}
                  onApplyCode={onApplyCodeToEditor}
                />
              )}
              {!approved && (
                <div className="activity-continue">
                  {replyStep > 0 && (
                    <button
                      className="check-coach-button"
                      onClick={() => setReplyIndex((i) => i - 1)}
                    >
                      Previous step
                    </button>
                  )}
                  <button
                    className="dialog-primary-button"
                    onClick={() =>
                      replyStep < replySteps.length - 1
                        ? setReplyIndex((i) => i + 1)
                        : continueFromTeaching()
                    }
                  >
                    {replyStep < replySteps.length - 1
                      ? "Continue"
                      : latest && !attempt
                      ? "Try the question"
                      : "Continue"}
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </article>
          )}
          {busy && !held && (
            <article
              className="session-turn from-coach"
              data-response="streaming"
              aria-busy="true"
            >
              {hideLearningCheckBlocks(streamingContent || "").trim() ? (
                <MarkdownView
                  content={hideLearningCheckBlocks(streamingContent || "")}
                  languageHint={language}
                  onApplyCode={onApplyCodeToEditor}
                />
              ) : (
                <div className="session-skeleton" role="status">
                  <span className="session-skeleton-label">
                    <Loader2 size={13} className="animate-spin" />
                    {isRequestingCheck
                      ? "Preparing the next question…"
                      : "Preparing your next step…"}
                  </span>
                  <i className="sk-line sk-title" />
                  <i className="sk-line" />
                  <i className="sk-line" />
                  <i className="sk-line sk-short" />
                  <div className="sk-options" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              )}
            </article>
          )}
        </div>
        {approved && !busy && (
          <div className="session-next">
            <p>
              {onNextMilestone
                ? "You’ve applied this idea in more than one situation."
                : "You’ve reached the end of this track. Revisit a lesson or explore further."}
            </p>
            <div className="session-next-actions">
              {onNextMilestone && (
                <button
                  className="dialog-primary-button"
                  onClick={onNextMilestone}
                >
                  Continue to next lesson
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        )}
        {activity === "lesson" &&
          allowCoding &&
          activeMilestone?.starter_code.trim() && (
            <details className="lesson-code-practice">
              <summary>Optional coding practice</summary>
              <MarkdownView
                content={activeMilestone.prompt}
                languageHint={language}
              />
              <button
                className="derivation-generate-button"
                onClick={onOpenEditor}
              >
                <Code2 size={14} />
                Open code workspace
              </button>
            </details>
          )}
      </div>
      {btwState && (
        <aside className="btw-popover" role="status" aria-live="polite">
          <div className="btw-popover-header">
            <span className="btw-badge">/btw · Quick side question</span>
            <strong>{btwState.question}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss side question"
              onClick={() => setBtwState(null)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="btw-popover-body">
            {btwState.loading ? (
              <p className="btw-loading">
                <Loader2 size={13} className="animate-spin" /> Answering
                without leaving your current step…
              </p>
            ) : btwState.error ? (
              <p className="btw-error">{btwState.error}</p>
            ) : (
              <MarkdownView
                content={btwState.answer || ""}
                languageHint={language}
              />
            )}
          </div>
        </aside>
      )}
      <div className="session-composer" ref={composerRef}>
        <div className="session-composer-row">
          <div className="session-help-actions" aria-label="Get help">
          <button
            type="button"
            aria-pressed={btwMode}
            className={btwMode ? "is-active-btw" : undefined}
            onClick={() => {
              setBtwMode((v) => !v);
              ask();
            }}
            title="Ask a quick side question without leaving this step (/btw)"
          >
            <span>/btw</span>
          </button>
          <button
            disabled={busy}
            onClick={() => onQuickAction?.("hint")}
            title="Give me a hint"
          >
            <Lightbulb size={13} />
            <span>Hint</span>
          </button>
          <button
            disabled={busy}
            aria-pressed={inlineVisualOpen || activity === "visual"}
            onClick={() => {
              if (activity === "visual") {
                continueFromTeaching();
              } else if ((availableVisual?.kind === "graph" || availableVisual?.kind === "state-model")) {
                openVisualCompanion();
              } else if (
                availableVisual &&
                (activity === "check" || activity === "lesson")
              ) {
                setInlineVisualOpen((v) => !v);
              } else {
                onQuickAction?.("visual");
              }
            }}
            title={
              (availableVisual?.kind === "graph" || availableVisual?.kind === "state-model")
                ? "Explore the interactive visual in its own step"
                : availableVisual
                ? "Toggle inline visual companion alongside this step"
                : "Show me visually"
            }
          >
            <Eye size={13} />
            <span>Visual</span>
          </button>
          <button
            disabled={busy}
            onClick={() => onQuickAction?.("derivation")}
            title="Show the steps"
          >
            <ListTree size={13} />
            <span>Steps</span>
          </button>
        </div>
        <Composer
          key={`${trackId}:${activeMilestone?.id}`}
          draftKey={`learnforge:composer-draft:${trackId}:${activeMilestone?.id}`}
          compact
          codeIncluded={isCodeWorkspaceOpen}
          onSendMessage={handleComposerSend}
          isStreaming={isStreaming}
          onStopStreaming={onStopStreaming}
        />
        </div>
        <div
          className="session-telemetry-bar"
          aria-label="Session model, context, and token usage"
        >
          <button
            type="button"
            className="telemetry-model-pill"
            onClick={onOpenSettings}
            title={
              !aiStatus.ok && aiStatus.message
                ? `Last request failed: ${aiStatus.message}`
                : "Change AI provider or model in Settings"
            }
          >
            <i
              className={`telemetry-status-dot ${
                busy || btwState?.loading
                  ? "is-busy"
                  : aiStatus.ok
                  ? "is-ok"
                  : "is-error"
              }`}
              aria-hidden="true"
            />
            <strong>{aiConn.model}</strong>
            <span className="telemetry-provider">{providerLabel}</span>
            <ChevronDown size={11} className="telemetry-chevron" />
          </button>
          <div className="telemetry-metrics">
            <span
              className="telemetry-context"
              title={`About ${contextTokens.toLocaleString()} of ${contextWindow.toLocaleString()} tokens (${(
                contextRatio * 100
              ).toFixed(1)}%). Estimated from lesson and conversation length (characters ÷ 4); providers don't report per-request context.`}
            >
              <ContextRing used={contextTokens} total={contextWindow} />
              <span>
                <strong>{formatTok(contextTokens)}</strong>
                <em> / {formatTok(contextWindow)}</em>
              </span>
              <span className="telemetry-turns">
                · {turnCount} {turnCount === 1 ? "turn" : "turns"}
              </span>
            </span>
            <span
              className={`telemetry-tokens${tokensBumped ? " is-bumped" : ""}`}
              title={`${usage.prompt.toLocaleString()} in · ${usage.completion.toLocaleString()} out${
                usage.estimated ? " (partly estimated)" : ""
              }. Cumulative on this device; reset in Settings.`}
            >
              <span>
                <strong>
                  {usage.estimated ? "≈" : ""}
                  {formatTok(totalUsedTokens)}
                </strong>{" "}
                tokens
              </span>
              <span className="telemetry-split" aria-hidden="true">
                <i style={{ width: `${inShare}%` }} />
              </span>
            </span>
          </div>
        </div>
      </div>
      {historyOpen && (
        <dialog
          ref={historyRef}
          className="review-dialog session-history-dialog"
          aria-labelledby="session-history-title"
          onCancel={(e) => {
            e.preventDefault();
            setHistoryOpen(false);
          }}
        >
          <div className="review-surface">
            <header className="review-header">
              <div className="history-header-tabs">
                <h2 id="session-history-title">
                  Saved explanations & study sheet
                </h2>
                <div className="history-tab-group" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={historyTab === "timeline"}
                    onClick={() => setHistoryTab("timeline")}
                  >
                    Timeline
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={historyTab === "sheet"}
                    onClick={() => setHistoryTab("sheet")}
                  >
                    Study sheet & Anki
                  </button>
                </div>
              </div>
              <button
                className="icon-button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close session history"
              >
                <X size={18} />
              </button>
            </header>
            <div className="session-history-content">
              {historyTab === "sheet" ? (
                (() => {
                  const allMilestones =
                    milestones && milestones.length > 0
                      ? milestones
                      : activeMilestone
                      ? [activeMilestone]
                      : [];
                  const sheet = buildStudySheet(allMilestones, messages);
                  const sheetTitle =
                    activeMilestone?.title || trackId || "Learning Session";
                  return (
                    <div className="study-sheet-view">
                      <div className="study-sheet-actions">
                        <button
                          type="button"
                          className="check-coach-button"
                          onClick={() => {
                            const md = buildStudySheetMarkdown(
                              sheetTitle,
                              allMilestones,
                              messages
                            );
                            navigator.clipboard?.writeText(md);
                            setCopiedSheet(true);
                            setTimeout(() => setCopiedSheet(false), 1800);
                          }}
                        >
                          {copiedSheet ? "Copied Markdown!" : "Copy Markdown notes"}
                        </button>
                        <button
                          type="button"
                          className="check-coach-button"
                          onClick={() => {
                            const tsv = buildAnkiTsv(
                              sheetTitle,
                              allMilestones,
                              messages
                            );
                            const blob = new Blob([tsv], {
                              type: "text/tab-separated-values;charset=utf-8",
                            });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = `${trackId || "learnforge"}-anki.tsv`;
                            link.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Export Anki deck (.tsv)
                        </button>
                      </div>
                      <section className="study-sheet-section">
                        <h3>Core concepts</h3>
                        {sheet.concepts.map((c) => (
                          <div key={c.id} className="study-sheet-card">
                            <strong>
                              {c.title}{" "}
                              <small>
                                {c.status === "completed"
                                  ? "· Ready to move on"
                                  : "· In progress"}
                              </small>
                            </strong>
                            <MarkdownView
                              content={c.takeaway}
                              languageHint={language}
                            />
                          </div>
                        ))}
                      </section>
                      {sheet.repairedMistakes.length > 0 && (
                        <section className="study-sheet-section">
                          <h3>Answers to revisit</h3>
                          {sheet.repairedMistakes.map((m) => (
                            <div
                              key={m.id}
                              className="study-sheet-card is-repaired"
                            >
                              <strong>{m.question}</strong>
                              <p className="study-sheet-trap">
                                Initial trap: {m.chosenAnswer}
                              </p>
                              <p className="study-sheet-invariant">
                                Key invariant: <b>{m.correctAnswer}</b> —{" "}
                                {m.explanation}
                              </p>
                            </div>
                          ))}
                        </section>
                      )}
                      {(sheet.calibration.overconfidentTraps.length > 0 ||
                        sheet.calibration.underconfidentStrengths.length > 0 ||
                        sheet.calibration.calibratedMasteryCount > 0) && (
                        <section className="study-sheet-section">
                          <h3>Confidence calibration</h3>
                          <div className="study-sheet-card">
                            <p>
                              <b>Confident, independent answers:</b>{" "}
                              {sheet.calibration.calibratedMasteryCount}{" "}
                              confident, unassisted correct{" "}
                              {sheet.calibration.calibratedMasteryCount === 1
                                ? "check"
                                : "checks"}
                            </p>
                            {sheet.calibration.overconfidentTraps.map((trap) => (
                              <p
                                key={`trap-${trap.id}`}
                                className="study-sheet-trap"
                              >
                                Overconfident trap: <b>{trap.question}</b> (felt
                                confident on <em>{trap.chosenAnswer}</em>; actual:{" "}
                                <em>{trap.correctAnswer}</em>)
                              </p>
                            ))}
                            {sheet.calibration.underconfidentStrengths.map(
                              (item) => (
                                <p
                                  key={`strength-${item.id}`}
                                  className="study-sheet-invariant"
                                >
                                  Hidden strength: <b>{item.question}</b>{" "}
                                  (answered accurately despite uncertainty)
                                </p>
                              )
                            )}
                          </div>
                        </section>
                      )}
                      {sheet.verifiedChecks.length > 0 && (
                        <section className="study-sheet-section">
                          <h3>Correctly answered checks</h3>
                          {sheet.verifiedChecks.map((v) => (
                            <div key={v.id} className="study-sheet-card">
                              <strong>{v.question}</strong>
                              <p>
                                <b>{v.answer}</b> — {v.explanation}
                              </p>
                            </div>
                          ))}
                        </section>
                      )}
                    </div>
                  );
                })()
              ) : (
                <>
              {activeMilestone?.lesson && (
                <article className="session-turn">
                  <div className="session-speaker">Lesson explanation</div>
                  <MarkdownView
                    content={activeMilestone.lesson}
                    languageHint={language}
                  />
                </article>
              )}
              {activeMilestone?.visual && (
                <VisualExample
                  visual={activeMilestone.visual}
                  visualId={`${activeMilestone.id}:history-visual`}
                  defaultOpen={false}
                  supportCheckId={latest && !attempt ? latest.id : undefined}
                />
              )}
              {messages
                .filter((m) => m.role !== "system" && !m.internal)
                .map((m) => (
                  <article className="session-turn" key={m.id}>
                    <div className="session-speaker">
                      {m.role === "user" ? "You" : "LearnForge"}
                    </div>
                    <MarkdownView
                      content={hideLearningCheckBlocks(visibleText(m))}
                      languageHint={language}
                      onApplyCode={onApplyCodeToEditor}
                    />
                    {m.visual_example && (
                      <VisualExample
                        visual={m.visual_example}
                        visualId={`${m.id}:history`}
                        defaultOpen={false}
                        supportCheckId={
                          latest &&
                          !attempt &&
                          m.milestone_id === activeMilestone?.id
                            ? latest.id
                            : undefined
                        }
                      />
                    )}{" "}
                    {m.learning_check && (
                      <>
                        <MarkdownView
                          content={m.learning_check.question}
                          languageHint={language}
                        />
                        {m.learning_check.options.map((o) => (
                          <MarkdownView
                            key={o.id}
                            content={o.label}
                            languageHint={language}
                          />
                        ))}
                        {attemptFor(m.learning_check) && (
                          <MarkdownView
                            content={m.learning_check.explanation}
                            languageHint={language}
                          />
                        )}
                      </>
                    )}
                  </article>
                ))}
              {!messages.length && !activeMilestone?.lesson && (
                <p>Your explanations and answers will be saved here.</p>
              )}
                </>
              )}
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
};
