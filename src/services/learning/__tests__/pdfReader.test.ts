import { afterEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ PDFDataRangeTransport: class {
  length: number; onDataRange = vi.fn(); constructor(length: number) { this.length = length; }
}, getDocument: vi.fn(), GlobalWorkerOptions: { workerSrc: "" } }));
vi.mock("pdfjs-dist", () => sdk);
import { readPdfBook, readSelectedPdfChapters } from "../pdfReader";
const items = (lines: string[]) => lines.map((str, i) => ({str,transform:[1,0,0,1,40,750-i*24],width:200,hasEOL:true}));
function documentFixture(pages: string[][]) {
  return { numPages: pages.length, getOutline: vi.fn(async()=>null), getPageLabels:vi.fn(async()=>null),
    getDestination:vi.fn(async()=>[{num:74},"Fit"]),getPageIndex:vi.fn(async()=>1),
    getPage:vi.fn(async(n:number)=>({getTextContent:async()=>({items:items(pages[n-1])}),cleanup:vi.fn()})) };
}
afterEach(()=>vi.clearAllMocks());
describe("local PDF reader lifecycle",()=>{
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

});
