import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import "../../src/styles/foundation.css";
import { PdfReadingCompanion } from "../../src/components/reading/PdfReadingCompanion";
import { PdfBookRail } from "../../src/components/reading/PdfBookRail";
import type { CourseTrack } from "../../src/services/ai/types";
const track: CourseTrack = {
  id: "reading-offline-qa",
  title: "Everyday Money",
  tagline: "Authored offline UI test",
  language: null,
  difficulty: "Beginner",
  estimatedHours: 1,
  description: "A PDF reading companion fixture",
  concepts: [],
  milestones: [],
  initialPrompt: "",
  curriculum: {
    schemaVersion: 1,
    version: 1,
    scope: "curriculum",
    originalGoal: "Study this book",
    destination: "Use everyday money concepts",
    startingPoint: "Beginner",
    exclusions: [],
    modules: [],
    sourceDocument: {
      name: "Everyday Money.pdf",
      pageCount: 5,
      sections: [
        {
          id: "budget",
          title: "Build a budget",
          level: 0,
          pageStart: 3,
          pageEnd: 3,
        },
      ],
    },
  },
};
const originalFetch = window.fetch.bind(window);
// Optional real-book smoke test: no file is bundled and no AI request is needed.
if (new URLSearchParams(location.search).get("book") === "rust") {
  track.id = "reading-rust-local-qa";
  track.curriculum!.sourceDocument = {
    name: "programming-rust-systems-development-3rd.pdf",
    pageCount: 731,
    sections: [
      {
        id: "threads",
        title: "19. Threads",
        level: 0,
        pageStart: 517,
        pageEnd: 560,
      },
    ],
  };
}
let index = 0;
window.fetch = async (input, init) => {
  if (!init?.body) return originalFetch(input, init);
  const body = JSON.parse(String(init.body)),
    system = body.messages?.[0]?.content || "",
    last = body.messages?.at(-1)?.content || "{}";
  let payload: any = {};
  try {
    payload = JSON.parse(last);
  } catch {}
  let content: string;
  if (system.includes("Review one learning question"))
    content = JSON.stringify({
      answerable: true,
      confidence: "high",
      correctOptionIds: ["compare"],
      rubricValid: true,
      reasoning:
        "A budget compares income with costs; the two answers are distinct.",
    });
  else if (payload.operation === "reading-question") {
    index = Math.max(index, payload.previousWork?.length || 0) + 1;
    content = JSON.stringify({
      question:
        index === 1
          ? "Before planning spending, what should a budget compare?"
          : "You receive a fixed amount each month. What comparison helps decide how much you can spend?",
      options: [
        { id: "compare", label: "Money coming in and the costs to cover" },
        { id: "shopping", label: "Only the prices of things you want to buy" },
      ],
      correctOptionIds: ["compare"],
      multiple: false,
      explanation: "A budget connects available income with planned costs.",
    });
  } else if (payload.operation === "reading-tutoring")
    content = JSON.stringify({
      explanation:
        "### Why the comparison matters\nA budget joins two sides of the same decision: money available and the costs it needs to cover. Looking at income alone hides the bills; looking at shopping prices alone hides what you can afford.\n\n### A small worked example\nSuppose you have 100 units available and essential costs of 70 units. Comparing both leaves 30 units for flexible spending or saving. This is an original example of the idea in your reading, rather than an extra claim from the book.\n\n| Part of the plan | Amount |\n| --- | ---: |\n| Money available | 100 |\n| Essential costs | 70 |\n| Left to allocate | 30 |\n\n### Take it back to your reading\nThe passage distinguishes essential bills from flexible spending. Keep both visible when making a plan: an affordable choice depends on what remains after the costs you need to cover.",
    });
  else if (payload.operation === "reading-ask")
    content = JSON.stringify({
      explanation:
        "Compare what you receive with what needs to be paid. That makes the remaining room for flexible choices visible. This example stays within the budget idea on your selected page.",
    });
  else
    content =
      "Start with two amounts: what comes in and what must go out. For example, 100 units available and 70 in essential costs leave 30 to allocate. This is a smaller original example of the idea in your selected reading.";
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    headers: { "content-type": "application/json" },
  });
};
function Preview() {
  const [pageRequest, setPageRequest] = React.useState<{
    page: number;
    at: number;
  }>();
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "7px 20px",
          fontSize: 10,
          color: "#9fa8a2",
          borderBottom: "1px solid #303632",
        }}
      >
        Authored offline UI test · Real PDF extraction and local storage · Tutor
        replies are fixtures
      </div>
      <div className="app-body">
        <PdfBookRail
          trackId={track.id}
          source={track.curriculum!.sourceDocument!}
          onRead={() => setPageRequest(undefined)}
          onChoosePage={(page) => setPageRequest({ page, at: Date.now() })}
        />
        <PdfReadingCompanion
          track={track}
          pageRequest={pageRequest}
          onReturn={() => location.assign("./pdf-curriculum.html")}
        />
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
