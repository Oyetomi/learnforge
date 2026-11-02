import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {generatePracticeRound,generatePracticeHelp,startKnowledgePractice} from "../knowledgePractice";
import type {KnowledgeGraph} from "../knowledgeGraph";
import {parseChatJson,StructuredResponseError} from "../../ai/structuredResponse";

const graph:KnowledgeGraph={version:1,trackId:"language-topic",updatedAt:1,sources:[{id:"s",title:"Authored language note",kind:"lesson",text:"Use a respectful greeting when meeting an elder. The relationship changes the greeting you choose."}],propositions:[{id:"p",statement:"The listener's relationship can affect the greeting.",anchors:[{sourceId:"s",quote:"The relationship changes the greeting you choose."}]}],arguments:[]};
const question={kind:"free-response",question:"You meet an elder for the first time. What should guide your choice of greeting?",expectedAnswer:"Use a respectful greeting suited to the relationship.",explanation:"Who you greet affects the appropriate level of respect.",rubric:[{id:"relationship",criterion:"Relates the greeting to the listener, accepting equivalent wording."}]};
const envelope=(content:unknown,finish_reason="stop")=>({choices:[{finish_reason,message:{content}}]});
const run=()=>startKnowledgePractice(graph,"Everyday language",["p"]);
let values:Map<string,string>;
beforeEach(()=>{values=new Map();vi.stubGlobal("localStorage",{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});});
afterEach(()=>vi.unstubAllGlobals());
function provider(reply:unknown){const request=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify(reply),{status:200}));vi.stubGlobal("fetch",request);return request;}

describe("practice provider responses",()=>{
 for(const format of ["plain","json","forge-check"]){
  it(`accepts a complete ${format} response without changing its answer or rubric`,async()=>{
   const json=JSON.stringify(question);const request=provider(envelope(format==="plain"?json:`\`\`\`${format}\r\n${json}\r\n\`\`\``));
   const session=run();const result=await generatePracticeRound(session,"p","independent",new AbortController().signal);
   expect(result.check.expectedAnswer).toBe(question.expectedAnswer);expect(result.check.rubric).toEqual(question.rubric);expect(result.check.id).toMatch(/^practice:/);expect(session.rounds).toEqual([]);
   const body=JSON.parse(String(request.mock.calls[0][1]?.body));expect(body.messages[0].content).toContain('"kind":"choice"');expect(body.messages[0].content).not.toContain("emit forge-check JSON");expect(JSON.parse(body.messages[1].content).topic).toBe("Everyday language");
  });
 }
 it("accepts typed text blocks but never treats reasoning blocks as the committed answer",async()=>{
  provider(envelope([{type:"reasoning",text:'{"wrong":"do not read"}'},{type:"text",text:JSON.stringify(question)}]));
  expect((await generatePracticeRound(run(),"p","independent",new AbortController().signal)).check.question).toBe(question.question);
  expect(()=>parseChatJson(envelope([{type:"reasoning",text:JSON.stringify(question)}]))).toThrow(/no usable content/);
 });
 it("preserves a pending run after empty, malformed, truncated, or refused responses",async()=>{
  const session=run();const before=structuredClone(session);
  for(const reply of [envelope(null),envelope('{"kind":"free-response"'),envelope(JSON.stringify(question),"length"),{choices:[{message:{refusal:"Cannot complete",content:JSON.stringify(question)}}]}]){
   const request=provider(reply);await expect(generatePracticeRound(session,"p","independent",new AbortController().signal)).rejects.toBeInstanceOf(StructuredResponseError);
   expect(session).toEqual(before);expect(request).toHaveBeenCalledTimes(1);expect(values.has(`learnforge:practice:${session.trackId}:${session.id}`)).toBe(false);
  }
 });
 it("does not repair missing grading criteria or extract a question from surrounding prose",async()=>{
  provider(envelope(JSON.stringify({...question,rubric:[]})));await expect(generatePracticeRound(run(),"p","independent",new AbortController().signal)).rejects.toThrow(/answerable question/);
  provider(envelope(`Here is your question: ${JSON.stringify(question)}`));await expect(generatePracticeRound(run(),"p","independent",new AbortController().signal)).rejects.toThrow(/unreadable/);
 });
 it("preserves nested Markdown fences and escaped notation inside explanation fields",async()=>{
  const help='A relationship: $x \\times 2$.\n\n```svg\n<svg viewBox="0 0 100 100"><title>Relationship</title></svg>\n```';
  provider(envelope('```json\n'+JSON.stringify({help})+'\n```'));
  const session=run();const round={id:"r",targetId:"p",check:{...question,id:"q",milestoneId:"m",options:[],correctOptionIds:[],multiple:false}};
  expect(await generatePracticeHelp(session,round as Parameters<typeof generatePracticeHelp>[1],"visual",new AbortController().signal)).toBe(help);
 });
 it("does not retry a cancelled request or modify existing work",async()=>{
  const session=run(),controller=new AbortController();controller.abort();
  const request=vi.fn(async(_url:unknown,init:RequestInit)=>{if(init.signal?.aborted)throw new DOMException("Aborted","AbortError");return new Response("");});vi.stubGlobal("fetch",request);
  await expect(generatePracticeRound(session,"p","independent",controller.signal)).rejects.toMatchObject({name:"AbortError"});expect(request).toHaveBeenCalledTimes(1);expect(session.rounds).toEqual([]);
 });
});
