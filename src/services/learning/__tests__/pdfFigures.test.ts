import { describe, expect, it } from "vitest";
import type { LearningReference } from "../../../types";
import { extractBookFigures, pdfPageRanges } from "../pdfFigures";

describe("pdfFigures", () => {
  it("extracts figures, diagrams, and listings across multi-page Go in Action 2e text", () => {
    const refs: LearningReference[] = [
      {
        id: "go-ch4",
        name: "Go in Action 2e · Chapter 4: Arrays, Slices, and Maps",
        truncated: false,
        pdfPageStart: 125,
        pdfPageEnd: 158,
        content: [
          "PDF page 129",
          "Slices provide a dynamic view over an underlying array.",
          "Figure 4.12 A slice header pointing to an underlying array",
          "Listing 4.3: Creating a slice with make and setting length and capacity",
          "",
          "PDF page 131",
          "Fig. 4.13: Backing array reallocation after append exceeds capacity",
          "Diagram 4.1 - Memory layout of a three-word slice header",
        ].join("\n"),
      },
      {
        id: "go-ch9",
        name: "Go in Action 2e · Chapter 9: Testing and Benchmarking",
        truncated: false,
        pdfPageStart: 292,
        pdfPageEnd: 318,
        content: [
          "PDF page 295",
          "Listing 9.1 — Basic unit test for validating an HTTP endpoint",
          "PDF page 298",
          "Figure 9.3: Parallel subtest execution flow in go test",
        ].join("\n"),
      },
    ];

    const figures = extractBookFigures(refs);
    expect(figures).toHaveLength(6);
    expect(figures.map((f) => `${f.kind}:${f.label}@${f.page}`)).toEqual([
      "figure:Figure 4.12@129",
      "listing:Listing 4.3@129",
      "figure:Figure 4.13@131",
      "figure:Diagram 4.1@131",
      "listing:Listing 9.1@295",
      "figure:Figure 9.3@298",
    ]);
    expect(figures[0]).toMatchObject({
      page: 129,
      kind: "figure",
      label: "Figure 4.12",
      caption: "A slice header pointing to an underlying array",
      sourceName: "Go in Action 2e · Chapter 4: Arrays, Slices, and Maps",
    });
    expect(figures[4]).toMatchObject({
      page: 295,
      kind: "listing",
      label: "Listing 9.1",
      caption: "Basic unit test for validating an HTTP endpoint",
      sourceName: "Go in Action 2e · Chapter 9: Testing and Benchmarking",
    });
  });

  it("deduplicates repeated captions by kind, normalized label, and page", () => {
    const refs: LearningReference[] = [
      {
        id: "ref-a",
        name: "Go in Action 2e · Ch 4",
        truncated: false,
        pdfPageStart: 129,
        pdfPageEnd: 135,
        content: [
          "PDF page 129",
          "Figure 4.12 A slice header pointing to an underlying array",
          "Fig. 4.12: A slice header pointing to an underlying array",
          "Listing 9.1 - First occurrence on page 129",
        ].join("\n"),
      },
      {
        id: "ref-b",
        name: "Go in Action 2e · Ch 4 excerpt",
        truncated: false,
        pdfPageStart: 129,
        pdfPageEnd: 130,
        content: [
          "PDF page 129",
          "FIGURE 4.12 — Duplicate across reference",
          "listing 9.1: Duplicate listing on same page",
          "PDF page 130",
          "Figure 4.12 Same label on a different page stays distinct",
        ].join("\n"),
      },
    ];

    const figures = extractBookFigures(refs);
    expect(figures.map((f) => `${f.kind}:${f.label}@${f.page}`)).toEqual([
      "figure:Figure 4.12@129",
      "listing:Listing 9.1@129",
      "figure:Figure 4.12@130",
    ]);
  });

  it("uses pdfPageStart when captions appear before an explicit PDF page marker and ignores non-PDF notes", () => {
    const refs: LearningReference[] = [
      {
        id: "plain-md",
        name: "study-notes.md",
        truncated: false,
        content: "Figure 1.1 This markdown note has no PDF page markers",
      },
      {
        id: "pdf-no-marker",
        name: "Go in Action 2e · Ch 2",
        truncated: false,
        pdfPageStart: 42,
        pdfPageEnd: 44,
        content: "Figure 2.1 Architecture of the RSS feed matcher",
      },
    ];

    const figures = extractBookFigures(refs);
    expect(figures).toHaveLength(1);
    expect(figures[0]).toMatchObject({
      page: 42,
      kind: "figure",
      label: "Figure 2.1",
      caption: "Architecture of the RSS feed matcher",
    });
  });

  it("caps results at 24 while prioritizing figures before listings and sorting by page ascending", () => {
    const lines: string[] = [];
    for (let i = 1; i <= 10; i++) {
      lines.push(`PDF page ${i}`);
      lines.push(`Listing 1.${i}: Early listing sample number ${i}`);
    }
    for (let i = 1; i <= 20; i++) {
      lines.push(`PDF page ${100 + i}`);
      lines.push(`Figure 5.${i}: Detailed diagram number ${i}`);
    }

    const refs: LearningReference[] = [
      {
        id: "many",
        name: "Go in Action 2e · Full Book",
        truncated: false,
        pdfPageStart: 1,
        pdfPageEnd: 200,
        content: lines.join("\n"),
      },
    ];

    const figures = extractBookFigures(refs);
    expect(figures).toHaveLength(24);
    expect(figures.filter((f) => f.kind === "figure")).toHaveLength(20);
    expect(figures.filter((f) => f.kind === "listing")).toHaveLength(4);

    // Final output must still be sorted by page ascending.
    for (let i = 1; i < figures.length; i++) {
      expect(figures[i].page).toBeGreaterThanOrEqual(figures[i - 1].page);
    }
    // Earliest 4 listings (pages 1..4) come first, followed by all 20 figures (pages 101..120).
    expect(figures.slice(0, 4).map((f) => f.page)).toEqual([1, 2, 3, 4]);
    expect(figures[4].page).toBe(101);
    expect(figures[23].page).toBe(120);
  });

  it("returns empty arrays for undefined or empty inputs", () => {
    expect(extractBookFigures(undefined)).toEqual([]);
    expect(extractBookFigures([])).toEqual([]);
    expect(pdfPageRanges(undefined)).toEqual([]);
    expect(pdfPageRanges([])).toEqual([]);
  });

  it("collects valid PDF page ranges sorted by start page and skips invalid entries", () => {
    const refs: LearningReference[] = [
      {
        id: "web",
        name: "Go Spec",
        truncated: false,
        content: "Web reference without page numbers",
      },
      {
        id: "ch9",
        name: "Go in Action 2e · Chapter 9",
        truncated: false,
        pdfPageStart: 292,
        pdfPageEnd: 318,
        content: "Chapter 9 digest",
      },
      {
        id: "invalid-order",
        name: "Broken range",
        truncated: false,
        pdfPageStart: 50,
        pdfPageEnd: 40,
        content: "Invalid end before start",
      },
      {
        id: "invalid-start",
        name: "Zero start",
        truncated: false,
        pdfPageStart: 0,
        pdfPageEnd: 12,
        content: "Invalid zero start",
      },
      {
        id: "ch4",
        name: "Go in Action 2e · Chapter 4",
        truncated: false,
        pdfPageStart: 125,
        pdfPageEnd: 158,
        content: "Chapter 4 digest",
      },
      {
        id: "ch4-dup",
        name: "Go in Action 2e · Chapter 4",
        truncated: false,
        pdfPageStart: 125,
        pdfPageEnd: 158,
        content: "Duplicate range",
      },
    ];

    expect(pdfPageRanges(refs)).toEqual([
      { sourceName: "Go in Action 2e · Chapter 4", start: 125, end: 158 },
      { sourceName: "Go in Action 2e · Chapter 9", start: 292, end: 318 },
    ]);
  });
});
