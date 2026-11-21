import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { approvedLessonIds } from "../learning/adaptation";
import { retentionRating } from "../learning/retention";
import { evaluateMathExpression } from "../learning/parameterSim";
import { normalizeMathMarkdown, isInlineMath } from "../learning/mathMarkdown";
import { sanitizeSvgMarkup } from "../learning/safeSvg";
import { extractVisualExample } from "../learning/visuals";
import { withPageRanges } from "../learning/pdfContents";
import { formatTextForSpeech } from "../learning/speech";
import { stripInternalSourceCitations } from "../learning/grounding";
import { buildHeaders, connectionFromPreset } from "../ai/connection";
import { parseDiagnostics } from "../sandbox/diagnostics";
import { runHeadline, runOutcome } from "../sandbox/runReport";
import {
  AssertionCollector,
  parseGoTestOutput,
  parseRustTestOutput,
} from "../sandbox/assertions";
import { LocalDatabase } from "../db/storage";
import { CodeBlock, highlightSource } from "../../components/chat/CodeBlock";
import { parseLadderMarkdown } from "../../components/chat/DerivationLadder";
import type { ChatMessage, CheckAttempt, LearningCheck } from "../../types";

describe("Audit regression suite", () => {
  it("preserves milestone approval after extra correct checks while revoking on failure", () => {
    const base: ChatMessage[] = [
      {
        id: "m-a1",
        session_id: "s1",
        role: "user",
        content: "a1",
        milestone_id: "m1",
        created_at: 1,
        check_attempt: {
          checkId: "c1",
          milestoneId: "m1",
          selectedIds: ["a"],
          dontKnow: false,
          thinking: "reason",
          confidence: "confident",
          correct: true,
          submittedAt: 1,
        },
      },
      {
        id: "m-a2",
        session_id: "s1",
        role: "user",
        content: "a2",
        milestone_id: "m1",
        created_at: 2,
        check_attempt: {
          checkId: "c2",
          milestoneId: "m1",
          selectedIds: ["a"],
          dontKnow: false,
          thinking: "reason 2",
          confidence: "confident",
          correct: true,
          submittedAt: 2,
        },
      },
      {
        id: "m-ready",
        session_id: "s1",
        role: "assistant",
        content: "ready",
        milestone_id: "m1",
        created_at: 3,
        competency_assessment: {
          decision: "ready",
          rationale: "Demonstrated across cases",
          evidenceCheckIds: ["c1", "c2"],
          milestoneId: "m1",
          createdAt: 3,
        },
      },
    ];
    const compressCorrect: ChatMessage = {
      id: "m-compress",
      session_id: "s1",
      role: "user",
      content: "compress",
      milestone_id: "m1",
      created_at: 4,
      check_attempt: {
        checkId: "c3",
        milestoneId: "m1",
        selectedIds: [],
        response: "Short accurate summary",
        dontKnow: false,
        thinking: "",
        confidence: "confident",
        correct: true,
        submittedAt: 4,
      },
    };
    const laterWrong: ChatMessage = {
      id: "m-fail",
      session_id: "s1",
      role: "user",
      content: "fail",
      milestone_id: "m1",
      created_at: 5,
      check_attempt: {
        checkId: "c4",
        milestoneId: "m1",
        selectedIds: ["b"],
        dontKnow: false,
        thinking: "",
        confidence: "unsure",
        correct: false,
        submittedAt: 5,
      },
    };
    expect(approvedLessonIds([...base, compressCorrect]).has("m1")).toBe(true);
    expect(approvedLessonIds([...base, compressCorrect, laterWrong]).has("m1")).toBe(false);
  });

  it("rates revealed retention checks as Again (1)", () => {
    const check: LearningCheck = {
      id: "c1",
      milestoneId: "m1",
      question: "Q",
      options: [
        { id: "a", label: "Right" },
        { id: "b", label: "Wrong" },
      ],
      correctOptionIds: ["a"],
      multiple: false,
      explanation: "Because",
    };
    const attempt: CheckAttempt = {
      checkId: "c1",
      milestoneId: "m1",
      selectedIds: ["a"],
      dontKnow: false,
      revealed: true,
      thinking: "",
      confidence: "confident",
      correct: false,
      submittedAt: Date.now(),
    };
    expect(retentionRating(check, attempt)).toBe(1);
  });

  it("evaluates unary minus vs exponentiation and blocks prototype keys in parameterSim", () => {
    expect(evaluateMathExpression("-x^2", { x: 3 })).toBe(-9);
    expect(evaluateMathExpression("(-x)^2", { x: 3 })).toBe(9);
    expect(evaluateMathExpression("2^-3", {})).toBeCloseTo(0.125);
    expect(evaluateMathExpression("2^3^2", {})).toBe(512);
    expect(evaluateMathExpression("toString(1)", {})).toBeNull();
    expect(evaluateMathExpression("constructor(1)", {})).toBeNull();
  });

  it("safely handles Object.prototype keys as CodeBlock languages", () => {
    expect(highlightSource("const x = 1;", "constructor")).toBeNull();
    const html = renderToStaticMarkup(
      <CodeBlock code="const x = 1;" language="constructor" />
    );
    expect(html).toContain("const x = 1;");
  });

  it("preserves LaTeX math starting with digits and unclosed streaming code fences", () => {
    expect(isInlineMath("1 + \\frac{dx}{dt}")).toBe(true);
    expect(isInlineMath("10 and ")).toBe(false);
    expect(normalizeMathMarkdown("Compute $1 + \\frac{dx}{dt}$ now")).toBe(
      "Compute $1 + \\frac{dx}{dt}$ now"
    );
    expect(normalizeMathMarkdown("Costs $10 and $20 total")).toContain("\\$10");
    expect(normalizeMathMarkdown("```bash\necho $HOME\n")).toBe(
      "```bash\necho $HOME\n"
    );
  });

  it("decodes percent-encoded file paths and preserves Rust note severities in diagnostics", () => {
    const out = parseDiagnostics(
      "file:///workspace/my%20app/index.js:4:2: Unexpected token)\nnote: defined here\n  --> src/lib.rs:9:3\n",
      ["my app/index.js", "src/lib.rs"]
    );
    expect(out[0]).toMatchObject({
      path: "my app/index.js",
      line: 4,
      column: 2,
      message: "Unexpected token)",
    });
    expect(out[1]).toMatchObject({
      path: "src/lib.rs",
      line: 9,
      column: 3,
      severity: "warning",
    });
  });

  it("classifies Go Playground compiler errors as build failures", () => {
    const res = {
      stdout: "",
      stderr: '# command-line-arguments\n./prog.go:4:2: imported and not used: "fmt"\n',
      exitCode: 1,
      durationMs: 20,
    };
    expect(runOutcome(res)).toBe("build");
    const headline = runHeadline(res);
    expect(headline.tone).toBe("fail");
    expect(headline.chip).toBe("Doesn’t build");
  });

  it("parses Go subtests, Rust should_panic tests, and async JS describe suites", async () => {
    const goParsed = parseGoTestOutput(
      [
        "=== RUN   TestRouter/get_user",
        "    router_test.go:18: expected 200, got 404",
        "    === RUN   nested log line",
        "--- FAIL: TestRouter/get_user (0.00s)",
        "FAIL",
      ].join("\n"),
      ""
    );
    expect(goParsed).toHaveLength(1);
    expect(goParsed[0].name).toBe("TestRouter/get_user");
    expect(goParsed[0].passed).toBe(false);
    expect(goParsed[0].error).toContain("expected 200, got 404");

    const rustParsed = parseRustTestOutput(
      "test tests::panics_on_empty - should panic ... ok\n",
      ""
    );
    expect(rustParsed).toEqual([
      { name: "tests::panics_on_empty", passed: true },
    ]);

    const collector = new AssertionCollector();
    await collector.describe("AsyncSuite", async () => {
      await Promise.resolve();
      await collector.runTest("handles microtasks", async () => {
        if (1 + 1 !== 2) throw new Error("math failed");
      });
    });
    expect(collector.getResults()[0].name).toBe("AsyncSuite > handles microtasks");
    expect(collector.getResults()[0].passed).toBe(true);
  });

  it("sanitizes XML-declared SVGs with px dimensions while rejecting xml-stylesheet", () => {
    const ok = sanitizeSvgMarkup(
      '<?xml version="1.0" encoding="UTF-8"?><svg width="120px" height="80px"><title>Demo</title><desc>A circle</desc><circle id="description" cx="40" cy="40" r="20"/></svg>'
    );
    expect(ok).not.toBeNull();
    expect(ok!.svg).toContain('viewBox="0 0 120 80"');
    expect(ok!.svg).toContain('aria-describedby="');
    expect(sanitizeSvgMarkup('<?xml-stylesheet href="//evil"?><svg></svg>')).toBeNull();
  });

  it("does not strip commas inside JS strings when repairing loose forge-visual JSON", () => {
    const raw =
      '```forge-visual\n{"kind":"canvas","title":"Array Demo","summary":"Inspect values.","takeaway":"Strings stay intact.","html":"<canvas id=\\"c\\" width=\\"400\\" height=\\"200\\"></canvas>","js":"const s = \\"a, ] b, }\\"; const ctx = document.getElementById(\\"c\\").getContext(\\"2d\\"); ctx.fillText(s, 10, 20);","items":[{"id":"i1","label":"One","description":"First"},{"id":"i2","label":"Two","description":"Second"},]}\n```';
    const visual = extractVisualExample(raw);
    expect(visual?.canvas?.js).toContain('"a, ] b, }"');
  });

  it("handles same-page PDF siblings and does not bridge across unmapped chapters", () => {
    const sections = withPageRanges(
      [
        { id: "s1", title: "1.1 Intro", level: 1, pageStart: 5 },
        { id: "s2", title: "1.2 Same Page", level: 1, pageStart: 5 },
        { id: "s3", title: "1.3 Missing", level: 1, pageStart: undefined },
        { id: "s4", title: "1.4 Later", level: 1, pageStart: 12 },
      ],
      20
    );
    expect(sections[0].pageEnd).toBe(5);
    expect(sections[1].pageEnd).toBeUndefined();
    expect(sections[3].pageEnd).toBe(20);
  });

  it("never sends Authorization header for authMode=none providers", () => {
    const ollama = { ...connectionFromPreset("ollama"), apiKey: "sk-secret" };
    const headers = buildHeaders(ollama);
    expect(headers.Authorization).toBeUndefined();
  });

  it("preserves comparison > in speech formatting and strips bare SOURCE tags", () => {
    expect(formatTextForSpeech("> Quote line\nCheck x > 5 now")).toBe(
      "Quote line Check x > 5 now"
    );
    expect(
      stripInternalSourceCitations(
        "The invariant holds SOURCE source-ab12cd L1-L4 and `source-ab12cd`."
      )
    ).toBe("The invariant holds and `source-ab12cd`.");
  });

  it("supports deleteCardsForMilestone, skipRating, and clean markdown export fences", () => {
    const store = new LocalDatabase({ indexedDB: null });
    const session = store.createSession({
      title: "Economics",
      topic: "Supply and Demand",
      language: null,
    });
    const m = store.createMilestone({
      session_id: session.id,
      title: "Unit 1",
      prompt: "Explain equilibrium",
      starter_code: "sample",
      status: "completed",
    });
    store.createCard({
      session_id: session.id,
      milestone_id: m.id,
      topic: "Economics: Unit 1",
      prompt: "Q",
      answer: "A",
    });
    expect(store.exportSessionMarkdown(session.id)).not.toContain("```null");
    expect(store.deleteCardsForMilestone(m.id)).toBe(true);
    expect(store.getAllCards()).toHaveLength(0);
  });

  it("parses ladder blocks with step text and CRLF line endings", () => {
    const ladder = parseLadderMarkdown(
      "title: Demo\r\ninitial: start\r\nstep: Apply rule\r\nwhy: Explains why\r\nstate: done\r\n"
    );
    expect(ladder).not.toBeNull();
    expect(ladder?.steps[0].rule).toBe("Apply rule");
    expect(ladder?.steps[0].explanation).toBe("Explains why");
  });
});
