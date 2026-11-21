import { afterEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ PDFDataRangeTransport: class {
  length: number; onDataRange = vi.fn(); constructor(length: number) { this.length = length; }
}, getDocument: vi.fn(), GlobalWorkerOptions: { workerSrc: "" } }));
vi.mock("pdfjs-dist", () => sdk);
import { openPdfPageView, readPdfBook, readPdfSectionPages, readSelectedPdfChapters, readPdfStudyRange } from "../pdfReader";
const items = (lines: string[]) => lines.map((str, i) => ({str,transform:[1,0,0,1,40,750-i*24],width:200,hasEOL:true}));
function documentFixture(pages: string[][]) {
  return { numPages: pages.length, getOutline: vi.fn(async()=>null), getPageLabels:vi.fn(async()=>null),
    getDestination:vi.fn(async()=>[{num:74},"Fit"]),getPageIndex:vi.fn(async()=>1),
    getPage:vi.fn(async(n:number)=>({getTextContent:async()=>({items:items(pages[n-1])}),cleanup:vi.fn()})) };
}
afterEach(()=>vi.clearAllMocks());
describe("local PDF reader lifecycle",()=>{
 it("reads only the covered physical pages, keeps printed labels separate, and never reads the next page",async()=>{
  const pdf=documentFixture([["Front matter"],["Covered prose"],["Covered code"],["UNREAD FUTURE ANSWER"]]);
  pdf.getPageLabels.mockResolvedValue(["i","1","2","3"] as never);
  const destroy=vi.fn(async()=>{});sdk.getDocument.mockReturnValue({promise:Promise.resolve(pdf),destroy});
  const range=await readPdfStudyRange(new Uint8Array([1]),2,3);
  expect(range.pages.map(p=>[p.number,p.label])).toEqual([[2,"1"],[3,"2"]]);
  expect(pdf.getPage.mock.calls.map(c=>c[0])).toEqual([2,3]);
  expect(JSON.stringify(range)).not.toContain("UNREAD FUTURE");expect(destroy).toHaveBeenCalledOnce();
 });
 it("splits a long selection at a page boundary and reports image-only or invalid ranges",async()=>{
  const pdf=documentFixture([["x".repeat(9000)],["y".repeat(9000)],["z"]]);
  sdk.getDocument.mockImplementation(()=>({promise:Promise.resolve(pdf),destroy:vi.fn(async()=>{})}));
  const range=await readPdfStudyRange(new Uint8Array([1]),1,3);
  expect(range).toMatchObject({from:1,to:1,requestedTo:3}); expect(range.pages[0].text.length).toBe(9000);
  await expect(readPdfStudyRange(new Uint8Array([1]),0,3)).rejects.toThrow("between 1 and 3");
  await expect(readPdfStudyRange(new Uint8Array([1]),1,4)).rejects.toThrow("between 1 and 3");
  sdk.getDocument.mockReturnValue({promise:Promise.resolve(documentFixture([[]])),destroy:vi.fn(async()=>{})});
  await expect(readPdfStudyRange(new Uint8Array([1]),1,1)).rejects.toThrow("no selectable text");
 });
 it("resolves bookmark destinations to physical pages, extracts text, and releases the worker",async()=>{
  const pdf=documentFixture([["Cover"],["A chapter","Its actual text"]]);
  pdf.getOutline.mockResolvedValue([{title:"A chapter",dest:"named",items:[]}] as never);
  const destroy=vi.fn(async()=>{});sdk.getDocument.mockReturnValue({promise:Promise.resolve(pdf),destroy});
  const bytes=new Uint8Array([1,2,3]),progress=vi.fn();
  const book=await readPdfBook(bytes,"Book.pdf",{onProgress:progress});
  expect(book.sections[0]).toMatchObject({title:"A chapter",pageStart:2,pageEnd:2});
  expect(book.pages[1]).toContain("Its actual text");expect(book.contentsFrom).toBe("bookmarks");
  expect(sdk.getDocument.mock.calls[0][0].data).not.toBe(bytes);
  expect(progress).toHaveBeenLastCalledWith(2,2);expect(destroy).toHaveBeenCalledOnce();
 });
 it("falls back to printed contents and resolves the front-matter offset by matching chapter headings",async()=>{
  const pdf=documentFixture([["Cover"],["Contents","1. Budget .... 1","2. Save .... 2"],["1. Budget","Plan spending"],["2. Save","Build reserves"]]);
  sdk.getDocument.mockReturnValue({promise:Promise.resolve(pdf),destroy:vi.fn(async()=>{})});
  const book=await readPdfBook(new Uint8Array([1]),"Book.pdf");
  expect(book.contentsFrom).toBe("contents-page");expect(book.sections.map(s=>s.pageStart)).toEqual([3,4]);
 });
 it("reports image-only and invalid PDFs instead of inventing a chapter structure",async()=>{
  const destroy=vi.fn(async()=>{});sdk.getDocument.mockReturnValue({promise:Promise.resolve(documentFixture([[]])),destroy});
  await expect(readPdfBook(new Uint8Array([1]),"Scan.pdf")).rejects.toThrow("scanned PDF");
  expect(destroy).toHaveBeenCalledOnce();
  sdk.getDocument.mockReturnValue({promise:Promise.reject(new Error("Invalid PDF structure")),destroy});
  await expect(readPdfBook(new Uint8Array([1]),"Broken.pdf")).rejects.toThrow("Invalid PDF");
 });
 it("destroys an in-flight worker when cancelled and preserves AbortError",async()=>{
  const controller=new AbortController();let reject!: (reason:unknown)=>void;
  const promise=new Promise((_,r)=>{reject=r;});
  const destroy=vi.fn(async()=>{reject(new Error("worker destroyed"));});
  sdk.getDocument.mockReturnValue({promise,destroy});
  const pending=readPdfBook(new Uint8Array([1]),"Book.pdf",{signal:controller.signal});
  await vi.waitFor(()=>expect(sdk.getDocument).toHaveBeenCalled());
  controller.abort();await expect(pending).rejects.toMatchObject({name:"AbortError"});
  expect(destroy).toHaveBeenCalled();
 });
 it("accepts a textbook larger than 10 MB and 600 pages without reading every page up front",async()=>{
  const pdf=documentFixture(Array.from({length:731},(_,i)=>[`Page ${i+1}`]));
  pdf.getOutline.mockResolvedValue([{title:"Late chapter",dest:[{num:74},"Fit"],items:[]}] as never);
  pdf.getPageIndex.mockResolvedValue(699);
  sdk.getDocument.mockReturnValue({promise:Promise.resolve(pdf),destroy:vi.fn(async()=>{})});
  const book=await readPdfBook(new Uint8Array(11_000_000),"Large book.pdf");
  expect(book.pageCount).toBe(731);expect(book.previewOnly).toBe(true);
  expect(pdf.getPage).toHaveBeenCalledTimes(4);expect(book.sections[0].pageStart).toBe(700);
  const selected=await readSelectedPdfChapters(book,[book.sections[0].id]);
  expect(selected.pages[699]).toBe("Page 700");
  expect(selected.readPages).toContain(731);
  expect(pdf.getPage).not.toHaveBeenCalledWith(500);
 });

 it("uses range reads for a file without rejecting its byte size or page count",async()=>{
  const pdf=documentFixture(Array.from({length:6001},(_,i)=>[`Page ${i+1}`]));
  pdf.getOutline.mockResolvedValue([{title:"Chapter",dest:[{num:74},"Fit"],items:[]}] as never);
  let config: any;
  const slice = vi.fn((begin:number,end:number)=>new Blob([new Uint8Array(end-begin)]));
  const file = { size: 3_000_000_000, slice } as unknown as Blob;
  sdk.getDocument.mockImplementation(options=>{config=options;return {promise:Promise.resolve(pdf),destroy:vi.fn(async()=>{})};});
  const book=await readPdfBook(file,"Large volume.pdf");
  expect(book.pageCount).toBe(6001);expect(book.file).toBe(file);
  expect(config.data).toBeUndefined();expect(config.disableAutoFetch).toBe(true);
  expect(config.range.length).toBe(3_000_000_000);expect(pdf.getPage).toHaveBeenCalledTimes(4);
  // A new active transport reads only the requested file slice.
  sdk.getDocument.mockImplementation(options=>{config=options;options.range.requestDataRange(65536,131072);return {promise:Promise.resolve(pdf),destroy:vi.fn(async()=>{})};});
  await readPdfBook(file,"Large volume.pdf");
  expect(slice).toHaveBeenCalledWith(65536,131072);
 });

 it("keeps a stored PDF open for in-app pages, draws at the requested width and releases it on close",async()=>{
  const render=vi.fn(()=>({promise:Promise.resolve(),cancel:vi.fn()}));
  const cleanup=vi.fn();
  const pdf={numPages:3,getPage:vi.fn(async()=>({getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),render,cleanup}))};
  const destroy=vi.fn(async()=>{});sdk.getDocument.mockReturnValue({promise:Promise.resolve(pdf),destroy});
  vi.stubGlobal("window",{devicePixelRatio:2});
  const view=await openPdfPageView(new Blob([new Uint8Array([1,2,3])]));
  expect(view.pageCount).toBe(3);
  const canvas={width:0,height:0,style:{} as Record<string,string>} as unknown as HTMLCanvasElement;
  await view.render(2,canvas,300);
  expect(pdf.getPage).toHaveBeenCalledWith(2);
  // 300 CSS pixels at a 2x screen: a 600-pixel-wide bitmap.
  expect([canvas.width,canvas.height]).toEqual([600,800]);
  expect(cleanup).toHaveBeenCalledOnce();
  expect(destroy).not.toHaveBeenCalled();
  view.close();
  expect(destroy).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
 });

 it("reads full 45-page technical chapters in readSelectedPdfChapters beyond the old 18KB / 40-page cap", async () => {
  const chapterPages = Array.from({ length: 45 }, (_, i) => [
   `Chapter page ${i + 1}: ${"a".repeat(2000)}`,
  ]);
  const pdf = documentFixture(chapterPages);
  pdf.getOutline.mockResolvedValue([{ title: "Chapter 2: CLI Project", dest: [{ num: 1 }, "Fit"], items: [] }] as never);
  pdf.getPageIndex.mockResolvedValue(0);
  sdk.getDocument.mockImplementation(() => ({ promise: Promise.resolve(pdf), destroy: vi.fn(async () => {}) }));
  const book = await readPdfBook(new Uint8Array([1, 2, 3]), "Go in Action 2e.pdf");
  const selected = await readSelectedPdfChapters(book, [book.sections[0].id]);
  expect(selected.readPages).toContain(45);
  expect(selected.pages[44]).toContain("Chapter page 45:");
 });

 it("extracts full multi-page chapter text beyond 18,000 chars in readPdfSectionPages and omits unreadable sections", async () => {
  const pages = Array.from({ length: 30 }, (_, i) => {
   if (i === 28) return [];
   return [`Section content on page ${i + 1} ${"b".repeat(2000)}`];
  });
  const pdf = documentFixture(pages);
  const destroy = vi.fn(async () => {});
  sdk.getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy });

  const refs = await readPdfSectionPages(
   new Uint8Array([1, 2, 3]),
   [
    { id: "ch-2", title: "Chapter 2: Building a CLI", level: 0, pageStart: 1, pageEnd: 25 },
    { id: "empty-sec", title: "Blank Plate", level: 0, pageStart: 29, pageEnd: 29 },
    { id: "out-of-bounds", title: "Invalid", level: 0, pageStart: 31, pageEnd: 35 },
   ],
   "Go in Action 2e"
  );

  expect(refs).toHaveLength(1);
  expect(refs[0]).toMatchObject({
   id: "pdf-full:ch-2",
   sectionId: "ch-2",
   name: "Go in Action 2e · Chapter 2: Building a CLI",
   truncated: false,
   pdfPageStart: 1,
   pdfPageEnd: 25,
  });
  expect(refs[0].content.length).toBeGreaterThan(50000);
  expect(refs[0].content).toContain("PDF page 1\nSection content on page 1");
  expect(refs[0].content).toContain("PDF page 25\nSection content on page 25");
  expect(destroy).toHaveBeenCalledOnce();
 });

 it("marks readPdfSectionPages truncated when hitting page/char limits or individual 16,000-char page cap", async () => {
  const longPagePdf = documentFixture([["c".repeat(17000)], ["Second page"]]);
  sdk.getDocument.mockReturnValue({ promise: Promise.resolve(longPagePdf), destroy: vi.fn(async () => {}) });
  const clipped = await readPdfSectionPages(
   new Uint8Array([1]),
   [{ id: "s1", title: "Dense Page", level: 0, pageStart: 1, pageEnd: 2 }],
   "Dense Book"
  );
  expect(clipped[0].truncated).toBe(true);
  expect(clipped[0].content).toContain("PDF page 2\nSecond page");

  const hugeChapterPdf = documentFixture(Array.from({ length: 130 }, (_, i) => [`Page ${i + 1} text`]));
  sdk.getDocument.mockReturnValue({ promise: Promise.resolve(hugeChapterPdf), destroy: vi.fn(async () => {}) });
  const capped = await readPdfSectionPages(
   new Uint8Array([1]),
   [{ id: "s2", title: "Long Chapter", level: 0, pageStart: 1, pageEnd: 130 }],
   "Long Book"
  );
  expect(capped[0].truncated).toBe(true);
  expect(capped[0].content).toContain("PDF page 120\nPage 120 text");
  expect(capped[0].content).not.toContain("PDF page 121");
 });
});
