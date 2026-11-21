import "./motion.css";
import "./components/layout/component-materials.css";
import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { Code2, BookOpen, Loader2 } from "lucide-react";
import { handleTabNavigation } from "./components/layout/keyboard";
import { Header } from "./components/layout/Header";
import {
  MilestoneSidebar,
  cleanMilestoneTitle,
} from "./components/milestones/MilestoneSidebar";
import { ChatPane } from "./components/chat/ChatPane";
import { KnowledgeWorkspace } from "./components/knowledge/KnowledgeWorkspace";
import {
  LEARNING_PREFERENCES_EVENT,
  recordVisualSupport,
  visualSupportFor,
} from "./services/learning/preferences";
import {
  recordDemonstratedConcept,
  removeMilestoneConcepts,
} from "./services/learning/conceptLedger";
const EditorPane = lazy(() =>
  import("./components/editor/EditorPane").then((module) => ({
    default: module.EditorPane,
  }))
);
import { ManageTopicsModal } from "./components/curriculum/ManageTopicsModal";
import { SettingsModal } from "./components/settings/SettingsModal";
import {
  hideCustomCanvasBlocks,
} from "./services/learning/visuals";
import { nextLearningMilestone } from "./services/learning/placement";
import { isAcceptedFreeResponseGrade } from "./services/learning/freeResponse";
import { RetentionFlow } from "./components/learning/RetentionFlow";
import { deleteTopicData } from "./services/learning/topicDeletion";
import { CurriculumWorkspace } from "./components/curriculum/CurriculumWorkspace";
import { PdfReadingCompanion } from "./components/reading/PdfReadingCompanion";
import { PdfBookRail } from "./components/reading/PdfBookRail";
import { deleteReadingData } from "./services/learning/readingStore";
import { deleteTrackProjects } from "./services/learning/projectStore";
import { allTrackWorkspaceKeys } from "./services/learning/project";
import { curriculumForTrack, hasProjectMode, planProjects } from "./services/learning/curriculumPlan";
import { cancelLocalRun, deleteLocalProject } from "./services/sandbox/local";
import { prepareCurriculumUnit } from "./services/ai/curriculumOutline";
import { NewTopicModal } from "./components/curriculum/NewTopicModal";
import { LearningStart } from "./components/curriculum/LearningStart";
import { openTrackSession } from "./services/learning/sessionLoader";
import { useCodeDrafts } from "./components/editor/useCodeDrafts";
import { useProjectWorkspace } from "./components/editor/useProjectWorkspace";
import { useTopics } from "./components/curriculum/useTopics";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { interpretAssistantReply, readinessCard } from "./services/learning/assistantReply";
import {
  LearningSession,
  ChatMessage,
  Milestone,
  SupportedLanguage,
  ExecutionResult,
  LearningCheck,
  CheckAttempt,
  LearningPractice,
} from "./types";
import { db, STORAGE_READY_EVENT } from "./services/db";
import { planAdaptiveRepair } from "./services/learning/planner";
import { answerTutoring, answerTutoringPrompt, tutoringAttemptKey } from "./services/learning/tutoring";
import { hasQuestionReview } from "./services/learning/questionReview";
import { nextTeachingStep, teachingContinuationPrompt } from "./services/learning/teaching";
import {
  approvedLessonIds,
  isLessonUnlocked,
} from "./services/learning/adaptation";
import {
  hideLearningCheckBlocks,
  gradeLearningCheck,
  learningEvidence,
  starterLearningCheck,
} from "./services/learning/checks";
import {
  streamSocraticChat,
  type CourseTrack,
} from "./services/ai";

export default function App() {
  const [retentionActive, setRetentionActive] = useState(false);
  // --- Curriculum Tracks State ---
  const { tracks, visibleTracks, removedTopicIds, addTopic, removeTopics } = useTopics();
  const [currentTrackId, setCurrentTrackId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("learnforge:active-track");
      if (saved && visibleTracks.some((track) => track.id === saved))
        return saved;
    } catch {}
    return visibleTracks[0]?.id || "";
  });
  const [workspaceView, setWorkspaceView] = useState<"session" | "curriculum" | "knowledge" | "reading">("session");
  const [readingPageRequest, setReadingPageRequest] = useState<{ page: number; to?: number; at: number }>();
  const [unitPreparation, setUnitPreparation] = useState<{ id: string; state: "loading" | "error" | "cancelled"; error?: string } | null>(null);
  const [preparationRetry, setPreparationRetry] = useState(0);
  const [diagnosticFor, setDiagnosticFor] = useState<string | null>(null);
  const unitController = useRef<AbortController | null>(null);
  const selectedTrack = tracks.find(t => t.id === currentTrackId);
  const [isNewTopicModalOpen, setIsNewTopicModalOpen] = useState(false);
  const [startGoal, setStartGoal] = useState<string>();
  const [startWithMaterial, setStartWithMaterial] = useState(false);
  const [isManageTopicsOpen, setIsManageTopicsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    "learning" | "connection" | "plugins"
  >("learning");

  // --- Session & Milestones State ---
  const [currentSession, setCurrentSession] = useState<LearningSession | null>(
    null
  );
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(
    null
  );

  // --- Chat State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // --- Code Editor & Execution State ---
  const [editorCode, setEditorCode] = useState<string>("");
  const [language, setLanguage] = useState<SupportedLanguage>("go");
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [isCodeWorkspaceOpen, setIsCodeWorkspaceOpen] = useState(false);
  const [isRequestingCheck, setIsRequestingCheck] = useState(false);
  const checkRequestId = useRef(0);
  const [executionResult, setExecutionResult] =
    useState<ExecutionResult | null>(null);

  // --- FSRS State ---
  const [dueCards, setDueCards] = useState(db.getDueCardsList());
  useEffect(() => {
    const refreshDue = () => setDueCards(db.getDueCardsList());
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshDue();
    };
    window.addEventListener("focus", refreshDue);
    window.addEventListener(LEARNING_PREFERENCES_EVENT, refreshDue);
    window.addEventListener(STORAGE_READY_EVENT, refreshDue);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refreshDue);
      window.removeEventListener(LEARNING_PREFERENCES_EVENT, refreshDue);
      window.removeEventListener(STORAGE_READY_EVENT, refreshDue);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // --- Sidebar Collapse State ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => window.innerWidth >= 1200
  );
  const [mobilePane, setMobilePane] = useState<"lesson" | "editor">("lesson");
  const [isCompactLayout, setIsCompactLayout] = useState(
    () => window.innerWidth < 1200
  );
  const codeDrafts = useCodeDrafts();
  const project = useProjectWorkspace(selectedTrack, activeMilestone);
  // Keep the principle the tutor names after a step passes (a "Principle:" line).
  useEffect(() => {
    if (!project.unitDone || !activeMilestone) return;
    const reply = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && !m.internal && m.milestone_id === activeMilestone.id && /(^|\n)\W*principle\W*:/i.test(m.content));
    const match = reply && /(?:^|\n)\W*principle\W*:\W*(.+)/i.exec(reply.content);
    if (match) project.recordPrinciple(match[1].replace(/[*_`]+/g, "").trim());
  }, [messages, project.unitDone, activeMilestone?.id]);
  // Once a step is being built, its project opens beside the lesson on wide
  // windows. Before that the lesson card says when to start. Closing it is
  // remembered per topic.
  useEffect(() => {
    if (!project.enabled || !project.started || workspaceView !== "session" || window.innerWidth < 1100) return;
    try {
      if (localStorage.getItem(`learnforge:project-closed:${currentTrackId}`) === "1") return;
    } catch {
      /* Preference only. */
    }
    setIsCodeWorkspaceOpen(true);
  }, [project.enabled, project.started, workspaceView, currentTrackId]);
  /** The last project run, trimmed, so the tutor can talk about real results. */
  const lastRunForTutor = (runOverride?: ExecutionResult | null) => {
    const run = runOverride !== undefined ? runOverride : executionResult;
    if (!project.enabled || !run) return "";
    const steps = run.stepRuns ?? [];
    const body = steps.length
      ? steps
          .map((s) => `Step ${s.number} (${s.label}): ${s.passed ? "passed" : s.timedOut ? "timed out" : "FAILED"}${s.passed ? "" : `\n${s.output.trim().slice(-1500)}`}`)
          .join("\n")
      : `exit code ${run.exitCode}\n${`${run.stdout}\n${run.stderr}`.trim().slice(-1500)}`;
    return `\n\n=== Last test run ===\n${body}`;
  };
  /** What the tutor sees of the learner's code: the whole project in project mode. */
  const codeForTutor = (runOverride?: ExecutionResult | null) =>
    project.enabled ? project.promptContext() + lastRunForTutor(runOverride) : !isCodeWorkspaceOpen ? "" : editorCode;
  const executionId = useRef(0);
  const milestoneIndex = Math.max(
    0,
    milestones.findIndex((m) => m.id === activeMilestone?.id)
  );
  const activeCheck = activeMilestone
    ? [...messages]
        .reverse()
        .find(
          (message) =>
            message.learning_check?.milestoneId === activeMilestone.id
        )?.learning_check ||
      starterLearningCheck(currentTrackId, activeMilestone, milestoneIndex)
    : null;

  // Lesson, editor and roadmap don't fit side by side below 1440px: the editor wins.
  useEffect(() => {
    if (isCodeWorkspaceOpen && window.innerWidth < 1440) setIsSidebarOpen(false);
  }, [isCodeWorkspaceOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1200px)");
    const collapseOnSmallScreen = () => {
      setIsCompactLayout(!desktop.matches);
      if (!desktop.matches) setIsSidebarOpen(false);
    };
    desktop.addEventListener("change", collapseOnSmallScreen);
    return () => desktop.removeEventListener("change", collapseOnSmallScreen);
  }, []);

  useEffect(() => {
    if (!isSidebarOpen || !isCompactLayout) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const sidebar = document.getElementById("learning-path");
    const main = document.getElementById("main-content");
    const header = document.querySelector<HTMLElement>(".app-header");
    if (main) main.inert = true;
    if (header) header.inert = true;
    sidebar?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setIsSidebarOpen(false);
      }
      if (e.key !== "Tab" || !sidebar) return;
      const focusables = Array.from(
        sidebar.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")
      );
      const first = focusables[0],
        last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      if (main) main.inert = false;
      if (header) header.inert = false;
      document.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [isSidebarOpen, isCompactLayout]);

  const handleChangeCode = (code: string) => {
    if (project.enabled) {
      project.updateActive(code);
      return;
    }
    setEditorCode(code);
    if (activeMilestone) codeDrafts.update(activeMilestone.id, code);
  };

  // Initialize or load session on track change
  useEffect(() => {
    const track = tracks.find((t) => t.id === currentTrackId);
    if (!track) {
      setCurrentSession(null);
      setMilestones([]);
      setActiveMilestone(null);
      setMessages([]);
      setEditorCode("");
      return;
    }
    const opened = openTrackSession(db, track, (sessionId) => {
      try {
        return localStorage.getItem(`learnforge:active-milestone:${sessionId}`);
      } catch {
        return null;
      }
    });
    const { session, activeMilestone: active } = opened;
    setCurrentSession(session);
    setLanguage(session.language || "go");
    if (!session.language) {
      setIsCodeWorkspaceOpen(false);
      setMobilePane("lesson");
    }
    setMilestones(opened.milestones);
    setActiveMilestone(active);
    if (active) {
      setEditorCode(codeDrafts.draftFor(active.id) ?? active.starter_code);
    }
    setMessages(opened.messages);
    // Return to where the learner was in this topic: reading, the plan, or the lesson.
    try {
      const saved = localStorage.getItem(`learnforge:workspace-view:${track.id}`);
      if (saved === "reading" && track.curriculum?.sourceDocument) setWorkspaceView("reading");
      else if (saved === "curriculum" && track.curriculum) setWorkspaceView("curriculum");
    } catch {}
  }, [currentTrackId, tracks]);

  // Declared after the loader above so it reads the saved view before this
  // effect records the view of the current render.
  useEffect(() => {
    if (!currentTrackId || workspaceView === "knowledge") return;
    try {
      localStorage.setItem(`learnforge:workspace-view:${currentTrackId}`, workspaceView);
    } catch {}
  }, [workspaceView, currentTrackId]);

  // Handle new custom track created dynamically by AI
  const handleTrackCreated = (newTrack: CourseTrack) => {
    // Persist the approved outline before committing the UI. Save errors leave review open.
    addTopic(newTrack);

    handleSelectTrack(newTrack.id);
    if (newTrack.curriculum) setWorkspaceView("curriculum");
  };

  // Handle Track Selection
  const handleSelectTrack = (trackId: string) => {
    if (trackId === currentTrackId) return;
    handleStopStreaming();
    void cancelLocalRun();
    codeDrafts.persist();
    executionId.current += 1;
    setExecutionResult(null);
    setIsRunningCode(false);
    setCurrentTrackId(trackId);
    setWorkspaceView("session");
    setReadingPageRequest(undefined);
    setDiagnosticFor(null);
    setUnitPreparation(null);
    setMobilePane("lesson");
    try {
      localStorage.setItem("learnforge:active-track", trackId);
    } catch {}
  };

  const handleDeleteTopics = async (ids: string[]) => {
    const deleting = new Set(ids);
    if (deleting.has(currentTrackId)) { handleStopStreaming(); void cancelLocalRun(); setWorkspaceView("curriculum"); }
    // Await removal of original PDFs and bookmarks before reporting permanent deletion.
    for (const id of ids) if (tracks.find(t=>t.id===id)?.curriculum?.sourceDocument) await deleteReadingData(id);
    for (const id of ids) {
      const track = tracks.find((t) => t.id === id);
      const plan = track ? curriculumForTrack(track) : undefined;
      if (!track || (plan && hasProjectMode(plan))) {
        const keys = plan ? allTrackWorkspaceKeys(id, planProjects(plan)) : [id];
        await deleteTrackProjects(id, keys);
        await Promise.all(keys.map((k) => deleteLocalProject(k).catch(() => {})));
      }
    }
    const erased = ids.flatMap((id) =>
      deleteTopicData(db, tracks.find((t) => t.id === id) || { id, title: "" })
    );
    codeDrafts.forget(erased);
    const stillVisible = removeTopics(deleting);
    if (deleting.has(currentTrackId)) {
      handleSelectTrack(stillVisible[0]?.id || "");
      setIsCodeWorkspaceOpen(false);
    }
    setDueCards(db.getDueCardsList());
  };

  const handleSelectMilestone = (m: Milestone) => {
    if (m.id === activeMilestone?.id) { setWorkspaceView("session"); return; }
    if (
      m.id === activeMilestone?.id ||
      !isLessonUnlocked(m, milestones, approvedLessonIds(messages))
    )
      return;
    handleStopStreaming();
    void cancelLocalRun();
    codeDrafts.persist();
    setWorkspaceView("session");
    setDiagnosticFor(null);
    setActiveMilestone(m);
    executionId.current += 1;
    setIsRunningCode(false);
    setEditorCode(codeDrafts.draftFor(m.id) ?? m.starter_code);
    setExecutionResult(null);
    setMobilePane("lesson");
    if (window.innerWidth < 1200) setIsSidebarOpen(false);
    try {
      localStorage.setItem(`learnforge:active-milestone:${m.session_id}`, m.id);
    } catch {}
  };

  // Send Message (Never-Locked Composer)
  const handleSendMessage = async (
    userText: string,
    options?: {
      history?: ChatMessage[];
      internal?: boolean;
      adapt?: boolean;
      visual?: boolean;
      scientificFigure?: boolean;
      teachOnly?: boolean;
      independent?: boolean;
      practice?: LearningPractice;
      answerTutoringFor?: string;
      tutoringAttemptKey?: string;
      /** Instruction sent to the AI for this turn instead of the visible text. */
      prompt?: string;
      /** Fresh execution result to include immediately before React commits state. */
      runResult?: ExecutionResult;
    }
  ) => {
    if (!currentSession || isStreamingRef.current) return;

    // Add user message. In project mode the full project files are sent live to
    // the tutor without duplicating the entire repository onto every stored turn.
    const userMsg = db.addMessage({
      session_id: currentSession.id,
      role: "user",
      content: userText,
      milestone_id: activeMilestone?.id,
      internal: options?.internal,
      tutoring_for_check_id: options?.answerTutoringFor,
      tutoring_attempt_key: options?.tutoringAttemptKey,
      code_snippet: !project.enabled && isCodeWorkspaceOpen && editorCode.trim() ? editorCode : undefined,
    });

    const updatedMessages = [...(options?.history || messagesRef.current), userMsg];
    messagesRef.current = updatedMessages;
    setMessages(updatedMessages);

    // Setup streaming
    const controller = new AbortController();
    abortControllerRef.current = controller;
    isStreamingRef.current = true;
    setIsStreaming(true);
    setStreamingContent("");

    let accumulated = "";
    let plannerDecidedStay = false;

    try {
      if (options?.adapt && activeMilestone) {
        let plannerFailed = false;
        const proposal = await planAdaptiveRepair(
          activeMilestone,
          activeCheck,
          updatedMessages,
          milestones,
          controller.signal
        ).catch((error) => {
          if (controller.signal.aborted) throw error;
          plannerFailed = true;
          return null;
        });
        if (controller.signal.aborted) return;
        if (proposal) {
          const repair = db.addRepairMilestone(activeMilestone.id, proposal);
          if (repair) {
            const note = db.addMessage({
              session_id: currentSession.id,
              role: "assistant",
              milestone_id: repair.id,
              content: `I added **${repair.title}** because ${proposal.reason}`,
              roadmap_change: {
                addedMilestoneId: repair.id,
                returnToMilestoneId: activeMilestone.id,
                reason: proposal.reason,
                triggerCheckId: proposal.triggerCheckId,
              },
            });
            setMessages((previous) => [...previous, note]);
            codeDrafts.persist();
            setMilestones(db.getMilestones(currentSession.id));
            setActiveMilestone(repair);
            setEditorCode("");
            isStreamingRef.current = false;
            setIsStreaming(false);
            setStreamingContent("");
            setMobilePane("lesson");
            try {
              localStorage.setItem(
                `learnforge:active-milestone:${currentSession.id}`,
                repair.id
              );
            } catch {}
            return;
          }
        }
        if (!plannerFailed) {
          plannerDecidedStay = true;
        }
      }
      const effectivePrompt = plannerDecidedStay
        ? `${
            options?.prompt ?? userMsg.content
          }\n\nRoadmap check complete: stay on the current concept (do NOT emit forge-repair) and include ONE simpler, fresh applied question in a forge-check JSON block.`
        : options?.prompt;
      await streamSocraticChat(
        effectivePrompt
          ? [
              ...updatedMessages.slice(0, -1),
              { ...userMsg, content: effectivePrompt },
            ]
          : updatedMessages,
        activeMilestone || undefined,
        codeForTutor(options?.runResult),
        {
          activeCheck: activeCheck || undefined,
          language: currentSession.language,
          abortSignal: controller.signal,
          onChunk: (chunk) => {
            if (controller.signal.aborted) return;
            accumulated += chunk;
            setStreamingContent(options?.scientificFigure ? hideCustomCanvasBlocks(accumulated) : accumulated);
          },
          onComplete: (fullText) => {
            if (controller.signal.aborted) return;
            isStreamingRef.current = false;
            setIsStreaming(false);
            setStreamingContent("");

            const reply = interpretAssistantReply(fullText, options || {}, {
              activeMilestone,
              milestones,
              history: updatedMessages,
              language: currentSession.language,
              plannerDecidedStay,
            });
            const { acceptedReview, repairProposal, learningCheck, challenge } = reply;
            const repair = repairProposal
              ? db.addRepairMilestone(activeMilestone!.id, repairProposal)
              : null;
            // Save the structured question with its message so it survives navigation.
            const botMsg = db.addMessage({
              session_id: currentSession.id,
              role: "assistant",
              tutoring_for_check_id: options?.answerTutoringFor,
              tutoring_attempt_key: options?.tutoringAttemptKey,
              generation_error: reply.generationError || undefined,
              content: reply.content,
              visual_example: reply.visual,
              visual_requested: options?.visual,
              learning_check: learningCheck,
              milestone_id: repair?.id || activeMilestone?.id,
              competency_assessment: acceptedReview,
              roadmap_change:
                repair && repairProposal
                  ? {
                      addedMilestoneId: repair.id,
                      returnToMilestoneId: activeMilestone!.id,
                      reason: repairProposal.reason,
                      triggerCheckId: repairProposal.triggerCheckId,
                    }
                  : undefined,
            });
            setMessages((previous) => [...previous, botMsg]);
            if (acceptedReview?.decision === "ready" && activeMilestone) {
              db.updateMilestoneStatus(activeMilestone.id, "completed");
              setMilestones(db.getMilestones(currentSession.id));
              setActiveMilestone({ ...activeMilestone, status: "completed" });
              recordDemonstratedConcept({
                title: cleanMilestoneTitle(activeMilestone.title),
                outcome: activeMilestone.prompt || activeMilestone.title,
                trackId: currentSession.track_id || currentTrackId,
                trackTitle: currentSession.title,
                milestoneId: activeMilestone.id,
                language: currentSession.language,
                source: "readiness",
              });
              try {
                if (
                  !db
                    .getAllCards()
                    .some((c) => c.milestone_id === activeMilestone.id)
                ) {
                  db.createCard({
                    session_id: currentSession.id,
                    milestone_id: activeMilestone.id,
                    topic: `${currentSession.title}: ${activeMilestone.title}`,
                    ...readinessCard(activeMilestone, activeCheck),
                  });
                  setDueCards(db.getDueCardsList());
                }
              } catch {}
            }
            if (repair) {
              setMilestones(db.getMilestones(currentSession.id));
              setActiveMilestone(repair);
              setEditorCode("");
              codeDrafts.persist();
              try {
                localStorage.setItem(
                  `learnforge:active-milestone:${currentSession.id}`,
                  repair.id
                );
              } catch {}
            }

            if (learningCheck) setMobilePane("lesson");

            // If AI introduced a new challenge, update editor & milestone
            if (challenge) {
              const newM = db.createMilestone({
                session_id: currentSession.id,
                title: challenge.title,
                prompt: challenge.prompt,
                starter_code: challenge.starter_code,
                solution_code: challenge.solution_code,
                test_code: challenge.test_code,
                prerequisite_ids: activeMilestone?.status === "completed" ? [activeMilestone.id] : [],
                status: "active",
              });
              setMilestones(db.getMilestones(currentSession.id));
              setActiveMilestone(newM);
              setEditorCode(challenge.starter_code);
              try {
                localStorage.setItem(
                  `learnforge:active-milestone:${currentSession.id}`,
                  newM.id
                );
              } catch {}
            }
          },
          onError: (err) => {
            if (controller.signal.aborted) return;
            isStreamingRef.current = false;
            setIsStreaming(false);
            setStreamingContent("");
            if (err.name !== "AbortError" && !controller.signal.aborted) {
              const errorMsg = db.addMessage({
                session_id: currentSession.id,
                role: "assistant",
                generation_error: true,
                tutoring_for_check_id: options?.answerTutoringFor,
                tutoring_attempt_key: options?.tutoringAttemptKey,
                milestone_id: activeMilestone?.id,
                content: `**Your coach couldn’t connect.** Check your AI provider in **Settings** (⚙ in the top bar), then try your message again. Your answers and drafts are saved.\n\nConnection details: ${err.message}`,
              });
              setMessages((previous) => [...previous, errorMsg]);
            }
          },
        }
      );
    } catch (err: any) {
      if (controller.signal.aborted) return;
      isStreamingRef.current = false;
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  const handleSubmitCheck = (check: LearningCheck, attempt: CheckAttempt) => {
    if (
      !currentSession ||
      isStreaming ||
      check.id !== activeCheck?.id ||
      check.milestoneId !== activeMilestone?.id ||
      !hasQuestionReview(check, attempt, activeMilestone?.references) ||
      messages.some((message) => message.check_attempt?.checkId === check.id)
    )
      return;
    const presentedIndex = messages.findIndex(
      (message) => message.learning_check?.id === check.id
    );
    const visualSupportIds = visualSupportFor(check.id);
    const assisted =
      check.practice === "guided" ||
      Boolean(attempt.assisted) ||
      Boolean(attempt.retriedOptionIds?.length) ||
      visualSupportIds.length > 0 ||
      messages
        .slice(presentedIndex + 1)
        .some(
          (message) =>
            message.role === "user" &&
            !message.internal &&
            !message.check_attempt &&
            message.milestone_id === check.milestoneId
        );
    const result = {
      ...attempt,
      practice: check.practice,
      assisted,
      visualSupportIds,
      correct: attempt.revealed
        ? false
        : check.kind === "free-response"
        ? !attempt.dontKnow && !!attempt.response?.trim() && isAcceptedFreeResponseGrade(check, attempt.grading)
        : gradeLearningCheck(check, attempt.selectedIds, attempt.dontKnow),
    };
    const selected = result.response || check.options
      .filter((option) => result.selectedIds.includes(option.id))
      .map((option) => option.label)
      .join("; ");
    const answerMessage = db.addMessage({
      session_id: currentSession.id,
      role: "user",
      milestone_id: check.milestoneId,
      check_attempt: result,
      content: `Knowledge check: ${check.question}\n\nMy answer: ${
        result.dontKnow ? "I don’t know yet." : selected
      }\nResult: ${result.correct ? "Correct" : "Needs review"}${
        result.thinking ? `\nMy thinking: ${result.thinking}` : ""
      }${
        result.confidence ? `\nConfidence: ${result.confidence}` : ""
      }\nHelp used on this question: ${assisted ? "yes" : "no"}`,
    });
    // Preserve the answer while a separate teaching turn is prepared automatically.
    const history = [...messages, answerMessage];
    setMessages(history);
    startAnswerTutoring(check, result, history);
  };

  const handleDisputeCheck = (check: LearningCheck) => {
    if (!currentSession || check.id !== activeCheck?.id) return;
    if (isStreaming) handleStopStreaming();
    if (!db.disputeCheckAttempt(currentSession.id, check.id)) return;
    if (activeMilestone?.status === "completed") {
      db.updateMilestoneStatus(activeMilestone.id, "active");
      db.deleteCardsForMilestone(activeMilestone.id);
      removeMilestoneConcepts(activeMilestone.id);
      setDueCards(db.getDueCardsList());
      setActiveMilestone({ ...activeMilestone, status: "active" });
      setMilestones(db.getMilestones(currentSession.id));
    }
    setMessages([...db.getMessages(currentSession.id)]);
  };

  const handleContinueCheck = (check: LearningCheck) => {
    if (
      !currentSession ||
      isStreaming ||
      check.id !== activeCheck?.id ||
      check.milestoneId !== activeMilestone?.id
    )
      return;
    const result = messages.find(
      (message) => message.check_attempt?.checkId === check.id
    )?.check_attempt;
    if (!result) return;
    if (!answerTutoring(messages, check.id, result)) {
      startAnswerTutoring(check, result, messages);
      return;
    }
    startFollowUp(check, messages);
  };

  const startAnswerTutoring = (check: LearningCheck, result: CheckAttempt, history: ChatMessage[]) => {
    void handleSendMessage("Work through my submitted answer.", {
      history, internal: true, teachOnly: true, answerTutoringFor: check.id,
      tutoringAttemptKey: tutoringAttemptKey(result),
      prompt: answerTutoringPrompt(check, result),
    });
  };

  const startFollowUp = (
    check: LearningCheck,
    history: ChatMessage[]
  ) => {
    const plan = nextTeachingStep(history, check.milestoneId);
    void handleSendMessage(
      teachingContinuationPrompt(plan),
      {
        history,
        internal: true,
        adapt: plan.allowRepair,
        independent: plan.practice !== "guided",
        practice: plan.practice,
      }
    );
  };

  const handleRequestCheck = async () => {
    if (isStreaming || !activeMilestone) return;
    const requestId = ++checkRequestId.current;
    setIsRequestingCheck(true);
    setMobilePane("lesson");
    try {
      const plan = nextTeachingStep(messages, activeMilestone.id);
      const practice: LearningPractice = learningEvidence(messages, activeMilestone.id).independentCorrect > 0
        ? "transfer" : "independent";
      await handleSendMessage(
        plan.stage === "review" &&
          !approvedLessonIds(messages).has(activeMilestone.id)
          ? plan.instruction
          : `Ask ONE fresh applied choice or free-response knowledge check for the current lesson using a forge-check JSON block. ${practice === "transfer" ? "Change a relevant condition or context while testing the same principle; do not merely rename the previous case or change its numbers." : "Use a different case from the previous examples and questions at the current conceptual difficulty."} For a choice check, use plausible, even-length options with stable ids. For free-response, commit an expected answer and 1–5 concrete rubric criteria. Commit the answer and explanation, and keep both hidden until I submit. Do not teach the solution first or emit forge-visual; this is a chance to try without scaffolding.`,
        { internal: true, independent: true, practice }
      );
    } finally {
      if (requestId === checkRequestId.current) setIsRequestingCheck(false);
    }
  };

  // Start building the project step: the tutor leads the learner in, so the
  // project is part of the conversation rather than a separate panel.
  const handleStartProject = async () => {
    if (isStreaming || !project.stage || !project.step) return;
    project.startStep();
    setIsCodeWorkspaceOpen(true);
    try {
      localStorage.setItem(`learnforge:project-closed:${currentTrackId}`, "0");
    } catch {
      /* Preference only. */
    }
    const part = project.part;
    const parts = part && part.total > 1 ? ` This chapter's build comes in ${part.total} small parts (${part.outline.map((t, i) => `${i + 1}. ${t}`).join("; ")}); we start with part ${part.n}.` : "";
    await handleSendMessage(`Let’s build step ${project.stepNumber}: ${project.step}`, {
      prompt: `I'm starting step ${project.stepNumber} of the course project now ("${project.step}").${parts} The current part's task and my current project files are in the code context. Lead me into it as my tutor, conversationally, in under 170 words, like the start of a chapter in a good build-along book:
1. In one or two sentences, connect this unit's idea to what I'm about to build and why it matters in a real system${parts ? ", and name the parts we'll go through so I can see where the chapter is heading" : ""}.
2. Tell me which file to open first and the first small thing to do there — a direction, not code. Mention the exact function or type names the tests expect.
3. Ask me ONE short question about my plan (for example which data structure or what happens on a duplicate key) that I can answer here before or while I code.
4. Say I can press Run tests any time for feedback, and ask you anything here while I work.
Do not write the implementation or show solution code. Do not emit forge-check or forge-visual blocks.`,
    });
  };

  // Ask the tutor about the last failing project run.
  const handleAskAboutRun = async () => {
    if (isStreaming || !executionResult) return;
    setMobilePane("lesson");
    await handleSendMessage("Why isn’t my code passing yet?", {
      prompt: `I ran the tests and they don't all pass. The results and my files are in the code context. As my tutor: point to the FIRST failure, explain in plain words what the test expected and what my code did instead, and connect it to the idea behind this step. Then give ONE hint or ask ONE guiding question that helps me find the fix myself. Reference the file and line if you can. Do not write the corrected code. Keep it under 150 words.`,
    });
  };

  // "Compress it": explain the unit's core idea in at most two sentences. A
  // short, complete explanation is evidence of having the idea's structure.
  const handleRequestCompress = async () => {
    if (isStreaming || !activeMilestone) return;
    const requestId = ++checkRequestId.current;
    setIsRequestingCheck(true);
    setMobilePane("lesson");
    try {
      await handleSendMessage(
        `Ask ONE free-response knowledge check using a forge-check JSON block: the learner explains the core idea of the current lesson in at most two sentences, in plain words, as if to a colleague who hasn't studied it. Commit an expected answer of at most two sentences and 3–4 rubric criteria: (1) names the central mechanism or idea, (2) says why it matters or the trade-off it creates, (3) is complete in two sentences without padding, (4) uses no unexplained jargon. Keep the answer and explanation hidden until I submit. Do not teach first.`,
        { internal: true, independent: true, practice: "independent" }
      );
    } finally {
      if (requestId === checkRequestId.current) setIsRequestingCheck(false);
    }
  };

  // Stop Streaming
  const handleStopStreaming = () => {
    unitController.current?.abort();
    checkRequestId.current += 1;
    setIsRequestingCheck(false);
    const wasStreaming = isStreamingRef.current;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamingRef.current = false;
    setIsStreaming(false);
    const tutoringRequest = wasStreaming ? [...messagesRef.current].reverse().find((m) => m.role === "user") : undefined;
    if ((streamingContent.trim() || tutoringRequest?.tutoring_for_check_id) && currentSession) {
      const partialMsg = db.addMessage({
        session_id: currentSession.id,
        role: "assistant",
        milestone_id: activeMilestone?.id,
        tutoring_for_check_id: tutoringRequest?.tutoring_for_check_id,
        tutoring_attempt_key: tutoringRequest?.tutoring_attempt_key,
        generation_error:
          tutoringRequest?.tutoring_for_check_id || tutoringRequest?.internal
            ? true
            : undefined,
        content:
          hideLearningCheckBlocks(streamingContent) +
          "\n\n*(Generation stopped)*",
      });
      setMessages((prev) => [...prev, partialMsg]);
      setStreamingContent("");
    }
  };

  // Quick Action Chips
  const handleQuickAction = (
    action: "hint" | "explain" | "review" | "derivation" | "visual" | "clarify",
    contextNote?: string
  ) => {
    switch (action) {
      case "visual": {
        const forceLiveSim = contextNote === "__LIVE_SIM__";
        const repairError = contextNote && !forceLiveSim && contextNote !== "__PAPER_FIGURE__"
          ? contextNote : undefined;
        const previousVisual = [...messages].reverse().find(
          (message) => message.visual_example && message.milestone_id === activeMilestone?.id
        )?.visual_example ?? activeMilestone?.visual;
        const redrawContext = previousVisual ? JSON.stringify({
          title: previousVisual.title,
          summary: previousVisual.summary,
          notes: previousVisual.items,
          takeaway: previousVisual.takeaway,
        }) : undefined;
        handleSendMessage(
          repairError ? "Replace the broken visual with a clear figure."
            : forceLiveSim ? "Show me an interactive simulation."
            : previousVisual ? "Redraw this idea as a typeset figure."
            : "Show me a clear teaching figure.",
          {
            visual: true,
            scientificFigure: !forceLiveSim,
            teachOnly: true,
            prompt: `${repairError
              ? `The previous model failed with: ${JSON.stringify(repairError.slice(0, 200))}. Replace it using an app-owned scientific figure when possible. `
              : ""}${forceLiveSim
              ? 'Use a custom canvas only if the concept needs continuous simulation that the owned graph/explorer/state-model cannot express. Keep its controls functional, responsive and visually restrained. '
              : 'Use kind="state-model" with stateModel.presentation={"style":"scientific","layout":"lanes"} (or "comparison" to compare the initial and current state). The app owns the SVG drawing, typography and controls. Do not generate HTML, CSS, canvas drawing code, decorative cards or a second application. Use 2–6 meaningful states and real branching actions when a contrasting choice clarifies the idea. Author state-specific relations using existing entity IDs so arrows and values change with the mechanism. For a genuinely quantitative curve, owned graph/explorer is also appropriate. '}
            Preserve the current learner subject and level. Explain one mechanism using familiar labels and one concrete analogous example. Use backticks for real code tokens and $LaTeX$ only for genuine mathematical notation; do not dress ordinary programming or language concepts in invented formulas. Include a short caption describing what changes and why. These are illustrative authored states, not a recorded program execution or a guarantee of competence. Never reveal a pending check answer, emit forge-check, replace the question or assess readiness. ${redrawContext ? `Redraw the concept described by this saved visual; its wording may need simplification or correction: ${redrawContext}` : ""}`,
          }
        );
        break;
      }
      case "clarify":
        handleSendMessage("Can you clarify the question?", {
          teachOnly: true,
          prompt:
            "Rephrase the current unanswered question in plain language. Define unfamiliar words and explain what is being asked without giving away which answer is correct. Keep the existing question, objective and options; do not emit a new forge-check or assess readiness.",
        });
        break;
      case "hint":
        handleSendMessage("Can I have a hint?", {
          prompt:
            "Give me a Socratic hint for the current challenge without giving away the full answer.",
        });
        break;
      case "explain":
        handleSendMessage("Can you explain this idea?", {
          prompt:
            "Explain the idea behind this lesson in plain language, using one small example from my learning goal.",
        });
        break;
      case "review":
        handleSendMessage("Can you review my code?", {
          prompt:
            "Review my current code in the editor. What invariants or edge cases should I consider?",
        });
        break;
      case "derivation":
        handleSendMessage("Show me the steps.", {
          prompt:
            "Walk through the core concept of this specific challenge step by step. Use one concrete example from the learner’s actual subject and goal, explaining unfamiliar terms. For language learning, use a short phrase or exchange with its meaning. Do not introduce code unless it serves the stated learning goal. Use the ```ladder markdown format when a state diagram would clarify the explanation; do not substitute an unrelated example.",
        });
        break;
    }
  };

  // Run Code in Browser Sandbox
  const handleRunCode = async () => {
    if (isRunningCode || !currentSession?.language) return;
    const runId = ++executionId.current;
    setIsRunningCode(true);
    if (project.enabled) {
      try {
        const run = await project.run();
        if (runId !== executionId.current) return;
        setExecutionResult(run.result);
        if (run.stageJustPassed && !isStreamingRef.current && !run.unitDone && run.part)
          // A part of the chapter's build passed: like a book's next section,
          // say what works now and motivate the next part from the code.
          void handleSendMessage(
            `Part ${run.part.n} of ${run.part.total}${run.part.title ? ` ("${run.part.title}")` : ""} of this chapter's project build passes, along with every earlier test. In under 140 words, as my tutor: (1) say concretely what the project can do now that it couldn't before; (2) introduce the next part${run.next?.title ? `, "${run.next.title}",` : ""} the way a good build-along book does — point to a real limitation or risk in my current code that it will fix (for example "notice what happens to our data if the process restarts"); (3) ask me ONE short question about that limitation. The next part's task is being prepared and will appear in the project panel. Do not write code. Do not emit forge-check or forge-visual blocks.`,
            { internal: true, runResult: run.result }
          );
        else if (run.stageJustPassed && !isStreamingRef.current)
          void handleSendMessage(
            `All project tests pass for ${run.part && run.part.total > 1 ? `every part of this chapter's build (${run.part.total} parts)` : `step ${run.stageNumber}`} and every earlier step. Review the learner's implementation in the project files against this unit's ideas: name one thing the design does well and one trade-off or failure mode the tests do not cover. Then, on its own line, name the reusable idea this step taught, starting exactly "Principle:" (one sentence about the general idea, not this code), and say which later chapters or steps of the course will use it again. ${run.predictions?.made ? `Before running, the learner predicted the outcome ${run.predictions.made} time(s) and was right ${run.predictions.matched} time(s)${run.prediction?.why ? `; their last reason was: "${run.prediction.why.replace(/"/g, "'")}"` : ""}. If a prediction was wrong, briefly address the misunderstanding it shows. ` : ""}Finish by checking understanding with one applied question. Passing tests alone does not approve readiness.`,
            { internal: true, runResult: run.result }
          );
      } catch (err: any) {
        if (runId !== executionId.current) return;
        setExecutionResult({ stdout: "", stderr: err?.message || "Execution error occurred", exitCode: 1, durationMs: 0, error: err?.message });
      } finally {
        if (runId === executionId.current) setIsRunningCode(false);
      }
      return;
    }
    try {
      const { executeCode } = await import("./services/sandbox");
      const res = await executeCode(
        language,
        editorCode,
        activeMilestone?.test_code
      );
      if (runId !== executionId.current) return;
      setExecutionResult(res);

      // Check if all tests passed
      if (res.testResults && res.testResults.length > 0) {
        const allPassed = res.testResults.every((t) => t.passed);
        if (allPassed && res.exitCode === 0 && !res.error) {
          if (!isStreamingRef.current)
            void handleSendMessage(
              "The optional coding tests passed. Explain what that establishes and check the remaining conceptual understanding with one applied question. Passing tests alone does not approve readiness.",
              { internal: true }
            );
        }
      }
    } catch (err: any) {
      if (runId !== executionId.current) return;
      setExecutionResult({
        stdout: "",
        stderr: err?.message || "Execution error occurred",
        exitCode: 1,
        durationMs: 0,
        error: err?.message,
      });
    } finally {
      if (runId === executionId.current) setIsRunningCode(false);
    }
  };

  // Reset Code to starter
  const handleResetCode = () => {
    if (project.enabled) {
      project.resetActive();
      setExecutionResult(null);
      return;
    }
    if (activeMilestone) {
      handleChangeCode(activeMilestone.starter_code);
      setExecutionResult(null);
    }
  };

  // Export Notes
  const handleExportNotes = () => {
    if (!currentSession) return;
    const md = db.exportSessionMarkdown(currentSession.id);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `LearnForge-${currentSession.title.replace(
      /\s+/g,
      "_"
    )}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const nextMilestone = nextLearningMilestone(
    milestones, activeMilestone?.id || "", approvedLessonIds(messages)
  );

  const handleNextMilestone = () => {
    if (
      !currentSession ||
      !activeMilestone ||
      activeMilestone.status !== "completed" ||
      !nextMilestone ||
      !approvedLessonIds(messages).has(activeMilestone.id) ||
      !isLessonUnlocked(nextMilestone, milestones, approvedLessonIds(messages))
    )
      return;
    const all = db.getMilestones(currentSession.id);
    const currentIndex = all.findIndex((m) => m.id === activeMilestone.id);
    if (currentIndex >= 0) {
      const nextM = nextMilestone;
      if (nextM.status === "pending") {
        db.updateMilestoneStatus(nextM.id, "active");
      }
      const updated = db.getMilestones(currentSession.id);
      setMilestones(updated);
      handleSelectMilestone(updated.find((m) => m.id === nextM.id) || nextM);

      // Create an FSRS spaced repetition card for this completed concept (if not already minted)
      try {
        if (
          !db.getAllCards().some((c) => c.milestone_id === activeMilestone.id)
        ) {
          db.createCard({
            session_id: currentSession.id,
            milestone_id: activeMilestone.id,
            topic: `${currentSession.title}: ${activeMilestone.title}`,
            prompt: activeCheck
              ? [activeCheck.context, activeCheck.question]
                  .filter(Boolean)
                  .join("\n\n")
              : `What did you learn about ${activeMilestone.title}?`,
            answer: activeCheck
              ? activeCheck.expectedAnswer || [
                  ...activeCheck.options
                    .filter((option) =>
                      activeCheck.correctOptionIds.includes(option.id)
                    )
                    .map((option) => option.label),
                  activeCheck.explanation,
                ].join("\n\n")
              : activeMilestone.lesson,
            target_code:
              currentSession.language && !activeCheck
                ? editorCode ||
                  activeMilestone.solution_code ||
                  activeMilestone.starter_code
                : undefined,
          });
          setDueCards(db.getDueCardsList());
        }
      } catch (err) {
        console.warn("Could not save FSRS card:", err);
      }

      // Welcome message from Coach into the next milestone
      const coachMsg = db.addMessage({
        session_id: currentSession.id,
        role: "assistant",
        milestone_id: nextM.id,
        content: `You completed **${activeMilestone.title}**. Next: **${nextM.title}**. Open the lesson to check your understanding, or ask me about the concept.`,
      });
      setMessages((prev) => [...prev, coachMsg]);
    }
  };

  useEffect(() => {
    if (workspaceView !== "session" || !selectedTrack?.curriculum || !activeMilestone || activeMilestone.content_status !== "outline") return;
    const controller = new AbortController(); unitController.current = controller;
    const runtimeId = activeMilestone.id, sessionId = activeMilestone.session_id;
    const templateId = activeMilestone.curriculum_unit_id;
    if (!templateId) return;
    setUnitPreparation({id:runtimeId,state:"loading"});
    let timeout = false;
    const timer = setTimeout(() => { timeout=true; controller.abort(); }, 240000);
    void prepareCurriculumUnit(selectedTrack, templateId, controller.signal).then(content => {
      if (controller.signal.aborted || !db.getSession(sessionId)) return;
      const prepared = db.prepareMilestone(runtimeId, {lesson:content.lesson,check:content.check,visual:content.visual,
        starter_code:content.starter_code,test_code:content.test_code,references:content.references});
      if (!prepared) return;
      setMilestones(db.getMilestones(sessionId));
      setActiveMilestone(current => current?.id===runtimeId?prepared:current);
      setEditorCode(codeDrafts.draftFor(runtimeId) ?? prepared.starter_code);
      setUnitPreparation(null);
    }).catch(error => {
      if (!controller.signal.aborted || timeout) setUnitPreparation({id:runtimeId,state:"error",
        error:timeout?"Preparation took longer than expected. Your approved plan is safe; try again.":"This lesson could not be prepared. Your approved path is saved. Try again, or check your AI connection in Settings."});
    }).finally(() => clearTimeout(timer));
    return () => {clearTimeout(timer);controller.abort();if(unitController.current===controller)unitController.current=null;};
  }, [workspaceView, selectedTrack?.id, activeMilestone?.id, activeMilestone?.content_status, preparationRetry]);

  // A readiness challenge goes to an available foundation and uses fresh evidence;
  // it never marks the future unit or its prerequisites completed.
  useEffect(() => {
    if (!diagnosticFor || workspaceView!=="session" || activeMilestone?.id!==diagnosticFor ||
        activeMilestone.content_status==="outline" || isStreaming) return;
    setDiagnosticFor(null);
    void handleRequestCheck();
  }, [diagnosticFor, workspaceView, activeMilestone?.id, activeMilestone?.content_status, isStreaming]);

  const requestedLessons = useRef(new Set<string>());
  useEffect(() => {
    if (
      diagnosticFor || workspaceView !== "session" || activeMilestone?.content_status === "outline" ||
      !activeMilestone ||
      !currentSession ||
      activeMilestone.session_id !== currentSession.id ||
      isStreaming ||
      activeMilestone.lesson?.trim()
    )
      return;
    const lastAttempt = [...messages]
      .reverse()
      .find(
        (message) => message.check_attempt?.milestoneId === activeMilestone.id
      )?.check_attempt;
    // Returning to saved feedback must never start a follow-up automatically.
    if (lastAttempt) return;
    if (
      activeCheck &&
      !messages.some(
        (message) => message.check_attempt?.checkId === activeCheck.id
      )
    )
      return;
    if (approvedLessonIds(messages).has(activeMilestone.id)) return;
    const key = `${activeMilestone.id}:initial`;
    if (requestedLessons.current.has(key)) return;
    requestedLessons.current.add(key);
    void handleRequestCheck();
  }, [activeMilestone?.id, activeCheck?.id, isStreaming, currentSession?.id, workspaceView]);

  return (
    <div className="app-shell">
      <a className="app-skip-link" href="#main-content" onClick={() => document.getElementById("main-content")?.focus()}>Skip to learning workspace</a>
      <Header
        knowledgeVisible={workspaceView === "knowledge"}
        onOpenKnowledge={() => {
          if (activeCheck && !messages.some(m => m.check_attempt?.checkId === activeCheck.id)) recordVisualSupport(activeCheck.id, "knowledge:material");
          handleStopStreaming(); unitController.current?.abort(); setWorkspaceView(workspaceView === "knowledge" ? "session" : "knowledge"); setIsSidebarOpen(false);
        }}
        curriculumVisible={selectedTrack?.curriculum ? workspaceView === "curriculum" : undefined}
        currentTrackId={currentTrackId}
        onSelectTrack={handleSelectTrack}
        tracks={visibleTracks.map((t) => ({
          id: t.id,
          title: t.title,
          language: t.language,
        }))}
        onManageTopics={() => {
          setIsSidebarOpen((open) => (isCompactLayout ? false : open));
          setIsManageTopicsOpen(true);
        }}
        onExportNotes={handleExportNotes}
        onOpenSettings={() => {
          setSettingsSection("learning");
          setIsSettingsOpen(true);
        }}
        onToggleSidebar={() => {
          if (currentSession && selectedTrack?.curriculum) {
            handleStopStreaming();
            setWorkspaceView(v=>v==="curriculum"?"session":"curriculum");
            setIsSidebarOpen(false);
          } else if (currentSession) setIsSidebarOpen((v) => !v);
        }}
        isSidebarOpen={isSidebarOpen}
        onOpenNewTopic={() => {
          setStartGoal(undefined);
          setStartWithMaterial(false);
          setIsSidebarOpen((open) => (isCompactLayout ? false : open));
          setIsNewTopicModalOpen(true);
        }}
      />
      <div className="app-body">
        {selectedTrack?.curriculum?.sourceDocument && workspaceView !== "knowledge" && !(workspaceView === "session" && isCodeWorkspaceOpen) && <PdfBookRail key={selectedTrack.id} trackId={selectedTrack.id} source={selectedTrack.curriculum.sourceDocument} lessonPage={workspaceView==="session"?activeMilestone?.references?.find(r=>r.pdfPageStart)?.pdfPageStart:undefined} onRead={()=>{setReadingPageRequest(undefined);setWorkspaceView("reading");}} onChoosePage={page=>{setReadingPageRequest({page,at:Date.now()});setWorkspaceView("reading");}}/>}
        {isSidebarOpen && currentSession && workspaceView === "session" && !selectedTrack?.curriculum && (
          <>
            <button
              className="sidebar-backdrop"
              aria-label="Close learning path"
              onClick={() => setIsSidebarOpen(false)}
            />
            <MilestoneSidebar
              milestones={milestones}
              messages={messages}
              activeMilestoneId={activeMilestone?.id}
              onSelectMilestone={handleSelectMilestone}
              onClose={() => setIsSidebarOpen(false)}
            />
          </>
        )}
        <main className="main-workspace" id="main-content" tabIndex={-1}>
          <ErrorBoundary resetKey={`${currentTrackId}:${workspaceView}:${activeMilestone?.id || ""}`}>
          {workspaceView === "knowledge" ? <KnowledgeWorkspace tracks={visibleTracks} initialTrackId={currentTrackId} database={db} pendingQuestion={!!activeCheck && !messages.some(m => m.check_attempt?.checkId === activeCheck.id)} onReturn={() => setWorkspaceView("session")} onOpenTopic={id => { handleSelectTrack(id); setWorkspaceView("session"); }} /> : !currentSession ? (
            <LearningStart
              onStart={(goal, material) => {
                setStartGoal(goal);
                setStartWithMaterial(!!material);
                setIsNewTopicModalOpen(true);
              }}
              onManageRemoved={removedTopicIds.length ? () => setIsManageTopicsOpen(true) : undefined}
            />
          ) : workspaceView === "reading" && selectedTrack?.curriculum?.sourceDocument ? (
            <PdfReadingCompanion key={selectedTrack.id} track={selectedTrack} pageRequest={readingPageRequest} onReturn={()=>setWorkspaceView("curriculum")} />
          ) : workspaceView === "curriculum" && selectedTrack ? (
            <CurriculumWorkspace key={selectedTrack.id} track={selectedTrack} milestones={milestones} messages={messages} active={activeMilestone}
              onSelect={handleSelectMilestone} onResume={()=>setWorkspaceView("session")}
              onOpenReading={(pages)=>{setReadingPageRequest(pages?{page:pages.from,to:pages.to,at:Date.now()}:undefined);setWorkspaceView("reading");}}
              onDiagnostic={milestone=>{handleSelectMilestone(milestone);setDiagnosticFor(milestone.id);}} />
          ) : (
            <>
              {currentSession.language && <div
                className="mobile-workspace-tabs"
                role="tablist"
                aria-label="Workspace view"
                onKeyDown={handleTabNavigation}
              >
                <button
                  role="tab"
                  id="lesson-view-tab"
                  aria-selected={mobilePane === "lesson"}
                  aria-controls="lesson-workspace"
                  tabIndex={mobilePane === "lesson" ? 0 : -1}
                  onClick={() => setMobilePane("lesson")}
                >
                  <BookOpen size={15} />
                  Session
                </button>
                {currentSession?.language && (
                  <button
                    role="tab"
                    id="editor-view-tab"
                    aria-selected={mobilePane === "editor"}
                    aria-controls="editor-workspace"
                    tabIndex={mobilePane === "editor" ? 0 : -1}
                    onClick={() => {
                      setIsCodeWorkspaceOpen(true);
                      setMobilePane("editor");
                    }}
                  >
                    <Code2 size={15} />
                    Code practice
                  </button>
                )}
              </div>}
              <div
                className={`workspace-panes ${
                  isCodeWorkspaceOpen ? "with-code" : "lesson-only"
                }`}
              >
                <div
                  id="lesson-workspace"
                  className={`lesson-column ${
                    mobilePane === "lesson" ? "mobile-visible" : ""
                  }`}
                >
                  <RetentionFlow key={currentSession.id} session={currentSession} milestones={milestones} cards={dueCards} database={db}
                    onActiveChange={setRetentionActive} onSaved={() => { setDueCards(db.getDueCardsList()); setMessages([...db.getMessages(currentSession.id)]); }} />
                  <div className="session-slot" hidden={retentionActive}>
                  {activeMilestone?.content_status === "outline" ? <section className="curriculum-preparing" aria-labelledby="preparing-unit-title">
                    <span className="curriculum-eyebrow">Getting your lesson ready</span><h1 id="preparing-unit-title">{activeMilestone.title}</h1><p>{activeMilestone.prompt}</p>
                    {unitPreparation?.id===activeMilestone.id && unitPreparation.state==="loading" ? <><p role="status"><Loader2 size={16} className="animate-spin"/> Preparing a small explanation, example and check…</p><button className="dialog-secondary-button" onClick={()=>{unitController.current?.abort();setUnitPreparation({id:activeMilestone.id,state:"cancelled"});}}>Cancel preparation</button></>:<><p role={unitPreparation?.state==="error"?"alert":"status"}>{unitPreparation?.error || "Preparation is paused. Your approved outline and progress are unchanged."}</p><button className="dialog-primary-button" onClick={()=>setPreparationRetry(n=>n+1)}>Prepare this lesson</button></>}
                    <button className="check-coach-button" onClick={()=>setWorkspaceView("curriculum")}>Back to curriculum</button>
                  </section> : <ChatPane
                    reviewQuestions
                    planTitle={selectedTrack?.title}
                    planLabel={selectedTrack?.curriculum ? "Curriculum" : "Learning plan"}
                    onOpenPlan={() => { handleStopStreaming(); setWorkspaceView("curriculum"); setIsSidebarOpen(false); }}
                    trackId={currentTrackId}
                    language={currentSession?.language || undefined}
                    allowCoding={!!currentSession?.language}
                    project={
                      project.enabled
                        ? {
                            title: project.project?.title ?? "Project",
                            step: project.step,
                            number: project.stepNumber,
                            total: project.totalSteps,
                            status: project.lastHeadline
                              ? { tone: project.lastHeadline.tone === "pass" ? "pass" : "fail", label: project.lastHeadline.chip }
                              : project.stage?.passedAt
                              ? { tone: "pass", label: "All tests pass" }
                              : project.stage
                              ? { tone: "neutral", label: "Not run yet" }
                              : undefined,
                            prepared: !!project.stage,
                            started: project.started,
                            passed: project.unitDone,
                            part: project.part && project.part.total > 1 ? project.part : undefined,
                          }
                        : undefined
                    }
                    isRequestingCheck={isRequestingCheck}
                    onRequestCheck={handleRequestCheck}
                    onRequestCompress={handleRequestCompress}
                    onStartProject={handleStartProject}
                    onSubmitCheck={handleSubmitCheck}
                    onDisputeCheck={handleDisputeCheck}
                    onContinueCheck={handleContinueCheck}
                    isCodeWorkspaceOpen={isCodeWorkspaceOpen}
                    onToggleCode={() => {
                      setIsCodeWorkspaceOpen((open) => {
                        // In a project topic, remember that the learner closed the
                        // project so it doesn't reopen on its own.
                        if (project.enabled)
                          try {
                            localStorage.setItem(`learnforge:project-closed:${currentTrackId}`, open ? "1" : "0");
                          } catch {
                            /* Preference only. */
                          }
                        return !open;
                      });
                      setMobilePane("lesson");
                    }}
                    messages={messages}
                    isStreaming={isStreaming}
                    streamingContent={streamingContent}
                    activeMilestone={activeMilestone}
                    milestones={milestones}
                    milestoneIndex={milestoneIndex}
                    milestoneCount={milestones.length}
                    onSendMessage={handleSendMessage}
                    onStopStreaming={handleStopStreaming}
                    onApplyCodeToEditor={
                      currentSession?.language
                        ? (code) => {
                            handleChangeCode(code);
                            setIsCodeWorkspaceOpen(true);
                            setMobilePane("editor");
                          }
                        : undefined
                    }
                    onQuickAction={handleQuickAction}
                    onOpenEditor={() => {
                      setIsCodeWorkspaceOpen(true);
                      setMobilePane("editor");
                    }}
                    onNextMilestone={
                      nextMilestone ? handleNextMilestone : undefined
                    }
                    onOpenSettings={() => {
                      setSettingsSection("connection");
                      setIsSettingsOpen(true);
                    }}
                  />}
                  </div>
                </div>
                {isCodeWorkspaceOpen && (
                  <div
                    id="editor-workspace"
                    className={`editor-column ${
                      mobilePane === "editor" ? "mobile-visible" : ""
                    }`}
                  >
                    <Suspense
                      fallback={
                        <div className="workspace-panel editor-loading">
                          Preparing your editor…
                        </div>
                      }
                    >
                      <EditorPane
                        code={project.enabled ? project.activeContent : editorCode}
                        project={project.enabled ? project : undefined}
                        onAskTutor={project.enabled ? () => void handleAskAboutRun() : undefined}
                        onChangeCode={handleChangeCode}
                        language={language}
                        onRunCode={handleRunCode}
                        onResetCode={handleResetCode}
                        isRunning={isRunningCode}
                        canAdvance={activeMilestone?.status === "completed" && approvedLessonIds(messages).has(activeMilestone.id)}
                        executionResult={executionResult}
                        onClearConsole={() => setExecutionResult(null)}
                        draftStatus={project.enabled ? project.status : codeDrafts.status}
                        milestoneId={activeMilestone?.id}
                        onNextMilestone={
                          nextMilestone ? handleNextMilestone : undefined
                        }
                        onClose={() => {
                          if (project.enabled) {
                            try {
                              localStorage.setItem(
                                `learnforge:project-closed:${currentTrackId}`,
                                "1"
                              );
                            } catch {
                              /* Preference only. */
                            }
                          }
                          setIsCodeWorkspaceOpen(false);
                          setMobilePane("lesson");
                        }}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </>
          )}
          </ErrorBoundary>
        </main>
      </div>
      {isManageTopicsOpen && (
        <ManageTopicsModal
          tracks={tracks}
          visibleIds={visibleTracks.map((track) => track.id)}
          removedIds={removedTopicIds}
          onDelete={handleDeleteTopics}
          onClose={() => setIsManageTopicsOpen(false)}
        />
      )}
      {isNewTopicModalOpen && (
        <NewTopicModal
          isOpen={isNewTopicModalOpen}
          initialInterest={startGoal}
          showMaterial={startWithMaterial}
          autoScope={!!startGoal?.trim() && !startWithMaterial}
          onClose={() => setIsNewTopicModalOpen(false)}
          onTrackCreated={handleTrackCreated}
          onOpenPlugins={() => {
            setSettingsSection("plugins");
            setIsSettingsOpen(true);
          }}
        />
      )}
      {isSettingsOpen && (
        <SettingsModal
          initialSection={settingsSection}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}
