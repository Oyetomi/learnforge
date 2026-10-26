/**
 * Verification test suite for LearnForge Socratic AI Service
 */

import {
  parseChallengeFromResponse,
  extractCleanResponse,
  buildSocraticSystemPrompt,
  formatConversationMessages,
  streamSocraticChat,
  getAllTracks,
  getTrackById,
  createSessionFromTrack,
  STARTER_TRACKS,
  AI_CONFIG,
} from './index';

import type { ChatMessage, Milestone } from './types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('--- 1. Testing Challenge Parser ---');

// Test Case 1: Standard forge-challenge block
const mockAiResponse1 = `That makes total sense! Now let's try writing the worker pool.

\`\`\`forge-challenge
title: Worker Pool Fan-Out
language: go
prompt: Implement a 3-worker pool that doubles integers.
starter_code:
package main
func Worker() {}
test_code:
package main
func TestWorker() {}
\`\`\`

Let me know what questions you have!`;

const parsed1 = parseChallengeFromResponse(mockAiResponse1);
assert(parsed1 !== null, 'parsed1 should not be null');
assert(parsed1?.title === 'Worker Pool Fan-Out', 'Title mismatch');
assert(parsed1?.language === 'go', 'Language mismatch');
assert(parsed1?.prompt === 'Implement a 3-worker pool that doubles integers.', 'Prompt mismatch');
assert(Boolean(parsed1?.starter_code.includes('func Worker() {}')), 'Starter code mismatch');
assert(Boolean(parsed1?.test_code.includes('func TestWorker() {}')), 'Test code mismatch');
console.log('✓ Standard forge-challenge parsed successfully');

// Test Case 2: Multi-line prompt and inner code blocks
const mockAiResponse2 = `
\`\`\`forge-challenge
title: Rust Lifetimes
language: rust
prompt:
The longest function must return the longer slice.
Ensure you tie the lifetimes together with 'a.
starter_code:
\`\`\`rust
fn longest(x: &str, y: &str) -> &str {
    x
}
\`\`\`
test_code:
\`\`\`rust
#[test]
fn test_longest() {}
\`\`\`
\`\`\`
`;

const parsed2 = parseChallengeFromResponse(mockAiResponse2);
assert(parsed2 !== null, 'parsed2 should not be null');
assert(parsed2?.title === 'Rust Lifetimes', 'Title mismatch 2');
assert(parsed2?.language === 'rust', 'Language mismatch 2');
assert(Boolean(parsed2?.prompt.includes('Ensure you tie the lifetimes')), 'Prompt multiline mismatch');
assert(Boolean(parsed2?.starter_code.includes('fn longest')), 'Inner fence not stripped');
assert(!parsed2?.starter_code.startsWith('```'), 'Starter code should not have outer backticks');
console.log('✓ Multi-line prompt and nested fences parsed successfully');

// Test Case 3: extractCleanResponse separates conversation from challenge
const cleanResult = extractCleanResponse(mockAiResponse1);
assert(cleanResult.hasChallenge === true, 'cleanResult should have challenge');
assert(cleanResult.challenge?.title === 'Worker Pool Fan-Out', 'cleanResult title mismatch');
assert(cleanResult.conversationalText.startsWith('That makes total sense!'), 'conversational text start mismatch');
assert(cleanResult.conversationalText.endsWith('Let me know what questions you have!'), 'conversational text end mismatch');
assert(!cleanResult.conversationalText.includes('```forge-challenge'), 'Conversational text should not have raw block');
console.log('✓ extractCleanResponse cleanly decoupled UI text from challenge block');

// Test Case 4: Non-challenge response returns null
const noChallengeText = "In Go, `(*T)(nil)` checks if *T implements an interface at compile time.";
const parsedNone = parseChallengeFromResponse(noChallengeText);
assert(parsedNone === null, 'parsedNone should be null');
const cleanNone = extractCleanResponse(noChallengeText);
assert(cleanNone.hasChallenge === false, 'cleanNone should not have challenge');
assert(cleanNone.conversationalText === noChallengeText, 'cleanNone conversational text mismatch');
console.log('✓ Non-challenge response handled safely');

console.log('\n--- 2. Testing Prompt Construction ---');
const dummyMilestone: Milestone = {
  id: 'm1',
  session_id: 's1',
  title: 'Unbuffered Channels',
  prompt: 'Fix the deadlock',
  starter_code: 'package main',
  test_code: 'func TestDeadlock() {}',
  status: 'active',
  created_at: Date.now(),
};

const dummyCode = `func SendMessage() { ch <- "hello" }`;

const promptWithContext = buildSocraticSystemPrompt(dummyMilestone, dummyCode, 'go');
assert(promptWithContext.includes('Hear and forget. See and remember. Build and understand.'), 'Missing core axiom');
assert(promptWithContext.includes('ACTIVE MILESTONE CONTEXT'), 'Missing active milestone');
assert(promptWithContext.includes('Unbuffered Channels'), 'Missing milestone title');
assert(promptWithContext.includes('STUDENT\'S CURRENT EDITOR CODE'), 'Missing current code section');
assert(promptWithContext.includes('func SendMessage()'), 'Missing student code content');
assert(promptWithContext.includes('NEVER DUMP FULL CODE SOLUTIONS'), 'Missing Socratic rule');
assert(promptWithContext.includes('THE "NEVER-LOCKED COMPOSER"'), 'Missing never locked composer');
console.log('✓ Socratic system prompt built with full context');

const chatMessages: ChatMessage[] = [
  { id: '1', session_id: 's1', role: 'user', content: 'What is a channel?', created_at: 1 },
  { id: '2', session_id: 's1', role: 'assistant', content: 'A channel is a conduit.', created_at: 2 },
  { id: '3', session_id: 's1', role: 'user', content: 'Can I do this?', code_snippet: 'ch := make(chan int)', created_at: 3 },
];

const formatted = formatConversationMessages(chatMessages, promptWithContext);
assert(formatted[0].role === 'system', 'First message must be system');
assert(formatted[1].role === 'user', 'Second message role mismatch');
assert(formatted[3].content.includes('ch := make(chan int)'), 'Code snippet not appended');
console.log('✓ Conversation messages formatted cleanly');

console.log('\n--- 3. Testing Starter Curriculum Tracks ---');
const tracks = getAllTracks();
assert(tracks.length === 4, `Expected 4 tracks, found ${tracks.length}`);

for (const track of tracks) {
  assert(track.id.length > 0, 'Track missing id');
  assert(track.title.length > 0, 'Track missing title');
  assert(track.milestones.length >= 4, `Track ${track.id} has fewer than 4 milestones`);
  for (const m of track.milestones) {
    assert(m.title.length > 0, `Milestone ${m.id} missing title`);
    assert(m.starter_code.trim().length > 0, `Milestone ${m.id} missing starter code`);
    assert(m.test_code.trim().length > 0, `Milestone ${m.id} missing test code`);
  }
}
console.log(`✓ All 4 tracks validated (${tracks.map(t => t.title).join(', ')})`);

const goTrack = getTrackById('go-concurrency');
assert(goTrack !== undefined, 'Go track should exist');
if (goTrack) {
  const sessionData = createSessionFromTrack(goTrack);
  assert(sessionData.session.title === goTrack.title, 'Session title mismatch');
  assert(sessionData.firstMilestone.title === goTrack.milestones[0].title, 'First milestone mismatch');
  assert(sessionData.initialMessage.content.includes('```forge-challenge'), 'Initial message missing challenge block');
  console.log('✓ createSessionFromTrack instantiated session successfully');
}

console.log('\n--- 4. Testing Live Proxy Streaming Integration ---');
async function testLiveStreaming() {
  let chunksReceived = 0;
  let fullResponse = '';

  const testMessages: ChatMessage[] = [
    {
      id: 'test-1',
      session_id: 'test-session',
      role: 'user',
      content: 'In 1 sentence, what is a Goroutine?',
      created_at: Date.now(),
    },
  ];

  console.log(`Sending streaming request to ${AI_CONFIG.DEFAULT_API_URL} (model: ${AI_CONFIG.DEFAULT_MODEL})...`);

  try {
    const result = await streamSocraticChat(testMessages, undefined, undefined, {
      onChunk: (chunk) => {
        chunksReceived++;
        fullResponse += chunk;
        process.stdout.write(chunk);
      },
      onComplete: (full) => {
        console.log('\n[Stream Complete Callback Fired]');
      },
    });

    console.log(`\n✓ Stream completed. Received ${chunksReceived} chunks. Full response length: ${result.length}`);
    assert(chunksReceived > 0, 'Should have received at least 1 chunk');
    assert(result.length > 10, 'Response should not be empty');
    assert(result === fullResponse, 'Return value should match accumulated chunks');
  } catch (err) {
    console.error('Streaming test failed:', err);
    throw err;
  }
}

async function testAbortController() {
  console.log('\nTesting AbortController cancellation...');
  const controller = new AbortController();
  const testMessages: ChatMessage[] = [
    {
      id: 'test-abort',
      session_id: 'test-session',
      role: 'user',
      content: 'Write an extensive guide to memory allocation in Go and Rust with 50 paragraphs.',
      created_at: Date.now(),
    },
  ];

  let aborted = false;
  // Abort after 100ms
  setTimeout(() => {
    controller.abort();
  }, 100);

  try {
    await streamSocraticChat(testMessages, undefined, undefined, {
      abortSignal: controller.signal,
      onChunk: () => {
        // received some chunk
      },
    });
  } catch (err: any) {
    if (err.name === 'AbortError' || (err instanceof DOMException && err.name === 'AbortError')) {
      aborted = true;
      console.log('✓ AbortController cleanly cancelled the stream with AbortError');
    } else {
      throw err;
    }
  }

  assert(aborted, 'Stream should have been aborted');
}

async function testFallbackRecovery() {
  console.log('\nTesting Fallback Recovery (invalid primary model -> gemini-3.8-flash-high fallback)...');
  const testMessages: ChatMessage[] = [
    {
      id: 'test-fb',
      session_id: 'test-session',
      role: 'user',
      content: 'Reply with the word "RECOVERED"',
      created_at: Date.now(),
    },
  ];

  let chunkCount = 0;
  const result = await streamSocraticChat(testMessages, undefined, undefined, {
    model: 'invalid-non-existent-model-xyz',
    fallbackModel: 'gemini-3.8-flash-high',
    onChunk: () => {
      chunkCount++;
    },
  });

  console.log(`Fallback response: ${result.trim()}`);
  assert(chunkCount > 0, 'Fallback should have streamed chunks');
  assert(result.length > 0, 'Fallback response should not be empty');
  console.log('✓ Automatic fallback from failing model succeeded cleanly');
}

async function runAll() {
  await testLiveStreaming();
  await testAbortController();
  await testFallbackRecovery();
  console.log('\n==========================================');
  console.log('ALL TESTS PASSED WITH 100% SUCCESS!');
  console.log('==========================================');
}

runAll().catch((err) => {
  console.error('Tests failed:', err);
  process.exit(1);
});
