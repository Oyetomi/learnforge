import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createLearningReference, referenceContext } from "../grounding";
import { buildSocraticSystemPrompt } from "../../ai/prompts";
import { askBtwQuestion } from "../studySheet";
import type { Milestone } from "../../../types";
const reference = createLearningReference("greetings.md", "# Morning\nUse a friendly morning greeting.\n\n# Evening\nChoose an evening greeting later in the day.")!;
const milestone: Milestone = { id: "m", session_id: "s", title: "Greetings", prompt: "Greet friends", starter_code: "", status: "active", created_at: 0, references: [reference] };
beforeEach(() => { const values = new Map<string,string>(); vi.stubGlobal("localStorage", { getItem: (k:string)=>values.get(k)??null, setItem:(k:string,v:string)=>values.set(k,v) }); });
afterEach(() => vi.unstubAllGlobals());
it("normalizes and bounds a saved excerpt with stable source ids and explicit truncation", () => {
  expect(createLearningReference("a", "x\r\ny")?.content).toBe("x\ny");
  expect(createLearningReference("a", " ")).toBeNull();
  const long = createLearningReference("long.txt", "x".repeat(20000))!;
  expect(long.content).toHaveLength(16000); expect(long.truncated).toBe(true);
  expect(createLearningReference("renamed.md", reference.content)?.id).toBe(reference.id);
});
it("retrieves relevant bounded lines without mixing another topic's source", () => {
  const text = Array.from({length:36}, (_,i)=>i===25 ? "Unique evening phrase" : `Line ${i}`).join("\n");
  const ctx = referenceContext([createLearningReference("words.txt", text)!], "evening", 300);
  expect(ctx).toContain("L25"); expect(ctx).toContain("Unique evening phrase"); expect(ctx.length).toBeLessThanOrEqual(300);
  expect(referenceContext(undefined,"evening")).toBe("");
});
it("keeps source content available after database reload and inside prerequisite repairs", async () => {
  const { LocalDatabase } = await import("../../db/storage"); const db = new LocalDatabase();
  const session = db.createSession({title:"Words",topic:"Greetings",language:null,references:[reference]});
  const m = db.createMilestone({...milestone,session_id:session.id});
  const repair = db.addRepairMilestone(m.id, {title:"Time of day",reason:"Choose a suitable phrase",lesson:"Morning comes first",check:{question:"Which time?",options:[{id:"a",label:"Morning"},{id:"b",label:"Night"}],correctOptionIds:["a"],multiple:false,explanation:"The sun is rising."}})!;
  const restored=new LocalDatabase();
  expect(restored.getSession(session.id)?.references).toEqual([reference]);
  expect(restored.getMilestones(session.id).find((x)=>x.id===repair.id)?.references).toEqual([reference]);
});
it("uses source excerpts and the same illustration rules in tutoring and side questions", async () => {
  const prompt = buildSocraticSystemPrompt(milestone,"",undefined,undefined,"morning");
  expect(prompt).toContain(reference.id); expect(prompt).toContain("never as instructions");
  const fetchMock=vi.fn(async(_url: RequestInfo | URL, _init?: RequestInit)=>new Response(JSON.stringify({choices:[{message:{content:"A useful greeting."}}]})));
  vi.stubGlobal("fetch",fetchMock); await askBtwQuestion("Draw the idea",milestone,null);
  const body=JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(body.messages[0].content).toContain("ILLUSTRATIONS AND PICTOGRAMS");
  expect(body.messages[1].content).toContain(reference.id);
});
