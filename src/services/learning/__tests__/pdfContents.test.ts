import { describe, expect, it } from "vitest";
import { mainPdfSections, sectionsFromContents, selectedPdfSource, withPageRanges, type PdfBook } from "../pdfContents";
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
});
