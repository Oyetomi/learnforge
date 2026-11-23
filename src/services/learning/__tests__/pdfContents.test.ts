import { describe, expect, it } from "vitest";
import { buildChapterDigest, mainPdfSections, readableFileTitle, sectionsFromContents, selectedPdfSource, selectedPdfSubheadings, togglePdfSection, withPageRanges, type PdfBook } from "../pdfContents";
import { referenceContext } from "../grounding";

describe("PDF table of contents", () => {
  it("detects explicit listings and resolves printed page labels without treating them as PDF indexes", () => {
    const pages = ["Cover", "Contents\n1. Budget .... 1\n1.1 Needs .... 2\n2. Saving .... 3", "1. Budget\nA budget", "1.1 Needs\nCosts", "2. Saving\nReserve money"];
    const sections = sectionsFromContents(pages, ["i", "ii", "1", "2", "3"]);
    expect(sections.map(s => [s.title, s.level, s.pageStart, s.pageEnd])).toEqual([
      ["1. Budget", 0, 3, 4], ["1.1 Needs", 1, 4, 4], ["2. Saving", 0, 5, 5],
    ]);
    expect(mainPdfSections(sections).map(s => s.title)).toEqual(["1. Budget", "2. Saving"]);
  });
  it("keeps unknown page ranges explicit and does not invent a contents listing from ordinary prose", () => {
    expect(sectionsFromContents(["Chapter 1\nThis book has 12 pages.\nBudget  1"])).toEqual([]);
    expect(sectionsFromContents(["Contents\nA chapter .... 40", "Body"])[0].pageStart).toBeUndefined();
  });
  it("uses the next peer chapter for a parent range and exposes chapters below a book wrapper", () => {
    const sections = withPageRanges([{id:"book",title:"Book",level:0,pageStart:1}, {id:"a",title:"A",level:1,pageStart:2},
      {id:"aa",title:"A detail",level:2,pageStart:3}, {id:"b",title:"B",level:1,pageStart:5}], 9);
    expect(sections.map(s => s.pageEnd)).toEqual([9,4,4,9]);
    expect(mainPdfSections(sections).map(s => s.id)).toEqual(["a","b"]);
  });
  it("defaults to the chapters inside Part groupings, but keeps ordinary chapters that have sections", () => {
    const parts = [
      {id:"p1",title:"Part I: Describing data",level:0}, {id:"c1",title:"1. Averages",level:1}, {id:"s1",title:"1.1 Example",level:2},
      {id:"c2",title:"2. Spread",level:1}, {id:"p2",title:"Part II: Uncertainty",level:0}, {id:"c3",title:"3. Sampling",level:1},
      {id:"ix",title:"Index",level:0},
    ];
    expect(mainPdfSections(parts).map(s => s.id)).toEqual(["c1","c2","c3"]);
    const bookWithSubs: PdfBook = {
      name: "Stats.pdf",
      pageCount: 10,
      pages: Array(10).fill(""),
      sections: parts,
      contentsFrom: "bookmarks",
      truncated: false,
    };
    expect(selectedPdfSubheadings(bookWithSubs, ["c1", "c2"])).toEqual({ c1: ["1.1 Example"] });
    const chapters = [{id:"c1",title:"Chapter 1: Averages",level:0}, {id:"s1",title:"1.1 Example",level:1},
      {id:"c2",title:"Chapter 2: Spread",level:0}, {id:"s2",title:"2.1 Example",level:1}];
    expect(mainPdfSections(chapters).map(s => s.id)).toEqual(["c1","c2"]);
  });
  it("turns a file name into a readable title without recasing deliberate capitals", () => {
    expect(readableFileTitle("practical-statistics.pdf")).toBe("Practical Statistics");
    expect(readableFileTitle("everyday_money__2e.PDF")).toBe("Everyday Money 2e");
    expect(readableFileTitle("SQL in 10 minutes.pdf")).toBe("SQL in 10 minutes");
  });
  it("never keeps a section and the section that contains it selected together", () => {
    const outline = [{id:"p1",title:"Part I",level:0}, {id:"c1",title:"1",level:1}, {id:"s1",title:"1.1",level:2},
      {id:"c2",title:"2",level:1}, {id:"p2",title:"Part II",level:0}, {id:"c3",title:"3",level:1}];
    // Choosing a part replaces its chapters and sections, but not other parts' chapters.
    expect(togglePdfSection(outline, ["c1","s1","c3"], "p1")).toEqual(["c3","p1"]);
    // Choosing a section replaces the chapter and part that contain it.
    expect(togglePdfSection(outline, ["p1","c2"], "s1")).toEqual(["c2","s1"]);
    expect(togglePdfSection(outline, ["c1","c2"], "c1")).toEqual(["c2"]);
  });
  it("saves only selected chapter text with physical page provenance and distinguishes headings-only material", () => {
    const book: PdfBook = {name:"Book.pdf",pageCount:3,pages:["Budget text","Savings text","Other text"],contentsFrom:"bookmarks",truncated:false,
      sections:[{id:"a",title:"Budget",level:0,pageStart:1,pageEnd:1},{id:"b",title:"Savings",level:0,pageStart:2,pageEnd:2},{id:"c",title:"Unread chapter",level:0}]};
    const {source,references} = selectedPdfSource(book,["b","c"]);
    expect(source.sections.map(s=>s.id)).toEqual(["b","c"]);
    expect(references[0]).toMatchObject({sectionId:"b",pdfPageStart:2,pdfPageEnd:2});
    expect(references[0].content).toContain("Savings text");
    expect(references[0].content).not.toContain("Budget text");
    expect(references[1].outlineOnly).toBe(true);
    expect(()=>selectedPdfSource(book,[])).toThrow("Choose at least");
  });
  it("retrieves a relevant later chapter rather than stopping after the first six sources", () => {
    const refs = Array.from({length:10},(_,i)=>({id:`r${i}`,name:`Chapter ${i}`,content:i===9?"Emergency reserves cover unexpected costs.":"Unrelated opening text.",truncated:false}));
    expect(referenceContext(refs,"Emergency reserves",300)).toContain("Emergency reserves cover unexpected costs.");
  });

  it("buildChapterDigest preserves opening, middle project/code listings, and closing summary of a 65,000-char chapter", () => {
    const filler = "Background conceptual prose discussing history and motivation without code snippets. ".repeat(22);
    const pages = Array.from({ length: 36 }, (_, idx) => {
      const pageNum = idx + 1;
      if (pageNum === 1) return { number: 1, text: `Chapter 4 Intro\nGoal: Design a workspace-backed CLI tool.\n${filler}` };
      if (pageNum === 2) return { number: 2, text: `Chapter 4 Architecture Overview\nSetting up the module layout.\n${filler}` };
      if (pageNum === 16) {
        return {
          number: 16,
          text: `Project Iteration 1\nListing 4.1 main.go and go.mod\npackage main\ntype Config struct { Port int }\nfunc main() { /* CLI entrypoint */ }\n${filler}`,
        };
      }
      if (pageNum === 24) {
        return {
          number: 24,
          text: `Listing 4.4 handler and endpoint tests\nExample: benchmark and fuzz testing with go.work workspace\ntype Store interface { Get(id string) error }\n${filler}`,
        };
      }
      if (pageNum === 36) {
        return {
          number: 36,
          text: `Putting it all together\nSummary: You built a modular CLI and verified it with tests.\n${filler}`,
        };
      }
      return { number: pageNum, text: `Section prose on page ${pageNum}.\n${filler}` };
    });

    const fullLength = pages.map((p) => `PDF page ${p.number}\n${p.text}`).join("\n\n").length;
    expect(fullLength).toBeGreaterThan(65000);

    const digest = buildChapterDigest(pages, 24000);
    expect(digest.truncated).toBe(true);
    expect(digest.text.length).toBeLessThanOrEqual(24000);
    expect(digest.text).toContain("PDF page 1\nChapter 4 Intro");
    expect(digest.text).toContain("PDF page 2\nChapter 4 Architecture Overview");
    expect(digest.text).toContain("Listing 4.1 main.go and go.mod");
    expect(digest.text).toContain("Listing 4.4 handler and endpoint tests");
    expect(digest.text).toContain("PDF page 36\nPutting it all together");
    expect(digest.text).toContain("[... skipped intermediate pages ...]");

    // Verify selected pages appear in strictly ascending order.
    const pageNumbers = Array.from(digest.text.matchAll(/^PDF page (\d+)$/gm), (m) => Number(m[1]));
    expect(pageNumbers.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < pageNumbers.length; i++) {
      expect(pageNumbers[i]).toBeGreaterThan(pageNumbers[i - 1]);
    }

    // Also verify selectedPdfSource preserves late-chapter project pages via buildChapterDigest.
    const book: PdfBook = {
      name: "Go in Action 2e",
      pageCount: pages.length,
      pages: pages.map((p) => p.text),
      sections: [{ id: "ch4", title: "Chapter 4", level: 0, pageStart: 1, pageEnd: pages.length }],
      contentsFrom: "bookmarks",
      truncated: false,
      readPages: pages.map((p) => p.number),
    };
    const { references } = selectedPdfSource(book, ["ch4"]);
    expect(references[0].truncated).toBe(true);
    expect(references[0].content).toContain("Listing 4.1 main.go and go.mod");
    expect(references[0].content).toContain("Putting it all together");
  });

  it("referenceContext with sourceLimit 180000 and prioritizeProjects finds project chunks past offset 30,000 in reading order", () => {
    const openingLines = Array.from(
      { length: 450 },
      (_, i) => `Narrative paragraph line ${i + 1} covering conceptual background without concrete syntax.`
    );
    const earlyProjectLines = [
      "Listing 5.1 project goal and workspace setup in go.work and go.mod",
      "package main",
      "type Worker struct { ID int }",
      "func NewWorker() *Worker { return &Worker{ID: 1} }",
    ];
    const middleLines = Array.from(
      { length: 50 },
      (_, i) => `Transitional commentary line ${i + 1} explaining design choices.`
    );
    const lateProjectLines = [
      "Listing 5.4 main.go CLI command handler endpoint and benchmark test",
      "type Store interface { Save() error }",
      "func RunServer(store Store) error { return store.Save() }",
      "Exercise: extend the handler with fuzz testing.",
    ];
    const fullContent = [
      ...openingLines,
      ...earlyProjectLines,
      ...middleLines,
      ...lateProjectLines,
    ].join("\n");

    const projectOffset = fullContent.indexOf("Listing 5.1");
    expect(projectOffset).toBeGreaterThan(30000);

    const ref = {
      id: "pdf-full:ch5",
      name: "Go in Action 2e · Chapter 5",
      content: fullContent,
      truncated: false,
    };

    const ctx = referenceContext([ref], "workspace architecture", 2500, {
      sourceLimit: 180000,
      prioritizeProjects: true,
    });
    expect(ctx).toContain("Listing 5.1 project goal and workspace setup");
    expect(ctx).toContain("Listing 5.4 main.go CLI command handler endpoint");

    // Selected chunks within the same source should be emitted in ascending line order.
    const firstIdx = ctx.indexOf("Listing 5.1");
    const secondIdx = ctx.indexOf("Listing 5.4");
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });
});
