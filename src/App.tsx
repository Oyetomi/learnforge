import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { Code2, BookOpen } from "lucide-react";
import { handleTabNavigation } from "./components/layout/keyboard";
import { Header } from "./components/layout/Header";
import { MilestoneSidebar } from "./components/milestones/MilestoneSidebar";
import { ChatPane } from "./components/chat/ChatPane";
const EditorPane = lazy(() =>
  import("./components/editor/EditorPane").then((module) => ({
    default: module.EditorPane,
  }))
);
import { DailyReviewModal } from "./components/fsrs/DailyReviewModal";
import { ManageTopicsModal } from "./components/curriculum/ManageTopicsModal";
import { SettingsModal } from "./components/settings/SettingsModal";
import {
  extractVisualExample,
  visualForSubject,
} from "./services/learning/visuals";
import { visualSupportFor } from "./services/learning/preferences";
import { nextLearningMilestone, plannedMilestoneFields } from "./services/learning/placement";
import { isAcceptedFreeResponseGrade } from "./services/learning/freeResponse";
import { RetentionFlow } from "./components/learning/RetentionFlow";
import { deleteTopicData } from "./services/learning/topicDeletion";
import { topicsInWorkspace, savedTopicIds } from "./services/learning/topics";
import { NewTopicModal } from "./components/curriculum/NewTopicModal";
import {
  LearningSession,
  ChatMessage,
  Milestone,
  SupportedLanguage,
  ExecutionResult,
  FSRSRating,
  LearningCheck,
  CheckAttempt,
} from "./types";
import { db } from "./services/db";
import { planAdaptiveRepair } from "./services/learning/planner";
import {
  acceptsReadiness,
  approvedLessonIds,
  extractAssessment,
  extractRepair,
  isLessonUnlocked,
} from "./services/learning/adaptation";
import { executeCode } from "./services/sandbox";
import {
  extractLearningCheck,
  hideLearningCheckBlocks,
  gradeLearningCheck,
  learningEvidence,
  starterLearningCheck,
} from "./services/learning/checks";
import {
  streamSocraticChat,
  extractCleanResponse,
  STARTER_TRACKS,
  type CourseTrack,
} from "./services/ai";

export default function App() {
  const [retentionActive, setRetentionActive] = useState(false);
  // --- Curriculum Tracks State ---
  const [tracks, setTracks] = useState<CourseTrack[]>(() => {
    try {
      const stored = localStorage.getItem("learnforge:custom-tracks");
      if (stored) {
        const custom: CourseTrack[] = JSON.parse(stored);
        return [...STARTER_TRACKS, ...custom];
      }
    } catch {}
    return STARTER_TRACKS;
  });
  const [addedStarterIds, setAddedStarterIds] = useState(() => {
    let current = "";
    try {
      current = localStorage.getItem("learnforge:active-track") || "";
    } catch {}
    return savedTopicIds(
      "learnforge:added-starters",
      STARTER_TRACKS.some((track) => track.id === current) ? [current] : []
    );
  });
  const [removedTopicIds, setRemovedTopicIds] = useState(() =>
    savedTopicIds("learnforge:removed-topics")
  );
  const visibleTracks = topicsInWorkspace(
    tracks,
    STARTER_TRACKS.map((track) => track.id),
    addedStarterIds,
    removedTopicIds
  );
  const [currentTrackId, setCurrentTrackId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("learnforge:active-track");
      if (saved && visibleTracks.some((track) => track.id === saved))
        return saved;
    } catch {}
    return visibleTracks[0]?.id || "";
  });
  const [isNewTopicModalOpen, setIsNewTopicModalOpen] = useState(false);
  const [isManageTopicsOpen, setIsManageTopicsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    "learning" | "connection"
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
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [dueCards, setDueCards] = useState(db.getDueCardsList());

  // --- Sidebar Collapse State ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => window.innerWidth >= 1200
  );
  const [mobilePane, setMobilePane] = useState<"lesson" | "editor">("lesson");
  const [isCompactLayout, setIsCompactLayout] = useState(
    () => window.innerWidth < 1200
  );
  const [draftStatus, setDraftStatus] = useState<"saved" | "saving" | "memory">(
    "saved"
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executionId = useRef(0);
  const drafts = useRef<Record<string, string> | null>(null);
  if (drafts.current === null) {
    try {
      const stored = JSON.parse(
        localStorage.getItem("learnforge:code-drafts") || "{}"
      );
      drafts.current =
        stored && typeof stored === "object" && !Array.isArray(stored)
          ? Object.fromEntries(
              Object.entries(stored).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string"
              )
            )
          : {};
    } catch {
      drafts.current = {};
    }
  }
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

  const persistDrafts = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      localStorage.setItem(
        "learnforge:code-drafts",
        JSON.stringify(drafts.current)
      );
      setDraftStatus("saved");
    } catch {
      setDraftStatus("memory");
    }
  };

  const handleChangeCode = (code: string) => {
    setEditorCode(code);
    if (!activeMilestone) return;
    drafts.current![activeMilestone.id] = code;
    setDraftStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persistDrafts, 350);
  };

  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      try {
        localStorage.setItem(
          "learnforge:code-drafts",
          JSON.stringify(drafts.current)
        );
      } catch {}
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

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
    const sessions = db.getSessions();
    let session = sessions.find(
      (s) =>
        s.track_id === track.id ||
        (!track.learningIntent && !s.track_id && s.title === track.title)
    );

    if (!session) {
      session = db.createSession({
        title: track.title,
        topic: track.tagline,
        language: track.language,
        track_id: track.id,
        learning_intent: track.learningIntent,
        placement: track.placement,
        references: track.references,
      });
    }

    // Seed an existing empty session as well as a newly created session.
    if (db.getMilestones(session.id).length === 0) {
      // Populate track milestones into db
      const createdMilestones = track.milestones.map((m) => {
        return db.createMilestone({
          session_id: session!.id,
          learning_intent: session!.learning_intent,
          references: session!.references,
          title: m.title,
          prompt: m.prompt,
          starter_code: m.starter_code,
          test_code: m.test_code,
          lesson: m.lesson,
          visual: m.visual,
          ...plannedMilestoneFields(track, m.id),
        });
      });
      track.milestones.forEach((template, index) => {
        if (template.prerequisite_ids)
          db.updateMilestonePrerequisites(
            createdMilestones[index].id,
            template.prerequisite_ids
              .map(
                (id) =>
                  createdMilestones[
                    track.milestones.findIndex((item) => item.id === id)
                  ]?.id
              )
              .filter((id): id is string => !!id)
          );
      });
    }

    setCurrentSession(session);
    setLanguage(session.language || "go");
    if (!session.language) {
      setIsCodeWorkspaceOpen(false);
      setMobilePane("lesson");
    }

    const sessionMilestones = db.getMilestones(session.id);
    setMilestones(sessionMilestones);
    let rememberedMilestone: string | null = null;
    try {
      rememberedMilestone = localStorage.getItem(
        `learnforge:active-milestone:${session.id}`
      );
    } catch {}
    const approved = approvedLessonIds(db.getMessages(session.id));
    const active =
      sessionMilestones.find(
        (m) =>
          m.id === rememberedMilestone &&
          isLessonUnlocked(m, sessionMilestones, approved)
      ) ||
      sessionMilestones.find(
        (m) =>
          m.status === "active" &&
          isLessonUnlocked(m, sessionMilestones, approved)
      ) ||
      sessionMilestones.find(
        (m) =>
          m.status !== "completed" &&
          isLessonUnlocked(m, sessionMilestones, approved)
      ) ||
      sessionMilestones[0] ||
      null;
    setActiveMilestone(active);

    if (active) {
      setEditorCode(drafts.current![active.id] ?? active.starter_code);
    }

    const sessionMessages = db.getMessages(session.id);
    setMessages(sessionMessages);

    // Initial greeting if session is empty
    if (sessionMessages.length === 0) {
      const greeting: ChatMessage = db.addMessage({
        session_id: session.id,
        role: "assistant",
        content: `I can help with **${
          track.title
        }**. Ask about your challenge, request a hint, or share what you’ve tried. Start with the interactive lesson. ${
          session.language
            ? "Open coding practice when you want to experiment."
            : ""
        }`,
      });
      setMessages([greeting]);
    }
  }, [currentTrackId, tracks]);

  // Handle new custom track created dynamically by AI
  const handleTrackCreated = (newTrack: CourseTrack) => {
    setTracks((prev) => {
      const updated = [...prev, newTrack];
      try {
        const customOnly = updated.filter(
          (t) => !STARTER_TRACKS.some((st) => st.id === t.id)
        );
        localStorage.setItem(
          "learnforge:custom-tracks",
          JSON.stringify(customOnly)
        );
      } catch {}
      return updated;
    });

    handleSelectTrack(newTrack.id);
  };

  // Handle Track Selection
  const handleSelectTrack = (trackId: string) => {
    if (trackId === currentTrackId) return;
    handleStopStreaming();
    persistDrafts();
    executionId.current += 1;
    setExecutionResult(null);
    setIsRunningCode(false);
    setCurrentTrackId(trackId);
    setMobilePane("lesson");
    try {
      localStorage.setItem("learnforge:active-track", trackId);
    } catch {}
  };

  const updateTopicMembership = (added: string[], removed: string[]) => {
    setAddedStarterIds(added);
    setRemovedTopicIds(removed);
    try {
      localStorage.setItem("learnforge:added-starters", JSON.stringify(added));
      localStorage.setItem(
        "learnforge:removed-topics",
        JSON.stringify(removed)
      );
    } catch {}
  };
  const handleDeleteTopics = (ids: string[]) => {
    const deleting = new Set(ids);
    if (deleting.has(currentTrackId)) handleStopStreaming();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const erased = ids.flatMap((id) =>
      deleteTopicData(db, tracks.find((t) => t.id === id) || { id, title: "" })
    );
    for (const id of erased) delete drafts.current![id];
    persistDrafts();
    const remaining = tracks.filter((t) => !deleting.has(t.id));
    localStorage.setItem(
      "learnforge:custom-tracks",
      JSON.stringify(
        remaining.filter((t) => !STARTER_TRACKS.some((s) => s.id === t.id))
      )
    );
    setTracks(remaining);
    const added = addedStarterIds.filter((id) => !deleting.has(id));
    const removed = removedTopicIds.filter((id) => !deleting.has(id));
    updateTopicMembership(added, removed);
    if (deleting.has(currentTrackId)) {
      handleSelectTrack(
        topicsInWorkspace(
          remaining,
          STARTER_TRACKS.map((t) => t.id),
          added,
          removed
        )[0]?.id || ""
      );
      setIsCodeWorkspaceOpen(false);
    }
    setDueCards(db.getDueCardsList());
  };

  const handleSelectMilestone = (m: Milestone) => {
    if (
      m.id === activeMilestone?.id ||
      !isLessonUnlocked(m, milestones, approvedLessonIds(messages))
    )
      return;
    handleStopStreaming();
    persistDrafts();
    setActiveMilestone(m);
    executionId.current += 1;
    setIsRunningCode(false);
    setEditorCode(drafts.current![m.id] ?? m.starter_code);
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
      teachOnly?: boolean;
      independent?: boolean;
      /** Instruction sent to the AI for this turn instead of the visible text. */
      prompt?: string;
    }
  ) => {
    if (!currentSession || isStreaming) return;

    // Add user message
    const userMsg = db.addMessage({
      session_id: currentSession.id,
      role: "user",
      content: userText,
      milestone_id: activeMilestone?.id,
      internal: options?.internal,
      code_snippet:
        isCodeWorkspaceOpen && editorCode.trim() ? editorCode : undefined,
    });

    const updatedMessages = [...(options?.history || messages), userMsg];
    setMessages(updatedMessages);

    // Setup streaming
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStreaming(true);
    setStreamingContent("");

    let accumulated = "";

    try {
      if (options?.adapt && activeMilestone) {
        const proposal = await planAdaptiveRepair(
          activeMilestone,
          activeCheck,
          updatedMessages,
          milestones,
          controller.signal
        ).catch((error) => {
          if (controller.signal.aborted) throw error;
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
            persistDrafts();
            setMilestones(db.getMilestones(currentSession.id));
            setActiveMilestone(repair);
            setEditorCode("");
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
      }
      await streamSocraticChat(
        options?.prompt
          ? [
              ...updatedMessages.slice(0, -1),
              { ...userMsg, content: options.prompt },
            ]
          : updatedMessages,
        activeMilestone || undefined,
        isCodeWorkspaceOpen ? editorCode : "",
        {
          activeCheck: activeCheck || undefined,
          abortSignal: controller.signal,
          onChunk: (chunk) => {
            if (controller.signal.aborted) return;
            accumulated += chunk;
            setStreamingContent(accumulated);
          },
          onComplete: (fullText) => {
            if (controller.signal.aborted) return;
            setIsStreaming(false);
            setStreamingContent("");

            // Parse for any structured challenge block
            const { challenge, conversationalText, hasChallenge } =
              extractCleanResponse(fullText);

            const visual = options?.independent
              ? null
              : visualForSubject(
                  extractVisualExample(conversationalText),
                  currentSession.language
                );
            const review = options?.teachOnly
              ? null
              : extractAssessment(conversationalText);
            const acceptedReview =
              review &&
              activeMilestone &&
              (review.decision === "practice" ||
                acceptsReadiness(updatedMessages, activeMilestone.id, review))
                ? {
                    ...review,
                    milestoneId: activeMilestone.id,
                    createdAt: Date.now(),
                  }
                : undefined;
            const repairProposal =
              activeMilestone && !options?.teachOnly
                ? extractRepair(
                    conversationalText,
                    updatedMessages,
                    activeMilestone,
                    milestones
                  )
                : null;
            const repair = repairProposal
              ? db.addRepairMilestone(activeMilestone!.id, repairProposal)
              : null;
            const checkResult = extractLearningCheck(conversationalText);
            const learningCheck: LearningCheck | undefined =
              checkResult.check && activeMilestone && !options?.teachOnly
                ? {
                    ...checkResult.check,
                    id: `check-${Date.now()}-${Math.random()
                      .toString(36)
                      .slice(2, 7)}`,
                    milestoneId: activeMilestone.id,
                  }
                : undefined;
            const reviewProblem =
              review?.decision === "ready" && !acceptedReview
                ? "\n\nThe readiness evidence could not be verified. The next concept stays in preview."
                : "";
            // Save the structured question with its message so it survives navigation.
            const botMsg = db.addMessage({
              session_id: currentSession.id,
              role: "assistant",
              content:
                checkResult.hasBlock && !learningCheck && !options?.teachOnly
                  ? `${checkResult.text}\n\nThis question could not be displayed. Ask for a new knowledge check.`
                  : checkResult.text +
                    reviewProblem +
                    (options?.visual && !visual
                      ? "\n\nI couldn’t prepare the visual example. Try ‘Show me visually’ again, or ask for a plain-language explanation."
                      : ""),
              visual_example: visual || undefined,
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
                  });
                  setDueCards(db.getDueCardsList());
                }
              } catch {}
            }
            if (repair) {
              setMilestones(db.getMilestones(currentSession.id));
              setActiveMilestone(repair);
              setEditorCode("");
              persistDrafts();
              try {
                localStorage.setItem(
                  `learnforge:active-milestone:${currentSession.id}`,
                  repair.id
                );
              } catch {}
            }

            if (learningCheck) setMobilePane("lesson");

            // If AI introduced a new challenge, update editor & milestone
            if (
              hasChallenge &&
              challenge &&
              currentSession.language &&
              !options?.teachOnly
            ) {
              const newM = db.createMilestone({
                session_id: currentSession.id,
                title: challenge.title,
                prompt: challenge.prompt,
                starter_code: challenge.starter_code,
                test_code: challenge.test_code,
                status: "active",
              });
              setMilestones(db.getMilestones(currentSession.id));
              setActiveMilestone(newM);
              setEditorCode(challenge.starter_code);
            }
          },
          onError: (err) => {
            if (controller.signal.aborted) return;
            setIsStreaming(false);
            setStreamingContent("");
            if (err.name !== "AbortError" && !controller.signal.aborted) {
              const errorMsg = db.addMessage({
                session_id: currentSession.id,
                role: "assistant",
                generation_error: true,
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
      messages.some((message) => message.check_attempt?.checkId === check.id)
    )
      return;
    const presentedIndex = messages.findIndex(
      (message) => message.learning_check?.id === check.id
    );
    const visualSupportIds = visualSupportFor(check.id);
    const assisted =
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
      assisted,
      visualSupportIds,
      correct: check.kind === "free-response"
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
    // Save feedback only. Continue explicitly starts the next teaching request.
    const history = [...messages, answerMessage];
    setMessages(history);
  };

  const handleDisputeCheck = (check: LearningCheck) => {
    if (!currentSession || isStreaming || check.id !== activeCheck?.id) return;
    if (!db.disputeWrittenAttempt(currentSession.id, check.id)) return;
    if (activeMilestone?.status === "completed") {
      db.updateMilestoneStatus(activeMilestone.id, "active");
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
    startFollowUp(check, result, messages);
  };

  const startFollowUp = (
    check: LearningCheck,
    result: CheckAttempt,
    history: ChatMessage[]
  ) => {
    const evidence = learningEvidence(history, check.milestoneId);
    const direction = result.grading?.status === "uncertain"
      ? "The written-answer judgment is unresolved or was disputed. Do not treat it as evidence of a misconception or readiness. Ask one fresh, smaller applied check to establish the distinction fairly, using the learner’s concern if given. Do not add prerequisites based on this disputed grade."
      : evidence.readyToAdvance
      ? "There are two or more independent correct applications. Assess the learner’s reasoning, confidence, prior mistakes, and transfer. Emit a forge-assessment JSON block with decision ready or practice, a specific rationale, and the actual evidenceCheckIds. A correct choice count is not sufficient by itself. If ready, recap briefly without asking another check. If practice, state the gap and ask one targeted check. Never declare mastery."
      : result.dontKnow || !result.correct
      ? "Repair the specific gap shown by this answer. The question card already displays the committed explanation; do not repeat it verbatim. Use the learner’s reasoning if supplied; otherwise do not invent a misconception. Reduce the step size: teach ONE distinction in a plain-language sentence, show ONE tiny concrete example, define unfamiliar terms, then stop for an easier prediction. Avoid advanced internals or a longer lecture. A ladder is optional only if it makes this small example easier to follow. If the mistake exposes a genuinely missing prerequisite, use forge-repair to add that prerequisite to the roadmap with its own short lesson and check, grounded in the latest failed check id. Otherwise repair in place and ask ONE simpler, fresh applied question in a forge-check JSON block. Do not repeat the same question."
      : result.assisted || result.confidence === "unsure"
      ? "Acknowledge the correct answer without claiming mastery. Ask ONE different application of this idea in a forge-check JSON block to verify independent understanding without the same scaffolding."
      : "Acknowledge the correct reasoning briefly. Ask ONE different application of this idea in a forge-check JSON block, slightly extending the situation. Do not mark the lesson mastered after one selection.";
    void handleSendMessage(
      `Continue tutoring from the submitted attempt. ${direction} Keep pre-question prose concise, and keep answer keys and explanations inside the question block until submission.`,
      {
        history,
        internal: true,
        adapt: result.grading?.status !== "uncertain" && (!result.correct || result.confidence === "unsure"),
        independent: result.correct,
      }
    );
  };

  const handleRequestCheck = async () => {
    if (isStreaming || !activeMilestone) return;
    const requestId = ++checkRequestId.current;
    setIsRequestingCheck(true);
    setMobilePane("lesson");
    try {
      await handleSendMessage(
        learningEvidence(messages, activeMilestone.id).readyToAdvance &&
          !approvedLessonIds(messages).has(activeMilestone.id)
          ? "Assess readiness from the recorded attempts and reasoning. Emit forge-assessment with actual evidenceCheckIds and a specific rationale. If not ready, ask one targeted application; do not approve based solely on answer count."
          : "Ask ONE fresh applied choice or free-response knowledge check for the current lesson using a forge-check JSON block. Use a different case from the previous examples and questions. For a choice check, use plausible, even-length options with stable ids. For free-response, commit an expected answer and 1–5 concrete rubric criteria. Commit the answer and explanation, and keep both hidden until I submit. Do not teach the solution first or emit forge-visual; this is a chance to try without scaffolding.",
        { internal: true, independent: true }
      );
    } finally {
      if (requestId === checkRequestId.current) setIsRequestingCheck(false);
    }
  };

  // Stop Streaming
  const handleStopStreaming = () => {
    checkRequestId.current += 1;
    setIsRequestingCheck(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    if (streamingContent.trim() && currentSession) {
      const partialMsg = db.addMessage({
        session_id: currentSession.id,
        role: "assistant",
        milestone_id: activeMilestone?.id,
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
    action: "hint" | "explain" | "review" | "derivation" | "visual" | "clarify"
  ) => {
    switch (action) {
      case "visual":
        handleSendMessage("Show me a visual example.", {
          visual: true,
          teachOnly: true,
          prompt:
            "Show one small interactive visual example of the CURRENT concept using the forge-visual schema. Prefer an applicable simulation or phrase-builder so I can manipulate the idea and observe a consequence; do not default to a row of boxes. Use an owned model only when it fits this exact concept. Use an analogous case, not the answer to the pending check. Preserve my subject and goal. Do not replace the pending question, emit forge-check, or assess readiness. Introduce the visual in one short sentence.",
        });
        break;
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
    try {
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
          if (!isStreaming)
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
    if (activeMilestone) {
      handleChangeCode(activeMilestone.starter_code);
      setExecutionResult(null);
    }
  };

  // Rate FSRS card
  const handleRateCard = (cardId: string, rating: FSRSRating) => {
    db.rateCard(cardId, rating);
    setDueCards(db.getDueCardsList());
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
    URL.revokeObjectURL(url);
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
        content: `You completed **${activeMilestone.title}**. Next: **${nextM.title}**. Open the lesson to check your understanding, or ask me about the concept.`,
      });
      setMessages((prev) => [...prev, coachMsg]);
    }
  };

  const requestedLessons = useRef(new Set<string>());
  useEffect(() => {
    if (
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
  }, [activeMilestone?.id, activeCheck?.id, isStreaming, currentSession?.id]);

  return (
    <div className="app-shell">
      <Header
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
        dueCardsCount={dueCards.length}
        onOpenReview={() => setIsReviewModalOpen(true)}
        onExportNotes={handleExportNotes}
        onOpenSettings={() => {
          setSettingsSection("learning");
          setIsSettingsOpen(true);
        }}
        onToggleSidebar={() => {
          if (currentSession) setIsSidebarOpen((v) => !v);
        }}
        isSidebarOpen={isSidebarOpen}
        onOpenNewTopic={() => {
          setIsSidebarOpen((open) => (isCompactLayout ? false : open));
          setIsNewTopicModalOpen(true);
        }}
      />
      <div className="app-body">
        {isSidebarOpen && currentSession && (
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
        <main className="main-workspace" id="main-content">
          {!currentSession ? (
            <div className="empty-workspace">
              <BookOpen size={26} />
              <h1>What are you interested in?</h1>
              <p>
                Tell LearnForge what you’re curious about. Get topic suggestions
                shaped around your interests, then learn through questions and
                explanations.
              </p>
              <button
                className="dialog-primary-button"
                onClick={() => setIsNewTopicModalOpen(true)}
              >
                Explore my interests
              </button>
              {removedTopicIds.length > 0 && (
                <button
                  className="check-coach-button"
                  onClick={() => setIsManageTopicsOpen(true)}
                >
                  Clear previously removed topics
                </button>
              )}
            </div>
          ) : (
            <>
              <div
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
              </div>
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
                  <ChatPane
                    trackId={currentTrackId}
                    language={currentSession?.language || undefined}
                    allowCoding={!!currentSession?.language}
                    isRequestingCheck={isRequestingCheck}
                    onRequestCheck={handleRequestCheck}
                    onSubmitCheck={handleSubmitCheck}
                    onDisputeCheck={handleDisputeCheck}
                    onContinueCheck={handleContinueCheck}
                    isCodeWorkspaceOpen={isCodeWorkspaceOpen}
                    onToggleCode={() => {
                      setIsCodeWorkspaceOpen((open) => !open);
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
                  />
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
                        code={editorCode}
                        onChangeCode={handleChangeCode}
                        language={language}
                        onRunCode={handleRunCode}
                        onResetCode={handleResetCode}
                        isRunning={isRunningCode}
                        executionResult={executionResult}
                        onClearConsole={() => setExecutionResult(null)}
                        draftStatus={draftStatus}
                        milestoneId={activeMilestone?.id}
                        onNextMilestone={
                          nextMilestone ? handleNextMilestone : undefined
                        }
                        onClose={() => {
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
      {isSettingsOpen && (
        <SettingsModal
          initialSection={settingsSection}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
      {isNewTopicModalOpen && (
        <NewTopicModal
          isOpen={isNewTopicModalOpen}
          onClose={() => setIsNewTopicModalOpen(false)}
          onTrackCreated={handleTrackCreated}
        />
      )}
    </div>
  );
}
