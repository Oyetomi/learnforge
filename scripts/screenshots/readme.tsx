/** Authored screenshot data. Open only on a disposable localhost origin.
 * No provider calls, credentials, generated-content claims or learning outcomes.
 * /scripts/screenshots/readme.html?view=question (or feedback)
 */
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import type { ChatMessage, CheckAttempt, LearningCheck, Milestone } from "../../src/types";
import type { CourseTrack } from "../../src/services/ai/types";
import { tutoringAttemptKey } from "../../src/services/learning/tutoring";
import { loadAIConnection, saveAIConnection } from "../../src/services/ai/connection";

if (!["127.0.0.1", "localhost"].includes(location.hostname)) throw new Error("Screenshot demo is localhost-only.");
const fixtureKey = "learnforge:readme-demo-2026-11-03";
if (!localStorage.getItem(fixtureKey) && JSON.parse(localStorage.getItem("learnforge:sessions") || "[]").length)
  throw new Error("Use a fresh localhost origin. This demo will not replace existing sessions.");

const sid = "readme-percent-session", tid = "readme-percent-track", mid = "readme-percent-concept";
const intent = { interest: "Everyday percentages", goal: "Understand discounts and compare prices", practiceMode: "general" as const };
const check: LearningCheck = {
  id: `${mid}:intro-check-v1`, milestoneId: mid, practice: "independent",
  question: "A $100 jacket goes up 20%, then its new price drops 20%. What is the final price?",
  options: [{ id: "cancel", label: "$100 — back at the original price" }, { id: "base", label: "$96 — below the original price" }],
  correctOptionIds: ["base"], multiple: false,
  explanation: "The increase adds $20. The discount takes 20% of $120, which is $24. The final price is $96.",
};
const milestones: Milestone[] = [
  { id: mid, session_id: sid, title: "Why equal percentages don’t cancel", prompt: "Notice which price each percentage uses.", status: "active", created_at: 1, starter_code: "", check,
    lesson: "## Same percentage, different amount\n\nA percentage describes part of an amount. When the amount changes, the same percentage can represent a different number of dollars.\n\nFor a $100 jacket, a 20% increase adds $20. The new price is $120. A 20% discount now takes away $24, leaving $96.\n\n| Step | Price used | Change | New price |\n| --- | --- | --- | --- |\n| Increase by 20% | $100 | +$20 | $120 |\n| Decrease by 20% | $120 | −$24 | $96 |\n\nThe discount is bigger in dollars because it starts from a higher price." },
  { id: "readme-sale-prices", session_id: sid, title: "Compare two sale prices", prompt: "Compare discounts with different starting prices.", starter_code: "", status: "pending", created_at: 2, prerequisite_ids: [mid] },
  { id: "readme-tips", session_id: sid, title: "Work out a tip", prompt: "Apply percentages to a bill.", starter_code: "", status: "pending", created_at: 3, prerequisite_ids: ["readme-sale-prices"] },
];
const track: CourseTrack = { id: tid, title: "Make sense of everyday percentages", tagline: "From sale prices to everyday decisions", language: null,
  learningIntent: intent, difficulty: "Beginner", estimatedHours: 1, description: "An authored interface demonstration.", concepts: milestones.map(m => m.title), initialPrompt: "Understand the amount each percentage uses.",
  milestones: milestones.map(m => ({ id: m.id, title: m.title, concept: m.title, prompt: m.prompt,
    starter_code: m.starter_code || "", test_code: m.test_code || "", lesson: m.lesson, check: m.check, prerequisite_ids: m.prerequisite_ids })) };
const attempt: CheckAttempt = { checkId: check.id, milestoneId: mid, practice: "independent", selectedIds: ["base"], correct: true, dontKnow: false,
  thinking: "The discount is based on $120, so it takes off $24 rather than $20.", confidence: "confident", submittedAt: 2 };
const teaching = String.raw`### The amount behind the percentage

Exactly. The percentage stays the same; **the price it acts on changes**.

| Step | Percentage of which price? | Result |
| --- | --- | ---: |
| Increase | 20% of $100 = $20 added | $120 |
| Decrease | 20% of $120 = $24 removed | **$96** |

The discount removes $4 more than the increase added. That is why the price ends below $100.

You can also see both steps in one calculation:

$$100 \times 1.20 \times 0.80 = 96$$

### What if the order changes?

Discount first: $100 becomes $80. Increasing that by 20% adds $16, bringing it to $96 again. The intermediate prices differ, but the two multipliers still have the same product.

Equal percentages do not mean equal dollar changes. Always ask: **a percentage of which amount?**`;
const messages: ChatMessage[] = new URLSearchParams(location.search).get("view") === "feedback" ? [
  { id: "readme-question", session_id: sid, milestone_id: mid, role: "assistant", content: "", learning_check: check, created_at: 1 },
  { id: "readme-answer", session_id: sid, milestone_id: mid, role: "user", content: "I chose the $96 answer.", check_attempt: attempt, created_at: 2 },
  { id: "readme-tutoring", session_id: sid, milestone_id: mid, role: "assistant", content: teaching, tutoring_for_check_id: check.id, tutoring_attempt_key: tutoringAttemptKey(attempt), created_at: 3 },
] : [{ id: "readme-question", session_id: sid, milestone_id: mid, role: "assistant", content: "", learning_check: check, created_at: 1 }];

localStorage.setItem(fixtureKey, "true");
localStorage.setItem("learnforge:custom-tracks", JSON.stringify([track]));
localStorage.setItem("learnforge:active-track", tid);
localStorage.setItem("learnforge:initialized_v1", "true");
localStorage.setItem("learnforge:sessions", JSON.stringify([{ id: sid, track_id: tid, title: track.title, topic: track.tagline, language: null, learning_intent: intent, created_at: 1, updated_at: 1 }]));
localStorage.setItem("learnforge:milestones", JSON.stringify(milestones));
localStorage.setItem("learnforge:messages", JSON.stringify(messages));
localStorage.setItem("learnforge:learning-preferences", JSON.stringify({ visuals: "auto", pace: "steps", detail: "brief", retention: false }));
saveAIConnection({ ...loadAIConnection(), provider: "proxy", model: "authored-demo", fallbackModel: "authored-demo", apiKey: "" });
window.fetch = async (_url, init) => {
  const request = JSON.parse(String(init?.body || "{}"));
  if (request.messages?.[0]?.content?.startsWith("Review one learning question"))
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answerable: true, confidence: "high", correctOptionIds: ["base"], rubricValid: true, reasoning: "Authored screenshot fixture: 120 − 24 = 96." }) } }] }), { headers: { "content-type": "application/json" } });
  throw new Error("This is an authored screenshot demonstration; provider calls are disabled.");
};
const App = (await import("../../src/App")).default;
createRoot(document.getElementById("root")!).render(<App />);
