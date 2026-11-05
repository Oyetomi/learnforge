import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCurriculumOutline, prepareCurriculumUnit, trackFromOutline } from "../curriculumOutline";
const source = { name:"Everyday money.pdf", sections:[{id:"budget",title:"Budgeting",level:0,pageStart:3,pageEnd:6},{id:"saving",title:"Emergency savings",level:0,pageStart:7,pageEnd:10}] };
const options = {topic:"Learn everyday money",destination:"Make sensible money choices",startingPoint:"Beginning",sourceDocument:source,
  references: source.sections.map(s=>({id:`ref-${s.id}`,name:s.title,content:`${s.title} chapter body.`,sectionId:s.id,truncated:false}))};
const outline = () => ({title:"Everyday money",destination:options.destination,practice_mode:"general",language:null,exclusions:[],modules:[{title:"Practical money",outcome:"Make everyday choices",units:source.sections.map((s,i)=>({id:s.id,title:s.title,outcome:`Apply ${s.title}`,assessment:`A fresh ${s.title} scenario`,prerequisite_ids:i?["budget"]:[],source_section_ids:[s.id]}))}]});
const response = (data:unknown) => new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(data)}}]}));
afterEach(()=>vi.unstubAllGlobals());
describe("curriculum from PDF contents",()=>{
 it("persists selected sections and refuses omitted, missing, or invented chapter mappings",()=>{
   const track = trackFromOutline(outline(),options);
   expect(track.curriculum?.sourceDocument).toEqual(source);
   expect(track.curriculum?.modules[0].units[1].sourceSectionIds).toEqual(["saving"]);
   const omitted=outline(); omitted.modules[0].units.pop();
   expect(()=>trackFromOutline(omitted,options)).toThrow("incomplete outcomes");
   const unknown=outline(); unknown.modules[0].units[1].source_section_ids=["invented"];
   expect(()=>trackFromOutline(unknown,options)).toThrow("incomplete outcomes");
 });
 it("preserves chapter selection through structural repair and only returns a covered outline",async()=>{
   const fetch=vi.fn().mockResolvedValueOnce(response({title:"Incomplete"})).mockResolvedValueOnce(response(outline()));
   vi.stubGlobal("fetch",fetch);
   await generateCurriculumOutline(options);
   for(const call of fetch.mock.calls){const payload=JSON.parse(call[1].body);expect(payload.messages[0].content).toContain("source_section_ids");expect(JSON.parse(payload.messages[1].content).selectedBookSections).toEqual(source);}
 });
 it("prepares a later unit from its own chapter and retains its source after preparation",async()=>{
   const track=trackFromOutline(outline(),options);
   const check={question:"Which action creates a reserve?",options:[{id:"a",label:"Save some income"},{id:"b",label:"Spend all income"}],correctOptionIds:["a"],multiple:false,explanation:"The unspent part forms a reserve."};
   const fetch=vi.fn().mockResolvedValue(response({title:"One unit",practice_mode:"general",language:null,milestones:[{id:"only",title:"Savings",prompt:"Build a reserve",lesson:"Set aside a small amount for an unexpected cost.",check,prerequisite_ids:[]}]}));
   vi.stubGlobal("fetch",fetch);
   const prepared=await prepareCurriculumUnit(track,track.milestones[1].id,new AbortController().signal);
   const payload=JSON.parse(fetch.mock.calls[0][1].body);
   expect(JSON.stringify(payload.messages)).toContain("Emergency savings chapter body.");
   expect(JSON.stringify(payload.messages)).not.toContain("Budgeting chapter body.");
   expect(prepared.references?.map(r=>r.sectionId)).toEqual(["saving"]);
 });
});
