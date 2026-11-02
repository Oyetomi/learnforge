import {afterEach,describe,expect,it,vi} from "vitest";
import {DEFAULT_HELP_RATIOS,HELP_SPLIT_MIN_WIDTH,helpPaneBounds,helpPaneWidth,readHelpRatios,saveHelpRatio} from "../helpLayout";
afterEach(()=>vi.unstubAllGlobals());
describe("help workspace sizing",()=>{
 it("gives a figure more than the old 560px cap when screen space exists",()=>{
  expect(helpPaneWidth(1650,DEFAULT_HELP_RATIOS.visual)).toBeGreaterThan(800);
  expect(helpPaneWidth(1650,DEFAULT_HELP_RATIOS.hint)).toBeLessThan(helpPaneWidth(1650,DEFAULT_HELP_RATIOS.walkthrough));
 });
 it("keeps both panes usable across split widths and never exceeds the workspace",()=>{
  for(const width of [HELP_SPLIT_MIN_WIDTH,1024,1280,1650,2560])for(const ratio of [-100,.28,.42,.56,.72,100,NaN]){
   const actual=helpPaneWidth(width,ratio),bounds=helpPaneBounds(width);
   expect(actual).toBeGreaterThanOrEqual(400);expect(width-12-actual).toBeGreaterThanOrEqual(420);
   expect(actual).toBeGreaterThanOrEqual(bounds.min);expect(actual).toBeLessThanOrEqual(bounds.max);
  }
 });
 it("reports the same limits used by keyboard Home and End",()=>{
  for(const width of [960,1650,2560]){
   const b=helpPaneBounds(width);
   expect(helpPaneWidth(width,b.min/b.available)).toBeCloseTo(b.min);
   expect(helpPaneWidth(width,b.max/b.available)).toBeCloseTo(b.max);
  }
 });
 it("handles a hidden or narrow stage without negative or overflowing widths",()=>{
  for(const width of [0,300,600]){expect(helpPaneWidth(width,.56)).toBeGreaterThanOrEqual(0);expect(helpPaneWidth(width,.56)).toBeLessThanOrEqual(width);}
  expect(helpPaneWidth(NaN,.5)).toBe(0);
 });
 it("remembers each help kind independently and does not write learning records",()=>{
  vi.stubGlobal("window",{});const data=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});
  saveHelpRatio("visual",.65);saveHelpRatio("hint",.3);
  expect(readHelpRatios()).toEqual({...DEFAULT_HELP_RATIOS,visual:.65,hint:.3});expect([...data.keys()]).toEqual(["learnforge:help-layout"]);
 });
 it("falls back safely when stored preferences are malformed or unavailable",()=>{
  vi.stubGlobal("window",{});
  for(const raw of ['{"version":1,"visual":"wide"}','{"version":2,"visual":0.65}','null','not-json']){
   vi.stubGlobal("localStorage",{getItem:()=>raw});expect(readHelpRatios()).toEqual(DEFAULT_HELP_RATIOS);
  }
  vi.stubGlobal("localStorage",{getItem:()=>{throw new Error("blocked")},setItem:()=>{throw new Error("blocked")}});
  expect(readHelpRatios()).toEqual(DEFAULT_HELP_RATIOS);expect(()=>saveHelpRatio("visual",.6)).not.toThrow();
 });
});
