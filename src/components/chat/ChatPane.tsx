import { needsReferenceScreen } from "../learning/questionPresentation";
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
  MoreHorizontal,
  Route,
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
import { handleTabNavigation } from "../layout/keyboard";
import "./session-chrome.css";
import {
  hideLearningCheckBlocks,
  learningEvidence,
  starterLearningCheck,
} from "../../services/learning/checks";
import { approvedLessonIds } from "../../services/learning/adaptation";
import { nextTeachingStep } from "../../services/learning/teaching";
import {
  readLessonStep,
  saveLessonStep,
  splitLessonIntoActivities,
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
import { ReviewedQuestionCard, useQuestionReview } from "../learning/ReviewedQuestionCard";
import { AnswerTutoring } from "../learning/AnswerTutoring";
import { NarrationButton } from "../learning/NarrationButton";
import "../learning/question-focus.css";
import {
  answerTutoring,
  tutoringMatchesAttempt,
} from "../../services/learning/tutoring";
import { MasteryMeter } from "../learning/MasteryMeter";
import { SessionRouteStrip } from "../learning/SessionRouteStrip";
import { Composer } from "./Composer";
import { cleanMilestoneTitle } from "../milestones/MilestoneSidebar";
import {
  db,
  STORAGE_STATUS_EVENT,
  type StorageStatusDetail,
} from "../../services/db/storage";
import { HelpPaneDivider } from "./HelpPaneDivider";
import { DEFAULT_HELP_RATIOS, HELP_SPLIT_MIN_WIDTH, helpPaneWidth, readHelpRatios, saveHelpRatio } from "../../services/learning/helpLayout";
import { LearningHelpPanel } from "./LearningHelpPanel";
import type { HelpKind } from "../../services/learning/sessionHelp";
import { canRestorePosition, readSessionPosition, saveSessionPosition } from "../../services/learning/sessionPosition";
import "./learning-help.css";
import "./session-focus-layout.css";
import { estimatePromptTokens } from "../../services/ai/prompts";

interface ChatPaneProps {
  reviewQuestions?: boolean;
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
    action: "hint" | "explain" | "review" | "derivation" | "visual" | "clarify",
    contextNote?: string
  ) => void;
  onOpenEditor: () => void;
  onNextMilestone?: () => void;
  onOpenSettings?: () => void;
  language?: string;
  allowCoding?: boolean;
  onOpenPlan?: () => void;
  planLabel?: string;
  planTitle?: string;
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
  reviewQuestions = true,
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
  onOpenPlan,
  planLabel = "Learning plan",
  planTitle,
}) => {
  const preferences = useLearningPreferences();
  const SessionQuestionCard = reviewQuestions ? ReviewedQuestionCard : QuestionCard;
  const positionKey = `${trackId}:${activeMilestone?.id || "none"}`;
  const savedPosition = React.useMemo(() => readSessionPosition(positionKey), [positionKey]);
  const stageRef = useRef<HTMLDivElement>(null);
  const [narrowHelp, setNarrowHelp] = useState(false);
  const [stageWidth, setStageWidth] = useState(0);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [helpRatios, setHelpRatios] = useState(readHelpRatios);
  const helpPanelId = React.useId();
  const [helpOpen, setHelpOpen] = useState(savedPosition?.helpOpen || false);
  const [helpKind, setHelpKind] = useState<HelpKind>(savedPosition?.helpKind || "walkthrough");
  const helpOpener = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionMenu = useRef<HTMLDetailsElement>(null);
  const closeSessionMenu = () => {
    if (!sessionMenu.current) return;
    sessionMenu.current.open = false;
    sessionMenu.current.querySelector("summary")?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (sessionMenu.current?.open && !sessionMenu.current.contains(event.target as Node)) sessionMenu.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  const composerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDialogElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<"timeline" | "sheet">(
    "timeline"
  );
  const [copiedSheet, setCopiedSheet] = useState(false);
  const [copyingSheet, setCopyingSheet] = useState(false);
  const [copyError, setCopyError] = useState("");
  const copyReset = useRef<ReturnType<typeof setTimeout>>();
  useEffect(
    () => () => {
      if (copyReset.current) clearTimeout(copyReset.current);
    },
    []
  );
  const [btwMode, setBtwMode] = useState(false);
  const [aiConn, setAiConn] = useState(() => loadAIConnection());
  const [usage, setUsage] = useState(() => readUsage());
  const [aiStatus, setAiStatus] = useState<AIStatusDetail>({
    ok: true,
    message: "",
  });
  const [storageStatus, setStorageStatus] = useState<StorageStatusDetail>({
    persisted: true,
  });
  const [contextWindow, setContextWindow] = useState(() =>
    contextWindowFor(loadAIConnection().model)
  );

  useEffect(() => {
    setStorageStatus(db.getStorageStatus());
    const syncTelemetry = () => {
      const conn = loadAIConnection();
      setAiConn(conn);
      setUsage(readUsage());
      setContextWindow(contextWindowFor(conn.model));
      setAiStatus({ ok: true, message: "" });
    };
    const onStatus = (e: Event) =>
      setAiStatus((e as CustomEvent<AIStatusDetail>).detail);
    const onStorageStatus = (e: Event) =>
      setStorageStatus((e as CustomEvent<StorageStatusDetail>).detail);
    window.addEventListener(AI_CONNECTION_EVENT, syncTelemetry);
    window.addEventListener(AI_STATUS_EVENT, onStatus);
    window.addEventListener(STORAGE_STATUS_EVENT, onStorageStatus);
    return () => {
      window.removeEventListener(AI_CONNECTION_EVENT, syncTelemetry);
      window.removeEventListener(AI_STATUS_EVENT, onStatus);
      window.removeEventListener(STORAGE_STATUS_EVENT, onStorageStatus);
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
  const turnCount = messages.filter(
    (m) => m.role !== "system" && !m.internal
  ).length;
  const totalUsedTokens = usage.prompt + usage.completion;
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
      void askBtwQuestion(
        cleanQ,
        activeMilestone,
        latest || null,
        controller.signal
      )
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
    // A direct question intentionally leaves the feedback hold. /btw stays in place.
    holdCheck(null);
    continuationRequested.current = false;
    setActivity("reply");
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
    .find(
      (m) =>
        m.role === "assistant" &&
        !m.internal &&
        !m.tutoring_for_check_id &&
        !m.roadmap_change &&
        !m.generation_error &&
        !m.content.startsWith("**Your coach couldn’t connect.**")
    );
  const lastError = [...relevant]
    .reverse()
    .find(
      (m) =>
        m.generation_error ||
        m.content.startsWith("**Your coach couldn’t connect.**")
    );
  const continuationError =
    lastError &&
    !lastError.tutoring_for_check_id &&
    messages.indexOf(lastError) >
      messages.findIndex((m) => m.id === lastReply?.id)
      ? lastError
      : undefined;
  const starter = activeMilestone
    ? starterLearningCheck(trackId, activeMilestone, milestoneIndex)
    : null;
  const latest =
    [...relevant].reverse().find((m) => m.learning_check)?.learning_check ||
    starter;
  const contextTokens = React.useMemo(
    () => estimatePromptTokens(messages, activeMilestone, language, latest),
    [messages, activeMilestone, language, latest]
  );
  const attemptFor = (check: LearningCheck) =>
    messages.find((m) => m.check_attempt?.checkId === check.id)?.check_attempt;
  const attempt = latest ? attemptFor(latest) : undefined;
  pendingBtwCheck.current = latest && !attempt ? latest.id : null;
  const approved =
    !!activeMilestone && approvedLessonIds(messages).has(activeMilestone.id);
  const evidence = activeMilestone
    ? learningEvidence(messages, activeMilestone.id)
    : null;
  const teachingPlan = activeMilestone ? nextTeachingStep(messages, activeMilestone.id) : null;
  const lessonSteps = React.useMemo(
    () => splitLessonIntoActivities(activeMilestone?.lesson),
    [activeMilestone?.lesson]
  );
  const replySteps = React.useMemo(
    () =>
      splitLessonIntoActivities(hideLearningCheckBlocks(lastReply?.content || "")),
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
  // Short givens and guided cues belong beside the decision. Longer references keep a reading screen.
  const separateReference = needsReferenceScreen(reference) && latest?.practice !== "guided";
  const seenReferences = useRef(new Set<string>());
  const checkEntry = (): Activity =>
    latest && separateReference && !attempt && !seenReferences.current.has(latest.id)
      ? "reference"
      : "check";
  type Activity = "lesson" | "reference" | "check" | "reply" | "visual";
  const awaitingReview =
    !!attempt &&
    messages.findIndex((m) => m.check_attempt?.checkId === latest?.id) >
      messages.findIndex((m) => m.id === lastReply?.id);
  const entryActivity = (): Activity =>
    canRestorePosition(savedPosition, { hasLesson: lessonSteps.length > 0, hasVisual: !!activeMilestone?.visual || relevant.some(message => !!message.visual_example), replyId: lastReply?.id, questionId: latest?.id })
      ? savedPosition!.activity
      : awaitingReview
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
    savedPosition?.stepIndex ?? readLessonStep(activeMilestone?.id)
  );
  const [replyIndex, setReplyIndex] = useState(savedPosition?.replyIndex || 0);
  const [overview, setOverview] = useState(preferences.pace === "overview");
  const latestVisualMessage = [...relevant]
    .reverse()
    .find((m) => m.visual_example);
  const latestReplyVisual = latestVisualMessage?.visual_example;
  const [lessonVisual, setLessonVisual] = useState(!latestReplyVisual);
  const [inlineVisualOpen, setInlineVisualOpen] = useState(false);
  const [inlineLessonOpen, setInlineLessonOpen] = useState(false);
  const visibleStep = Math.min(stepIndex, Math.max(0, lessonSteps.length - 1));
  const replyStep = Math.min(replyIndex, Math.max(0, replySteps.length - 1));
  const visual =
    lessonVisual && !latestReplyVisual
      ? activeMilestone?.visual
      : latestReplyVisual || activeMilestone?.visual;
  const availableVisual = latestReplyVisual || activeMilestone?.visual;
  const busy = isStreaming || isRequestingCheck;
  const tutoringRequest = [...relevant]
    .reverse()
    .find((m) => m.role === "user");
  const tutoringBusy = isStreaming && !!tutoringRequest?.tutoring_for_check_id;
  const ask = () => composerRef.current?.querySelector("textarea")?.focus();
  const lastSeenReply = useRef(lastReply?.id);
  // After an answer, keep that question's feedback on screen (even while the
  // follow-up is generated in the background) until the learner continues.
  const [heldCheck, setHeldCheck] = useState<LearningCheck | null>(null);
  // Mirrors the hold synchronously so effects in the same commit see it.
  const heldRef = useRef(false);
  const continuationRequested = useRef(false);
  const continuationReplyBaseline = useRef<string>();
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
  const questionReviewState = useQuestionReview(reviewCheck || null, activeMilestone?.references, reviewQuestions && !reviewAttempt && !isStreaming);
  const teaching = reviewCheck
    ? answerTutoring(relevant, reviewCheck.id, reviewAttempt)
    : undefined;
  const tutoringFailed =
    !!reviewCheck &&
    relevant.some(
      (m) =>
        m.role === "assistant" &&
        m.tutoring_for_check_id === reviewCheck.id &&
        m.generation_error &&
        tutoringMatchesAttempt(m, reviewAttempt)
    );
  const held = !!heldCheck;
  const helpCheck = activity === "check" ? reviewCheck : latest;
  const helpAttempt = activity === "check" ? reviewAttempt : attempt;
  const helpContextKey = `${positionKey}:${activity}:${activity === "reply" ? `${lastReply?.id || ""}:${replyStep}` : activity === "lesson" ? visibleStep : helpCheck?.id || ""}:${helpAttempt?.submittedAt || "pending"}`;
  const [helpForKey, setHelpForKey] = useState(helpContextKey);
  const shownHelp = helpOpen && helpForKey === helpContextKey;
  const helpContext = activity === "reply" ? replySteps[replyStep] || lastReply?.content || ""
    : activity === "lesson" ? lessonSteps[visibleStep] || activeMilestone?.lesson || ""
    : `${helpCheck?.question || activeMilestone?.prompt || ""}\n${helpCheck?.context || ""}${helpAttempt ? `\nSubmitted answer: ${helpAttempt.response || helpCheck?.options.filter(option => helpAttempt.selectedIds.includes(option.id)).map(option => option.label).join("; ") || "I do not know"}\nReasoning: ${helpAttempt.thinking}\nCommitted feedback: ${helpCheck?.explanation || ""}` : ""}`;
  const openHelp = (kind: HelpKind, _note?: string) => {
    if (!shownHelp && typeof document !== "undefined") helpOpener.current = document.activeElement as HTMLElement;
    setHelpForKey(helpContextKey); setHelpKind(kind); setHelpOpen(true);
  };
  const closeRequested = useRef(false);
  const closeHelp = () => { closeRequested.current = true; setHelpOpen(false); setHelpExpanded(false); };
  useEffect(() => {
    if (!stageRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      setStageWidth(width); setNarrowHelp(width < HELP_SPLIT_MIN_WIDTH);
    });
    observer.observe(stageRef.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { scrollRef.current?.toggleAttribute("inert", shownHelp && (narrowHelp || helpExpanded)); }, [shownHelp, narrowHelp, helpExpanded]);
  useEffect(() => { if (!shownHelp && closeRequested.current) { closeRequested.current = false; (helpOpener.current || composerRef.current?.querySelector<HTMLElement>(`[data-help-kind="${helpKind}"]`))?.focus({ preventScroll: true }); } }, [shownHelp]);

  useEffect(() => {
    setHelpExpanded(false);
    setStepIndex(savedPosition?.stepIndex ?? readLessonStep(activeMilestone?.id));
    setReplyIndex(savedPosition?.replyIndex || 0);
    setHelpOpen(savedPosition?.helpOpen || false);
    setHelpKind(savedPosition?.helpKind || "walkthrough");
    setHelpForKey(helpContextKey);
    setOverview(preferences.pace === "overview");
    setLessonVisual(!lastReply?.visual_example);
    setInlineVisualOpen(false);
    setInlineLessonOpen(false);
    setActivity(entryActivity());
    holdCheck(null);
    continuationRequested.current = false;
    lastSeenReply.current = lastReply?.id;
  }, [activeMilestone?.id]);
  useEffect(() => {
    setInlineLessonOpen(false);
  }, [reviewCheck?.id]);
  useEffect(
    () => setOverview(preferences.pace === "overview"),
    [preferences.pace]
  );
  const showLatestReply = () => {
    if (isStreaming) {
      if (!tutoringBusy) setActivity("reply");
    } else if (lastReply?.id && lastReply.id !== lastSeenReply.current) {
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
    if (busy) return;
    // A side-question reply after the answer is not a prepared continuation.
    // The explicit practice action always requests its own fresh application.
    continuationRequested.current = true;
    continuationReplyBaseline.current = lastReply?.id;
    holdCheck(check);
    onContinueCheck(check);
  };
  useEffect(() => {
    if (!continuationRequested.current || busy) return;
    const answeredAt = messages.findIndex(
      (m) => m.check_attempt?.checkId === reviewCheck?.id
    );
    if (
      lastReply &&
      lastReply.id !== continuationReplyBaseline.current &&
      messages.indexOf(lastReply) > answeredAt
    ) {
      continuationRequested.current = false;
      holdCheck(null);
      showLatestReply();
    } else if (continuationError) {
      continuationRequested.current = false;
      setActivity("check");
    } else {
      // Stopped requests keep the existing answer/teaching available for another try.
      continuationRequested.current = false;
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
  const lastPositionKey = useRef(positionKey);
  const currentPosition = { activity, stepIndex, replyIndex, replyId: lastReply?.id, questionId: latest?.id, scrollTop: scrollRef.current?.scrollTop || 0, helpOpen: shownHelp, helpKind };
  useEffect(() => {
    if (lastPositionKey.current !== positionKey) { lastPositionKey.current = positionKey; return; }
    saveSessionPosition(positionKey, { ...currentPosition, scrollTop: scrollRef.current?.scrollTop || 0 });
  }, [positionKey, activity, stepIndex, replyIndex, lastReply?.id, latest?.id, shownHelp, helpKind]);
  const useReadingLayout =
    typeof window === "undefined" ? useEffect : useLayoutEffect;
  useReadingLayout(() => {
    // A focused activity always opens at its beginning; no conversation-length scroll.
    const restored = readSessionPosition(positionKey);
    const samePlace = restored?.activity === activity && restored.stepIndex === stepIndex && restored.replyIndex === replyIndex && (activity !== "reply" || restored.replyId === lastReply?.id) && (activity !== "check" || restored.questionId === reviewCheck?.id);
    scrollRef.current?.scrollTo({ top: samePlace ? restored.scrollTop : 0, behavior: "auto" });
  }, [
    activity,
    stepIndex,
    replyIndex,
    activeMilestone?.id,
    held ? null : lastReply?.id,
    reviewCheck?.id,
  ]);
  useEffect(() => {
    if (
      activity !== "check" ||
      reviewAttempt ||
      busy ||
      !reviewCheck ||
      shownHelp ||
      document.querySelector("dialog[open]")
    )
      return;
    const question =
      document.getElementById(`question-${reviewCheck.id}`) ||
      document.getElementById(`written-question-${reviewCheck.id}`);
    question?.focus({ preventScroll: true });
  }, [activity, reviewCheck?.id, busy]);
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
    if (
      availableVisual?.kind === "graph" ||
      availableVisual?.kind === "state-model"
    ) {
      if (latest && !attempt)
        recordVisualSupport(latest.id, "open-book:interactive-visual");
      setLessonVisual(!lastReply?.visual_example);
      setInlineVisualOpen(false);
      setActivity("visual");
    } else setInlineVisualOpen((v) => !v);
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
    } else goToQuestion();
  };
  const stageLabel =
    busy && !held
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
      : `Explanation · part ${replyStep + 1} of ${Math.max(1, replySteps.length)}`;
  const slideCount =
    activity === "lesson"
      ? overview
        ? 1
        : Math.max(1, lessonSteps.length)
      : activity === "reply"
      ? Math.max(1, replySteps.length)
      : activity === "visual"
      ? 1
      : separateReference
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
      : separateReference
      ? 2
      : 1;
  return (
    <section
      className="lesson-pane workspace-panel unified-session focused-session"
      data-help-open={shownHelp ? "true" : undefined}
      data-question-active={
        activity === "check" && !!reviewCheck && !reviewAttempt
          ? "true"
          : undefined
      }
      aria-label="Guided learning session"
    >
      <header className="session-toolbar session-focus-header">
        {onOpenPlan && <button type="button" className="session-plan-link" onClick={onOpenPlan} aria-label={`Open ${planLabel.toLowerCase()}`} title={planTitle || planLabel}>
          <Route size={16} aria-hidden="true" /><span>{planLabel}</span>
        </button>}
        <div className="session-focus-heading">
          <strong title={activeMilestone?.title}>{activeMilestone ? cleanMilestoneTitle(activeMilestone.title) : "Learning session"}</strong>
          <span className="session-focus-stage" aria-live="polite">{approved ? "Ready for the next concept" : stageLabel}
            {(activity === "lesson" || activity === "reply") && slideCount > 1 && (!busy || held) &&
              <small aria-label={`Step ${slideNumber} of ${slideCount}`}>{slideNumber} / {slideCount}</small>}
          </span>
        </div>
        <div className="session-focus-actions">
          {!busy && activity !== "check" && activity !== "reference" && latest && (
            <button onClick={goToQuestion}>{attempt ? "Review answer" : "Open question"}</button>
          )}
          {!busy && activity !== "lesson" && lessonSteps.length > 0 && (
            <button title={activity === "check" && !reviewAttempt ? "Show the lesson alongside this question; this counts as supported practice" : undefined}
              aria-label={activity === "check" && !reviewAttempt ? inlineLessonOpen ? "Hide explanation" : "Peek at explanation (switches to supported practice)" : undefined}
              onClick={() => {
                if (activity === "check" && reviewCheck && !reviewAttempt) {
                  if (!inlineLessonOpen && latest) recordVisualSupport(latest.id, "open-book:lesson");
                  setInlineLessonOpen(value => !value);
                } else setActivity("lesson");
              }} aria-expanded={activity === "check" && !reviewAttempt ? inlineLessonOpen : undefined}>
              {activity === "check" && !reviewAttempt ? inlineLessonOpen ? "Hide explanation" : "Peek at explanation" : "Review explanation"}</button>
          )}
          <details className="session-details" ref={sessionMenu} onKeyDown={event => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeSessionMenu(); }
          }}>
            <summary aria-label="Session details and tools" title="Session details and tools"><MoreHorizontal size={18} /></summary>
            <div className="session-details-panel">
              {planTitle && <p className="session-details-plan">{planTitle}</p>}
              {activeMilestone && evidence && <MasteryMeter milestoneId={activeMilestone.id} independentCorrect={evidence.independentCorrect} readyToAdvance={evidence.readyToAdvance} approved={approved} />}
              <SessionRouteStrip milestones={milestones} activeMilestone={activeMilestone} messages={messages} />
              <button onClick={() => { closeSessionMenu(); setHistoryOpen(true); }}><History size={14} /> Saved explanations</button>
              {allowCoding && <button aria-pressed={isCodeWorkspaceOpen} onClick={() => { closeSessionMenu(); onToggleCode(); }}>
                <Code2 size={14} />{isCodeWorkspaceOpen ? "Hide code" : "Coding practice"}
              </button>}
              {onOpenSettings && <button onClick={() => { closeSessionMenu(); onOpenSettings(); }}><ChevronDown size={14} /> AI connection</button>}
            </div>
          </details>
        </div>
      </header>
      <div className={`session-stage ${narrowHelp ? "is-narrow" : ""} ${shownHelp && helpExpanded ? "is-help-expanded" : ""}`} ref={stageRef}
        style={shownHelp && stageWidth ? {"--help-pane-width":`${helpPaneWidth(stageWidth,helpRatios[helpKind])}px`} as React.CSSProperties : undefined}>
      <div className="session-flow" ref={scrollRef} onScroll={() => saveSessionPosition(positionKey, { ...currentPosition, scrollTop: scrollRef.current?.scrollTop || 0 })}>
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
        <ReferenceShelf
          references={activeMilestone?.references}
          pendingCheckId={latest && !attempt ? latest.id : undefined}
        />
        {!storageStatus.persisted && (
          <div className="continuation-error" role="alert">
            <p>
              Local storage is full, so new progress is held in memory for this
              session only. Export your notes or remove unused topics in Manage
              Topics to free space.
            </p>
          </div>
        )}
        {continuationError && (
          <div className="continuation-error" role="alert">
            <p>
              {reviewAttempt
                ? "Couldn’t prepare the next step. Your answer is saved. Try Continue again."
                : "Your coach couldn’t connect. Your message and draft are saved. Check your connection and try again."}
            </p>
            {onOpenSettings && (
              <button
                type="button"
                className="check-coach-button"
                onClick={onOpenSettings}
              >
                Check AI connection
              </button>
            )}
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
                <div className="narration-reading-action"><NarrationButton
                  text={(overview ? lessonSteps : [lessonSteps[visibleStep]]).filter(Boolean).join("\n\n")}
                  label="Listen to lesson" onListen={() => { if (latest && !attempt) recordVisualSupport(latest.id, "open-book:lesson-audio"); }} /></div>
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
                    <span className="session-inline-visual-title">
                      <strong>{availableVisual.title}</strong>
                    </span>
                    <div>
                      <button
                        type="button"
                        onClick={() => setInlineVisualOpen(false)}
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                  <VisualExample
                    key={`inline-lesson:${activeMilestone?.id}:${latestVisualMessage?.id || "seed"}`}
                    visual={availableVisual}
                    visualId={`inline-lesson:${activeMilestone?.id}:${latestVisualMessage?.id || "seed"}`}
                    defaultOpen
                    embedded
                    language={language}
                    supportCheckId={latest && !attempt ? latest.id : undefined}
                    onTryFreshCase={onRequestCheck}
                    onRequestFreshVisual={
                      onQuickAction
                        ? () =>
                            openHelp("visual")
                        : undefined
                    }
                    onRepairVisual={
                      onQuickAction
                        ? (err) => openHelp("visual", err)
                        : undefined
                    }
                    isBusy={busy}
                  />
                </div>
              )}
              <div className="activity-continue">
                {(overview || visibleStep === lessonSteps.length - 1) &&
                  activeMilestone?.visual && preferences.visuals === "auto" && (
                    <button
                      className="check-coach-button"
                      onClick={() => {
                        setLessonVisual(true);
                        setActivity("visual");
                      }}
                    >
                      <Eye size={14} />
                      Explore the example
                    </button>
                  )}
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
                    : "Try a question"}
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
          {activity === "check" && (!busy || held || tutoringBusy) && (
            <>
              <div className="check-context-pills">
                {latest && reference && !held && reviewAttempt && (
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
                    aria-expanded={
                      availableVisual.kind === "graph" ||
                      availableVisual.kind === "state-model"
                        ? undefined
                        : inlineVisualOpen
                    }
                    onClick={openVisualCompanion}
                  >
                    <Eye size={13} />
                    {inlineVisualOpen
                      ? "Hide visual aid"
                      : `Inspect visual: ${availableVisual.title}`}
                  </button>
                )}
              </div>
              {inlineLessonOpen && !reviewAttempt && lessonSteps.length > 0 && (
                <aside
                  className="session-inline-lesson"
                  aria-label="Lesson explanation reference"
                >
                  <div className="session-inline-visual-bar">
                    <span>
                      Lesson explanation · Open-book (counts as supported
                      practice)
                    </span>
                    <div>
                      <button
                        type="button"
                        onClick={() => setInlineLessonOpen(false)}
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                  <div className="session-inline-lesson-body">
                    <MarkdownView
                      content={lessonSteps.join("\n\n")}
                      languageHint={language}
                      onApplyCode={onApplyCodeToEditor}
                    />
                  </div>
                </aside>
              )}
              {inlineVisualOpen && availableVisual && (
                <div className="session-inline-visual">
                  <div className="session-inline-visual-bar">
                    <span className="session-inline-visual-title">
                      <strong>{availableVisual.title}</strong>
                    </span>
                    <div>
                      <button
                        type="button"
                        onClick={() => setInlineVisualOpen(false)}
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                  <VisualExample
                    key={`inline:${activeMilestone?.id}:${latestVisualMessage?.id || "seed"}`}
                    visual={availableVisual}
                    visualId={`inline:${activeMilestone?.id}:${latestVisualMessage?.id || "seed"}`}
                    defaultOpen
                    embedded
                    language={language}
                    supportCheckId={latest && !attempt ? latest.id : undefined}
                    onTryFreshCase={onRequestCheck}
                    onRequestFreshVisual={
                      onQuickAction
                        ? () =>
                            openHelp("visual")
                        : undefined
                    }
                    onRepairVisual={
                      onQuickAction
                        ? (err) => openHelp("visual", err)
                        : undefined
                    }
                    isBusy={busy}
                  />
                </div>
              )}
              {reviewCheck ? (
                <SessionQuestionCard
                  key={reviewCheck.id}
                  check={reviewCheck}
                  {...(reviewQuestions ? { reviewState: questionReviewState, onReturn: lessonSteps.length ? () => { recordVisualSupport(reviewCheck.id, "open-book:lesson"); setActivity("lesson"); } : lastReply ? () => { recordVisualSupport(reviewCheck.id, "open-book:reply"); setActivity("reply"); } : undefined } : {})}
                  references={activeMilestone?.references}
                  onDispute={onDisputeCheck}
                  hideContext={!!reviewAttempt}
                  attempt={reviewAttempt}
                  language={language}
                  isBusy={busy && !reviewAttempt}
                  assistedSoFar={visualSupportFor(reviewCheck.id).length > 0}
                  continuePending={busy}
                  onSubmit={onSubmitCheck}
                  onAskCoach={ask}
                  onClarify={() => onQuickAction?.("clarify")}
                  onNewQuestion={onRequestCheck}
                  feedbackTeaching={
                    reviewAttempt && !approved ? (
                      <AnswerTutoring
                        key={reviewCheck.id}
                        check={reviewCheck}
                        teaching={teaching}
                        initialTogether={preferences.pace === "overview"}
                        loading={
                          tutoringBusy &&
                          tutoringRequest?.tutoring_for_check_id ===
                            reviewCheck.id
                        }
                        failed={tutoringFailed}
                        feedbackChanged={
                          reviewAttempt.grading?.reviewRequested === true
                        }
                        busy={busy}
                        language={language}
                        onRetry={() => onContinueCheck(reviewCheck)}
                        onContinue={() => continueFromFeedback(reviewCheck)}
                        onApplyCode={onApplyCodeToEditor}
                        continueLabel={teachingPlan?.label}
                        nextStepReason={teachingPlan?.reason}
                      />
                    ) : undefined
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
                  lessonVisual && !latestReplyVisual
                    ? activeMilestone?.id
                    : latestVisualMessage?.id || lastReply?.id
                }:visual`}
                visual={visual}
                visualId={`${
                  lessonVisual && !latestReplyVisual
                    ? activeMilestone?.id
                    : latestVisualMessage?.id || lastReply?.id
                }:visual`}
                defaultOpen
                language={language}
                supportCheckId={latest && !attempt ? latest.id : undefined}
                onTryFreshCase={onRequestCheck}
                onRequestFreshVisual={
                  onQuickAction
                    ? () =>
                        openHelp("visual")
                    : undefined
                }
                onRepairVisual={
                  onQuickAction
                    ? (err) => openHelp("visual", err)
                    : undefined
                }
                isBusy={busy}
              />
              {attempt && <div className="activity-continue">
                <button
                  className="dialog-primary-button"
                  onClick={continueFromTeaching}
                >
                  Continue
                  <ArrowRight size={14} />
                </button>
              </div>}
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
                <div className="narration-reading-action"><NarrationButton text={replySteps[replyStep]} label="Listen to explanation"
                  onListen={() => { if (latest && !attempt) recordVisualSupport(latest.id, "open-book:explanation-audio"); }} /></div>
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
          {busy && !held && !tutoringBusy && (
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
      {shownHelp && !narrowHelp && !helpExpanded && <HelpPaneDivider stage={stageRef} stageWidth={stageWidth} width={helpPaneWidth(stageWidth,helpRatios[helpKind])} controls={helpPanelId}
        onResize={(ratio,persist)=>{setHelpRatios(current=>({...current,[helpKind]:ratio}));if(persist)saveHelpRatio(helpKind,ratio);}}
        onReset={()=>{const ratio=DEFAULT_HELP_RATIOS[helpKind];setHelpRatios(current=>({...current,[helpKind]:ratio}));saveHelpRatio(helpKind,ratio);}}/>}
      <LearningHelpPanel panelId={helpPanelId} expanded={helpExpanded} onToggleExpanded={()=>setHelpExpanded(value=>!value)} key={`${helpContextKey}:${helpKind}`} open={shownHelp} kind={helpKind} contextKey={helpContextKey} context={helpContext}
        language={language}
        milestone={activeMilestone} check={helpCheck || null} answered={!!helpAttempt} existingVisual={activity === "lesson" || activity === "visual" ? availableVisual : undefined}
        narrow={narrowHelp} onClose={closeHelp} onKind={openHelp} onSupport={() => {
          if (helpCheck && !helpAttempt) recordVisualSupport(helpCheck.id, `help:${helpKind}:${helpContextKey}`);
        }}/>
      </div>
      {btwState && (
        <aside className="btw-popover" aria-label="Quick side question">
          <div className="btw-popover-header">
            <span className="btw-badge">/btw · Quick side question</span>
            <strong>{btwState.question}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss side question"
              onClick={() => {
                btwRequest.current?.abort();
                btwRequest.current = null;
                setBtwState(null);
                ask();
              }}
            >
              <X size={14} />
            </button>
          </div>
          <div className="btw-popover-body">
            {btwState.loading ? (
              <p className="btw-loading" role="status">
                <Loader2 size={13} className="animate-spin" /> Answering without
                leaving your current step…
              </p>
            ) : btwState.error ? (
              <div>
                <p className="btw-error" role="alert">
                  {btwState.error}
                </p>
                <button
                  type="button"
                  className="check-coach-button"
                  onClick={() =>
                    handleComposerSend(`/btw ${btwState.question}`)
                  }
                >
                  Retry side question
                </button>
              </div>
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
          <Composer
            key={`${trackId}:${activeMilestone?.id}`}
            draftKey={`learnforge:composer-draft:${trackId}:${activeMilestone?.id}`}
            compact
            collapsible
            sideQuestion={btwMode}
            codeIncluded={isCodeWorkspaceOpen}
            onSendMessage={handleComposerSend}
            isStreaming={isStreaming}
            onStopStreaming={onStopStreaming}
          />
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
              data-help-kind="hint"
              onClick={() => openHelp("hint")}
              aria-label="Hint"
              title="Give me a hint"
            >
              <Lightbulb size={13} />
              <span>Hint</span>
            </button>
            <button
              disabled={busy}
              aria-pressed={shownHelp && helpKind === "visual"}
              data-help-kind="visual"
              onClick={() => openHelp("visual")}
              aria-label="Visual"
              title="Open a visual alongside this activity"
            >
              <Eye size={13} />
              <span>Visual</span>
            </button>
            <button
              disabled={busy}
              data-help-kind="walkthrough"
              onClick={() => openHelp("walkthrough")}
              aria-label="Walkthrough"
              title="Open a walkthrough alongside this activity"
            >
              <ListTree size={13} />
              <span>Walkthrough</span>
            </button>
          </div>
          <div className="session-telemetry-bar" aria-label="AI model and usage">
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
            {(busy || btwState?.loading || !aiStatus.ok) && (
              <i
                className={`telemetry-status-dot ${
                  busy || btwState?.loading ? "is-busy" : "is-error"
                }`}
                aria-hidden="true"
              />
            )}
            <strong>{aiConn.model}</strong>
            <span className="telemetry-provider">
              {busy || btwState?.loading
                ? "Generating…"
                : !aiStatus.ok
                ? "Last request failed"
                : providerLabel}
            </span>
            <ChevronDown size={11} className="telemetry-chevron" />
          </button>
          <details
            className="session-usage-details"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.open = false;
                event.currentTarget
                  .querySelector<HTMLElement>("summary")
                  ?.focus();
              }
            }}
          >
            <summary>Usage details</summary>
            <div className="session-usage-panel">
              <dl>
                <div>
                  <dt>Estimated context</dt>
                  <dd>
                    {formatTok(contextTokens)} / {formatTok(contextWindow)}{" "}
                    tokens
                  </dd>
                </div>
                <div>
                  <dt>Conversation</dt>
                  <dd>
                    {turnCount} {turnCount === 1 ? "turn" : "turns"}
                  </dd>
                </div>
                <div>
                  <dt>Device usage total</dt>
                  <dd>
                    {usage.estimated ? "≈" : ""}
                    {formatTok(totalUsedTokens)} tokens
                  </dd>
                </div>
              </dl>
              <p>
                Context is estimated from the visible lesson and conversation;
                it is not a live provider measurement. Device usage is
                cumulative and can be reset in Settings.
              </p>
            </div>
          </details>
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
                <div
                  className="history-tab-group"
                  role="tablist"
                  aria-label="Saved session views"
                  onKeyDown={handleTabNavigation}
                >
                  <button
                    type="button"
                    role="tab"
                    id="history-timeline-tab"
                    aria-controls="history-timeline-panel"
                    tabIndex={historyTab === "timeline" ? 0 : -1}
                    aria-selected={historyTab === "timeline"}
                    onClick={() => setHistoryTab("timeline")}
                  >
                    Timeline
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="history-sheet-tab"
                    aria-controls="history-sheet-panel"
                    tabIndex={historyTab === "sheet" ? 0 : -1}
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
            <div
              className="session-history-content"
              role="tabpanel"
              id={
                historyTab === "sheet"
                  ? "history-sheet-panel"
                  : "history-timeline-panel"
              }
              aria-labelledby={
                historyTab === "sheet"
                  ? "history-sheet-tab"
                  : "history-timeline-tab"
              }
              tabIndex={0}
            >
              {historyTab === "sheet" ? (
                (() => {
                  const allMilestones =
                    milestones && milestones.length > 0
                      ? milestones
                      : activeMilestone
                      ? [activeMilestone]
                      : [];
                  const sheet = buildStudySheet(allMilestones, messages);
                  const readyIds = approvedLessonIds(messages);
                  const sheetTitle =
                    activeMilestone?.title || trackId || "Learning Session";
                  return (
                    <div className="study-sheet-view">
                      <div className="study-sheet-actions">
                        <button
                          type="button"
                          className="check-coach-button"
                          disabled={copyingSheet}
                          onClick={async () => {
                            setCopyingSheet(true);
                            setCopyError("");
                            setCopiedSheet(false);
                            try {
                              if (!navigator.clipboard?.writeText)
                                throw new Error("Clipboard unavailable");
                              await navigator.clipboard.writeText(
                                buildStudySheetMarkdown(
                                  sheetTitle,
                                  allMilestones,
                                  messages
                                )
                              );
                              setCopiedSheet(true);
                              if (copyReset.current)
                                clearTimeout(copyReset.current);
                              copyReset.current = setTimeout(
                                () => setCopiedSheet(false),
                                1800
                              );
                            } catch {
                              setCopyError(
                                "The notes could not be copied. Download Markdown instead."
                              );
                            } finally {
                              setCopyingSheet(false);
                            }
                          }}
                        >
                          {copyingSheet
                            ? "Copying…"
                            : copiedSheet
                            ? "Copied Markdown"
                            : "Copy Markdown notes"}
                        </button>
                        <button
                          type="button"
                          className="check-coach-button"
                          onClick={() => {
                            const md = buildStudySheetMarkdown(
                              sheetTitle,
                              allMilestones,
                              messages
                            );
                            const url = URL.createObjectURL(
                              new Blob([md], {
                                type: "text/markdown;charset=utf-8",
                              })
                            );
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = `LearnForge-${sheetTitle.replace(
                              /[^a-z0-9_-]+/gi,
                              "-"
                            )}.md`;
                            link.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                          }}
                        >
                          Download Markdown
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
                            link.download = `${
                              trackId || "learnforge"
                            }-anki.tsv`;
                            link.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Export Anki deck (.tsv)
                        </button>
                      </div>
                      {copyError && (
                        <p className="study-sheet-copy-error" role="alert">
                          {copyError}
                        </p>
                      )}
                      {copiedSheet && (
                        <p className="study-sheet-copy-status" role="status">
                          Markdown notes copied.
                        </p>
                      )}
                      <section className="study-sheet-section">
                        <h3>Core concepts</h3>
                        {sheet.concepts.map((c) => (
                          <div key={c.id} className="study-sheet-card">
                            <strong>
                              {c.title}{" "}
                              <small>
                                {readyIds.has(c.id)
                                  ? "· Readiness reviewed"
                                  : c.status === "completed"
                                  ? "· Past activity"
                                  : c.status === "active"
                                  ? "· In progress"
                                  : "· Not started"}
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
                                Your earlier answer: {m.chosenAnswer}
                              </p>
                              <p className="study-sheet-invariant">
                                Key idea: <b>{m.correctAnswer}</b> —{" "}
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
                            {sheet.calibration.overconfidentTraps.map(
                              (trap) => (
                                <p
                                  key={`trap-${trap.id}`}
                                  className="study-sheet-trap"
                                >
                                  Confident answer to revisit:{" "}
                                  <b>{trap.question}</b> (felt confident on{" "}
                                  <em>{trap.chosenAnswer}</em>; actual:{" "}
                                  <em>{trap.correctAnswer}</em>)
                                </p>
                              )
                            )}
                            {sheet.calibration.underconfidentStrengths.map(
                              (item) => (
                                <p
                                  key={`strength-${item.id}`}
                                  className="study-sheet-invariant"
                                >
                                  Correct despite uncertainty:{" "}
                                  <b>{item.question}</b> (answered accurately
                                  despite uncertainty)
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
                      supportCheckId={
                        latest && !attempt ? latest.id : undefined
                      }
                    />
                  )}
                  {messages
                    .filter((m) => m.role !== "system" && !m.internal)
                    .map((m) => (
                      <article className="session-turn" key={m.id}>
                        <div className="session-speaker">
                          {m.role === "user" ? "You" : "LearnForge"}
                        </div>
                        {m.tutoring_for_check_id &&
                        !tutoringMatchesAttempt(
                          m,
                          messages.find(
                            (message) =>
                              message.check_attempt?.checkId ===
                              m.tutoring_for_check_id
                          )?.check_attempt
                        ) ? (
                          <details>
                            <summary>
                              Earlier explanation · feedback has changed
                            </summary>
                            <MarkdownView
                              content={hideLearningCheckBlocks(visibleText(m))}
                              languageHint={language}
                              onApplyCode={onApplyCodeToEditor}
                            />
                          </details>
                        ) : (
                          <MarkdownView
                            content={hideLearningCheckBlocks(visibleText(m))}
                            languageHint={language}
                            onApplyCode={onApplyCodeToEditor}
                          />
                        )}
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
