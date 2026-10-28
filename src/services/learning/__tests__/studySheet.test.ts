import { describe, expect, it, vi } from "vitest";
import {
  buildAnkiTsv,
  buildStudySheet,
  buildStudySheetMarkdown,
} from "../studySheet";
import { extractPdfText, extractTextFromFile } from "../fileExtractor";
import { suggestTopics } from "../../ai/interests";
import { approveLearningPlan } from "../placement";
import type { ChatMessage, Milestone } from "../../../types";
import type { CourseTrack } from "../../ai/types";

const milestones: Milestone[] = [
  {
    id: "m1",
    session_id: "s1",
    title: "Unbuffered Channels",
    prompt: "Understand synchronous handoff.",
    lesson: "An unbuffered channel requires both sender and receiver to meet.",
    starter_code: "",
    status: "completed",
    created_at: 0,
    check: {
      question: "What happens when sending to an unbuffered channel with no receiver?",
      options: [
        { id: "a", label: "The goroutine blocks until a receiver is ready." },
        { id: "b", label: "The value is buffered in memory." },
      ],
      correctOptionIds: ["a"],
      explanation: "Unbuffered channels have zero capacity and block until handoff.",
      multiple: false,
    },
  },
];

const messages: ChatMessage[] = [
  {
    id: "msg-1",
    session_id: "s1",
    role: "user",
    content: "Attempt",
    created_at: 1,
    check_attempt: {
      checkId: "m1:intro-check-v1",
      milestoneId: "m1",
      selectedIds: ["a"],
      retriedOptionIds: ["b"],
      dontKnow: false,
      thinking: "Thought it had a 1-slot buffer at first.",
      confidence: "confident",
      correct: true,
      assisted: true,
      submittedAt: 1,
    },
  },
];

describe("Study Sheet & Anki deck export (#166, #11) and Plan Approval (#252)", () => {
  it("synthesizes concepts, repaired mistakes, and verified checks into Markdown and Anki TSV", () => {
    const sheet = buildStudySheet(milestones, messages);
    expect(sheet.concepts).toHaveLength(1);
    expect(sheet.repairedMistakes).toHaveLength(1);
    expect(sheet.repairedMistakes[0].chosenAnswer).toContain("buffered in memory");
    expect(sheet.verifiedChecks).toHaveLength(1);

    const md = buildStudySheetMarkdown("Go Concurrency", milestones, messages);
    expect(md).toContain("# Go Concurrency — Study Sheet");
    expect(md).toContain("## Answers to Revisit");
    expect(md).toContain("*Initial trap:* The value is buffered in memory.");
    expect(md).toContain("## Confidence Calibration");
    expect(md).toContain("Confident answer to revisit:");
    expect(sheet.calibration.overconfidentTraps).toHaveLength(1);

    const tsv = buildAnkiTsv("Go Concurrency", milestones, messages);
    expect(tsv).toContain("What happens when sending to an unbuffered channel");
    expect(tsv).toContain("revisit");
  });

  it("extracts readable text from local code/markdown files and PDF text streams and passes it to suggestTopics", async () => {
    const fakePdf =
      "%PDF-1.4\n1 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 712 Td (Goroutines and Channels) Tj ET\nendstream\nendobj";
    const pdfBytes = new TextEncoder().encode(fakePdf);
    const extractedPdf = await extractPdfText(pdfBytes);
    expect(extractedPdf).toContain("Goroutines and Channels");

    const fakeMdFile = {
      name: "notes.md",
      type: "text/markdown",
      text: async () => "# Raft Consensus\nLeader election uses randomized timeouts.",
    } as unknown as File;
    const extractedMd = await extractTextFromFile(fakeMdFile);
    expect(extractedMd).toContain("Leader election uses randomized timeouts.");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  topics: [
                    {
                      title: "Raft Leader Election",
                      why: "From your notes.md file.",
                      goal: "Understand randomized election timeouts.",
                    },
                    {
                      title: "Split Votes in Raft",
                      why: "Covers how Raft resolves simultaneous candidates.",
                      goal: "Trace what happens when two nodes split votes.",
                    },
                  ],
                }),
              },
            },
          ],
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const suggestions = await suggestTopics("Learn my notes", undefined, {
      name: "notes.md",
      content: extractedMd,
    });
    expect(suggestions).toHaveLength(2);
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.messages[1].content).toContain("Attached reference material (notes.md)");
    expect(sentBody.messages[1].content).toContain("Leader election uses randomized timeouts.");
    vi.unstubAllGlobals();
  });

  it("keeps deferred concepts and their prerequisite references on plan approval (#252)", () => {
    const track: CourseTrack = {
      id: "t1",
      title: "Go",
      tagline: "Concurrency",
      language: "go",
      difficulty: "Beginner",
      estimatedHours: 2,
      description: "Desc",
      concepts: ["c1"],
      initialPrompt: "Hi",
      milestones: [
        {
          id: "m1",
          title: "Step 1",
          concept: "C1",
          prompt: "P1",
          starter_code: "",
          test_code: "",
          prerequisite_ids: [],
          hints: [],
        },
        {
          id: "m2",
          title: "Step 2",
          concept: "C2",
          prompt: "P2",
          starter_code: "",
          test_code: "",
          prerequisite_ids: ["m1"],
          hints: [],
        },
      ],
    };
    const approved = approveLearningPlan(track, [], new Set(["m1"]));
    expect(approved.milestones).toEqual(track.milestones);
    expect(approved.milestones[1].prerequisite_ids).toEqual(["m1"]);
    expect(approved.placement?.deferredMilestoneIds).toEqual(["m1"]);
    expect(approved.placement?.startMilestoneId).toBe("m1");
  });
});
