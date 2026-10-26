import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Code2, BookOpen, Sparkles } from 'lucide-react';
import { handleTabNavigation } from './components/layout/keyboard';
import { Header } from './components/layout/Header';
import { MilestoneSidebar } from './components/milestones/MilestoneSidebar';
import { ChatPane } from './components/chat/ChatPane';
const EditorPane = lazy(() =>
  import('./components/editor/EditorPane').then((module) => ({ default: module.EditorPane }))
);
import { DailyReviewModal } from './components/fsrs/DailyReviewModal';
import { NewTopicModal } from './components/curriculum/NewTopicModal';
import {
  LearningSession,
  ChatMessage,
  Milestone,
  SupportedLanguage,
  ExecutionResult,
  FSRSRating,
} from './types';
import { db } from './services/db';
import { executeCode } from './services/sandbox';
import {
  streamSocraticChat,
  extractCleanResponse,
  STARTER_TRACKS,
  getTrackById,
  type CourseTrack,
} from './services/ai';

export default function App() {
  // --- Curriculum Tracks State ---
  const [tracks, setTracks] = useState<CourseTrack[]>(() => {
    try {
      const stored = localStorage.getItem('learnforge:custom-tracks');
      if (stored) {
        const custom: CourseTrack[] = JSON.parse(stored);
        return [...STARTER_TRACKS, ...custom];
      }
    } catch {}
    return STARTER_TRACKS;
  });
  const [currentTrackId, setCurrentTrackId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('learnforge:active-track');
      if (saved) return saved;
    } catch {}
    return STARTER_TRACKS[0].id;
  });
  const [isNewTopicModalOpen, setIsNewTopicModalOpen] = useState(false);

  // --- Session & Milestones State ---
  const [currentSession, setCurrentSession] = useState<LearningSession | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(null);

  // --- Chat State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Code Editor & Execution State ---
  const [editorCode, setEditorCode] = useState<string>('');
  const [language, setLanguage] = useState<SupportedLanguage>('go');
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);

  // --- FSRS State ---
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [dueCards, setDueCards] = useState(db.getDueCardsList());

  // --- Sidebar Collapse State ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 1200);
  const [mobilePane, setMobilePane] = useState<'lesson' | 'editor'>('lesson');
  const [learningTab, setLearningTab] = useState<'challenge' | 'coach'>('challenge');
  const [isCompactLayout, setIsCompactLayout] = useState(() => window.innerWidth < 1200);
  const [draftStatus, setDraftStatus] = useState<'saved' | 'saving' | 'memory'>('saved');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executionId = useRef(0);
  const drafts = useRef<Record<string, string> | null>(null);
  if (drafts.current === null) {
    try {
      const stored = JSON.parse(localStorage.getItem('learnforge:code-drafts') || '{}');
      drafts.current =
        stored && typeof stored === 'object' && !Array.isArray(stored)
          ? Object.fromEntries(
              Object.entries(stored).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string'
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
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1200px)');
    const collapseOnSmallScreen = () => {
      setIsCompactLayout(!desktop.matches);
      if (!desktop.matches) setIsSidebarOpen(false);
    };
    desktop.addEventListener('change', collapseOnSmallScreen);
    return () => desktop.removeEventListener('change', collapseOnSmallScreen);
  }, []);

  useEffect(() => {
    if (!isSidebarOpen || !isCompactLayout) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const sidebar = document.getElementById('learning-path');
    const main = document.getElementById('main-content');
    const header = document.querySelector<HTMLElement>('.app-header');
    if (main) main.inert = true;
    if (header) header.inert = true;
    sidebar?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsSidebarOpen(false);
      }
      if (e.key !== 'Tab' || !sidebar) return;
      const focusables = Array.from(
        sidebar.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
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
    document.addEventListener('keydown', onKey);
    return () => {
      if (main) main.inert = false;
      if (header) header.inert = false;
      document.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
  }, [isSidebarOpen, isCompactLayout]);

  const persistDrafts = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      localStorage.setItem('learnforge:code-drafts', JSON.stringify(drafts.current));
      setDraftStatus('saved');
    } catch {
      setDraftStatus('memory');
    }
  };

  const handleChangeCode = (code: string) => {
    setEditorCode(code);
    if (!activeMilestone) return;
    drafts.current![activeMilestone.id] = code;
    setDraftStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persistDrafts, 350);
  };

  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      try {
        localStorage.setItem('learnforge:code-drafts', JSON.stringify(drafts.current));
      } catch {}
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  // Initialize or load session on track change
  useEffect(() => {
    const track = tracks.find((t) => t.id === currentTrackId) || getTrackById(currentTrackId) || tracks[0];
    const sessions = db.getSessions();
    let session = sessions.find((s) => s.title === track.title);

    if (!session) {
      session = db.createSession({
        title: track.title,
        topic: track.tagline,
        language: track.language,
      });
    }

    // Seed an existing empty session as well as a newly created session.
    if (db.getMilestones(session.id).length === 0) {
      // Populate track milestones into db
      track.milestones.forEach((m, idx) => {
        db.createMilestone({
          session_id: session!.id,
          title: m.title,
          prompt: m.prompt,
          starter_code: m.starter_code,
          test_code: m.test_code,
          status: idx === 0 ? 'active' : 'pending',
        });
      });
    }

    setCurrentSession(session);
    setLanguage(session.language);

    const sessionMilestones = db.getMilestones(session.id);
    setMilestones(sessionMilestones);
    let rememberedMilestone: string | null = null;
    try {
      rememberedMilestone = localStorage.getItem(`learnforge:active-milestone:${session.id}`);
    } catch {}
    const active =
      sessionMilestones.find((m) => m.id === rememberedMilestone) ||
      sessionMilestones.find((m) => m.status === 'active') ||
      sessionMilestones.find((m) => m.status !== 'completed') ||
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
        role: 'assistant',
        content: `### Welcome to ${track.title}!\n\n${track.description}\n\nYour active challenge is pinned above in your lesson brief. Read through the requirements and the starter code in the editor, and ask me any questions whenever you're ready!`,
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
        localStorage.setItem('learnforge:custom-tracks', JSON.stringify(customOnly));
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
    setMobilePane('lesson');
    setLearningTab('challenge');
    try {
      localStorage.setItem('learnforge:active-track', trackId);
    } catch {}
  };

  // Handle Milestone Selection
  const handleSelectMilestone = (m: Milestone) => {
    if (m.id === activeMilestone?.id) return;
    handleStopStreaming();
    persistDrafts();
    setActiveMilestone(m);
    executionId.current += 1;
    setIsRunningCode(false);
    setEditorCode(drafts.current![m.id] ?? m.starter_code);
    setExecutionResult(null);
    setMobilePane('lesson');
    setLearningTab('challenge');
    if (window.innerWidth < 1200) setIsSidebarOpen(false);
    try {
      localStorage.setItem(`learnforge:active-milestone:${m.session_id}`, m.id);
    } catch {}
  };

  // Send Message (Never-Locked Composer)
  const handleSendMessage = async (userText: string) => {
    if (!currentSession || isStreaming) return;

    // Add user message
    const userMsg = db.addMessage({
      session_id: currentSession.id,
      role: 'user',
      content: userText,
      code_snippet: editorCode.trim() ? editorCode : undefined,
    });

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    // Setup streaming
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStreaming(true);
    setStreamingContent('');

    let accumulated = '';

    try {
      await streamSocraticChat(updatedMessages, activeMilestone || undefined, editorCode, {
        abortSignal: controller.signal,
        onChunk: (chunk) => {
          if (controller.signal.aborted) return;
          accumulated += chunk;
          setStreamingContent(accumulated);
        },
        onComplete: (fullText) => {
          if (controller.signal.aborted) return;
          setIsStreaming(false);
          setStreamingContent('');

          // Parse for any structured challenge block
          const { challenge, conversationalText, hasChallenge } = extractCleanResponse(fullText);

          // Save assistant message
          const botMsg = db.addMessage({
            session_id: currentSession.id,
            role: 'assistant',
            content: conversationalText,
          });
          setMessages([...updatedMessages, botMsg]);

          // If AI introduced a new challenge, update editor & milestone
          if (hasChallenge && challenge) {
            const newM = db.createMilestone({
              session_id: currentSession.id,
              title: challenge.title,
              prompt: challenge.prompt,
              starter_code: challenge.starter_code,
              test_code: challenge.test_code,
              status: 'active',
            });
            setMilestones(db.getMilestones(currentSession.id));
            setActiveMilestone(newM);
            setEditorCode(challenge.starter_code);
          }
        },
        onError: (err) => {
          if (controller.signal.aborted) return;
          setIsStreaming(false);
          setStreamingContent('');
          if (err.name !== 'AbortError' && !controller.signal.aborted) {
            const errorMsg = db.addMessage({
              session_id: currentSession.id,
              role: 'assistant',
              content: `**Your coach couldn’t connect.** Check that the AI service is running, then try your message again. Your code is saved in this workspace.\n\nConnection details: ${err.message}`,
            });
            setMessages([...updatedMessages, errorMsg]);
          }
        },
      });
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setIsStreaming(false);
      setStreamingContent('');
    }
  };

  // Stop Streaming
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    if (streamingContent.trim() && currentSession) {
      const partialMsg = db.addMessage({
        session_id: currentSession.id,
        role: 'assistant',
        content: streamingContent + '\n\n*(Generation stopped)*',
      });
      setMessages((prev) => [...prev, partialMsg]);
      setStreamingContent('');
    }
  };

  // Quick Action Chips
  const handleQuickAction = (action: 'hint' | 'explain' | 'review' | 'derivation') => {
    switch (action) {
      case 'hint':
        handleSendMessage(
          'Give me a Socratic hint for the current challenge without giving away the full answer.'
        );
        break;
      case 'explain':
        handleSendMessage(
          'Deep dive into the core mental model behind this milestone: explain the mechanics in 2 concise paragraphs.'
        );
        break;
      case 'review':
        handleSendMessage(
          'Review my current code in the editor. What invariants or edge cases should I consider?'
        );
        break;
      case 'derivation':
        handleSendMessage(
          'Provide a step-by-step state derivation ladder showing each intermediate state transition for this milestone using the ```ladder markdown format.'
        );
        break;
    }
  };

  // Run Code in Browser Sandbox
  const handleRunCode = async () => {
    if (isRunningCode) return;
    const runId = ++executionId.current;
    setIsRunningCode(true);
    try {
      const res = await executeCode(language, editorCode, activeMilestone?.test_code);
      if (runId !== executionId.current) return;
      setExecutionResult(res);

      // Check if all tests passed
      if (res.testResults && res.testResults.length > 0) {
        const allPassed = res.testResults.every((t) => t.passed);
        if (allPassed && res.exitCode === 0 && !res.error && !res.stderr) {
          // Mark milestone completed
          if (activeMilestone && currentSession) {
            db.updateMilestoneStatus(activeMilestone.id, 'completed');
            const updated = db.getMilestones(currentSession.id);
            setMilestones(updated);
            setActiveMilestone(updated.find((m) => m.id === activeMilestone.id) || null);
          }
        }
      }
    } catch (err: any) {
      if (runId !== executionId.current) return;
      setExecutionResult({
        stdout: '',
        stderr: err?.message || 'Execution error occurred',
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
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `LearnForge-${currentSession.title.replace(/\s+/g, '_')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const nextMilestone = milestones.slice(milestoneIndex + 1).find((m) => m.status !== 'completed');

  const handleNextMilestone = () => {
    if (!currentSession || !activeMilestone) return;
    const all = db.getMilestones(currentSession.id);
    const currentIndex = all.findIndex((m) => m.id === activeMilestone.id);
    if (currentIndex >= 0 && currentIndex < all.length - 1) {
      const nextM = all[currentIndex + 1];
      if (nextM.status === 'pending') {
        db.updateMilestoneStatus(nextM.id, 'active');
      }
      const updated = db.getMilestones(currentSession.id);
      setMilestones(updated);
      handleSelectMilestone(nextM);

      // Create an FSRS spaced repetition card for this completed concept
      try {
        db.createCard({
          topic: `${currentSession.title}: ${activeMilestone.title}`,
          prompt: `In ${currentSession.title}, what is the critical invariant for: ${activeMilestone.title}?\n\n${activeMilestone.prompt}`,
          target_code: editorCode || activeMilestone.solution_code || activeMilestone.starter_code,
        });
        setDueCards(db.getDueCardsList());
      } catch (err) {
        console.warn('Could not save FSRS card:', err);
      }

      // Welcome message from Coach into the next milestone
      const coachMsg = db.addMessage({
        session_id: currentSession.id,
        role: 'assistant',
        content: `### Excellent work on ${activeMilestone.title}!\n\nAll tests passed and your solution has been recorded. This concept is now in your FSRS spaced repetition review queue.\n\nWe're now advancing to **${nextM.title}**.\n\nTake a look at the starter code on the right. What invariants or concurrency patterns do you think we need here?`,
      });
      setMessages((prev) => [...prev, coachMsg]);
    }
  };

  return (
    <div className="app-shell">
      <Header
        currentTrackId={currentTrackId}
        onSelectTrack={handleSelectTrack}
        tracks={tracks.map((t) => ({ id: t.id, title: t.title, language: t.language }))}
        dueCardsCount={dueCards.length}
        onOpenReview={() => setIsReviewModalOpen(true)}
        onExportNotes={handleExportNotes}
        onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
        isSidebarOpen={isSidebarOpen}
        trackTitle={currentSession?.title}
        onOpenNewTopic={() => setIsNewTopicModalOpen(true)}
      />
      <div className="app-body">
        {isSidebarOpen && (
          <>
            <button
              className="sidebar-backdrop"
              aria-label="Close learning path"
              onClick={() => setIsSidebarOpen(false)}
            />
            <MilestoneSidebar
              milestones={milestones}
              activeMilestoneId={activeMilestone?.id}
              onSelectMilestone={handleSelectMilestone}
              onClose={() => setIsSidebarOpen(false)}
              onOpenNewTopic={() => setIsNewTopicModalOpen(true)}
            />
          </>
        )}
        <main className="main-workspace" id="main-content">
          <div
            className="mobile-workspace-tabs"
            role="tablist"
            aria-label="Workspace view"
            onKeyDown={handleTabNavigation}
          >
            <button
              role="tab"
              id="lesson-view-tab"
              aria-selected={mobilePane === 'lesson'}
              aria-controls="lesson-workspace"
              tabIndex={mobilePane === 'lesson' ? 0 : -1}
              onClick={() => setMobilePane('lesson')}
            >
              <BookOpen size={15} />
              Lesson & Coach
            </button>
            <button
              role="tab"
              id="editor-view-tab"
              aria-selected={mobilePane === 'editor'}
              aria-controls="editor-workspace"
              tabIndex={mobilePane === 'editor' ? 0 : -1}
              onClick={() => setMobilePane('editor')}
            >
              <Code2 size={15} />
              Code Workspace
            </button>
          </div>
          <div className="workspace-panes">
            <div
              id="lesson-workspace"
              className={`lesson-column ${mobilePane === 'lesson' ? 'mobile-visible' : ''}`}
            >
              <ChatPane
                messages={messages}
                isStreaming={isStreaming}
                streamingContent={streamingContent}
                activeTab={learningTab}
                onChangeTab={setLearningTab}
                activeMilestone={activeMilestone}
                milestoneIndex={milestoneIndex}
                milestoneCount={milestones.length}
                onSendMessage={handleSendMessage}
                onStopStreaming={handleStopStreaming}
                onApplyCodeToEditor={(code) => {
                  handleChangeCode(code);
                  setMobilePane('editor');
                }}
                onQuickAction={handleQuickAction}
                onOpenEditor={() => setMobilePane('editor')}
                onNextMilestone={nextMilestone ? handleNextMilestone : undefined}
              />
            </div>
            <div
              id="editor-workspace"
              className={`editor-column ${mobilePane === 'editor' ? 'mobile-visible' : ''}`}
            >
              <Suspense
                fallback={
                  <div className="workspace-panel editor-loading">Preparing your editor…</div>
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
                  onNextMilestone={nextMilestone ? handleNextMilestone : undefined}
                />
              </Suspense>
            </div>
          </div>
        </main>
      </div>
      {isReviewModalOpen && (
        <DailyReviewModal
          isOpen={isReviewModalOpen}
          onClose={() => {
            setIsReviewModalOpen(false);
            setDueCards(db.getDueCardsList());
          }}
          cards={dueCards}
          onRateCard={handleRateCard}
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
