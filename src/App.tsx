import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Header } from './components/layout/Header';
import { MilestoneSidebar } from './components/milestones/MilestoneSidebar';
import { ChatPane } from './components/chat/ChatPane';
import { EditorPane } from './components/editor/EditorPane';
import { DailyReviewModal } from './components/fsrs/DailyReviewModal';
import { LearningSession, ChatMessage, Milestone, SupportedLanguage, ExecutionResult, FSRSRating } from './types';
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
  const [tracks] = useState<CourseTrack[]>(STARTER_TRACKS);
  const [currentTrackId, setCurrentTrackId] = useState<string>('track-go-concurrency');

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Initialize or load session on track change
  useEffect(() => {
    const track = getTrackById(currentTrackId) || tracks[0];
    const sessions = db.getSessions();
    let session = sessions.find((s) => s.topic.toLowerCase().includes(track.title.toLowerCase().split(' ')[0]));

    if (!session) {
      session = db.createSession({
        title: track.title,
        topic: track.tagline,
        language: track.language,
      });

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
    const active = sessionMilestones.find((m) => m.status === 'active') || sessionMilestones[0] || null;
    setActiveMilestone(active);

    if (active) {
      setEditorCode(active.starter_code);
    }

    const sessionMessages = db.getMessages(session.id);
    setMessages(sessionMessages);

    // Initial greeting if session is empty
    if (sessionMessages.length === 0) {
      const greeting: ChatMessage = db.addMessage({
        session_id: session.id,
        role: 'assistant',
        content: `### Welcome to ${track.title}\n\n${track.description}\n\n**Axiom:** *"Hear and forget. See and remember. Build and understand."*\n\nWe start with **${active?.title || 'Milestone 1'}**. The starter code is loaded in your editor on the right. When you are ready, ask clarifying questions or click **Run Code** to test your logic!`,
      });
      setMessages([greeting]);
    }
  }, [currentTrackId]);

  // Handle Track Selection
  const handleSelectTrack = (trackId: string) => {
    setCurrentTrackId(trackId);
  };

  // Handle Milestone Selection
  const handleSelectMilestone = (m: Milestone) => {
    setActiveMilestone(m);
    setEditorCode(m.starter_code);
    setExecutionResult(null);
  };

  // Send Message (Never-Locked Composer)
  const handleSendMessage = async (userText: string) => {
    if (!currentSession) return;

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
          accumulated += chunk;
          setStreamingContent(accumulated);
        },
        onComplete: (fullText) => {
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
          setIsStreaming(false);
          setStreamingContent('');
          if (err.name !== 'AbortError') {
            const errorMsg = db.addMessage({
              session_id: currentSession.id,
              role: 'assistant',
              content: `⚠️ **Connection Notice:** Unable to reach the local proxy (${err.message}). Make sure \`http://127.0.0.1:10532\` is active.`,
            });
            setMessages([...updatedMessages, errorMsg]);
          }
        },
      });
    } catch (err: any) {
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
  const handleQuickAction = (action: 'hint' | 'explain' | 'review') => {
    switch (action) {
      case 'hint':
        handleSendMessage('Give me a Socratic hint for the current challenge without giving away the full answer.');
        break;
      case 'explain':
        handleSendMessage('Deep dive into the core mental model behind this milestone: explain the mechanics in 2 concise paragraphs.');
        break;
      case 'review':
        handleSendMessage('Review my current code in the editor. What invariants or edge cases should I consider?');
        break;
    }
  };

  // Run Code in Browser Sandbox
  const handleRunCode = async () => {
    setIsRunningCode(true);
    try {
      const res = await executeCode(language, editorCode, activeMilestone?.test_code);
      setExecutionResult(res);

      // Check if all tests passed
      if (res.testResults && res.testResults.length > 0) {
        const allPassed = res.testResults.every((t) => t.passed);
        if (allPassed) {
          // Trigger Confetti!
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 },
          });

          // Mark milestone completed
          if (activeMilestone && currentSession) {
            db.updateMilestoneStatus(activeMilestone.id, 'completed');
            setMilestones(db.getMilestones(currentSession.id));
          }
        }
      }
    } catch (err: any) {
      setExecutionResult({
        stdout: '',
        stderr: err?.message || 'Execution error occurred',
        exitCode: 1,
        durationMs: 0,
        error: err?.message,
      });
    } finally {
      setIsRunningCode(false);
    }
  };

  // Reset Code to starter
  const handleResetCode = () => {
    if (activeMilestone) {
      setEditorCode(activeMilestone.starter_code);
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-forge-bg text-forge-text font-sans">
      {/* Top Application Header */}
      <Header
        currentTrackId={currentTrackId}
        onSelectTrack={handleSelectTrack}
        tracks={tracks.map((t) => ({ id: t.id, title: t.title, language: t.language }))}
        dueCardsCount={dueCards.length}
        onOpenReview={() => setIsReviewModalOpen(true)}
        onExportNotes={handleExportNotes}
        modelName="gemini-3.8-flash-high"
        isModelConnected={true}
      />

      {/* Main Dual-Pane Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Milestone Tracker Sidebar (Collapsible) */}
        {isSidebarOpen && (
          <MilestoneSidebar
            milestones={milestones}
            activeMilestoneId={activeMilestone?.id}
            onSelectMilestone={handleSelectMilestone}
          />
        )}

        {/* Left Pane (50%): Socratic Dialogue Stream */}
        <div className="flex-1 min-w-[320px] max-w-full md:w-1/2 min-h-0">
          <ChatPane
            messages={messages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            activeMilestoneTitle={activeMilestone?.title}
            onSendMessage={handleSendMessage}
            onStopStreaming={handleStopStreaming}
            onApplyCodeToEditor={(code) => setEditorCode(code)}
            onQuickAction={handleQuickAction}
            currentTopic={currentSession?.topic || 'Systems Engineering'}
          />
        </div>

        {/* Right Pane (50%): Live Interactive Sandbox & Monaco Editor */}
        <div className="hidden md:flex flex-1 min-w-[360px] md:w-1/2 min-h-0">
          <EditorPane
            code={editorCode}
            onChangeCode={setEditorCode}
            language={language}
            onChangeLanguage={setLanguage}
            onRunCode={handleRunCode}
            onResetCode={handleResetCode}
            isRunning={isRunningCode}
            executionResult={executionResult}
            onClearConsole={() => setExecutionResult(null)}
          />
        </div>
      </div>

      {/* Daily FSRS Spaced Repetition Review Modal */}
      <DailyReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        cards={dueCards}
        onRateCard={handleRateCard}
      />
    </div>
  );
}
