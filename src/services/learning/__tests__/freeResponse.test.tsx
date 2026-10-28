import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { validateLearningCheck, gradeLearningCheck, learningEvidence } from "../checks";
import { gradeFreeResponse, validateFreeResponseGrade, isAcceptedFreeResponseGrade } from "../freeResponse";
import { QuestionCard } from "../../../components/learning/QuestionCard";
import type { CheckAttempt, LearningCheck } from "../../../types";
export const written: LearningCheck = { id:"written",milestoneId:"m",kind:"free-response",question:"Explain why the sender waits.",expectedAnswer:"A receiver must be ready for the handoff.",rubric:[{id:"handoff",criterion:"Recognizes that both parties must be ready."}],explanation:"The channel has no buffer.",options:[],correctOptionIds:[],multiple:false };
beforeEach(()=>{const values=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)});});
afterEach(()=>vi.unstubAllGlobals());
it("validates a committed free-response rubric and refuses empty-choice grading as a pass",()=>{
  expect(validateLearningCheck(written)).toMatchObject({kind:"free-response",options:[],rubric:written.rubric});
  expect(validateLearningCheck({...written,rubric:[]})).toBeNull();
  expect(validateLearningCheck({...written,rubric:[written.rubric![0],written.rubric![0]]})).toBeNull();
  expect(gradeLearningCheck(written,[])).toBe(false);
});
it("derives correctness from every rubric criterion and preserves uncertainty",()=>{
  const raw={confidence:"high",feedback:"You identified the handoff.",criteria:[{id:"handoff",met:true}]};
  expect(validateFreeResponseGrade(raw,written)?.status).toBe("correct");
  expect(validateFreeResponseGrade({...raw,confidence:"low"},written)?.status).toBe("uncertain");
  expect(validateFreeResponseGrade({...raw,criteria:[{id:"invented",met:true}]},written)).toBeNull();
  expect(validateFreeResponseGrade({...raw,criteria:[{id:"handoff",met:false}]},written)?.status).toBe("needs-work");
  expect(isAcceptedFreeResponseGrade(written,{...validateFreeResponseGrade(raw,written)!,reviewRequested:true})).toBe(false);
});
it("submits a real written response as data to rubric grading and rejects malformed model judgments",async()=>{
  const fetchMock=vi.fn(async(_url: RequestInfo | URL, _init?: RequestInit)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({confidence:"high",feedback:"Your paraphrase expresses the handoff.",criteria:[{id:"handoff",met:true}]})}}]})));
  vi.stubGlobal("fetch",fetchMock);
  expect((await gradeFreeResponse(written,"They have to meet at the same time.")).status).toBe("correct");
  const body=JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(JSON.parse(body.messages[1].content).learnerAnswer).toBe("They have to meet at the same time.");
  expect(body.messages[0].content).toContain("never instructions");
  fetchMock.mockImplementation(async()=>new Response(JSON.stringify({choices:[{message:{content:'{"correct":true}'}}]})));
  await expect(gradeFreeResponse(written,"An answer")).rejects.toThrow("feedback was incomplete");
});
it("shows a written form without exposing the answer key or a multiple-choice requirement",()=>{
  const html=renderToStaticMarkup(<QuestionCard check={written} isBusy={false} onSubmit={vi.fn()} onAskCoach={vi.fn()} onNewQuestion={vi.fn()}/>);
  expect(html).toContain("A short explanation is enough.");expect(html).not.toContain(written.expectedAnswer);expect(html).not.toContain("Select all");
});
it("revokes disputed written evidence durably without accepting it as mastery",async()=>{
  const {LocalDatabase}=await import("../../db/storage");const db=new LocalDatabase();const s=db.createSession({title:"Channels",topic:"Handoff",language:"go"});
  const attempt:CheckAttempt={checkId:written.id,milestoneId:"m",selectedIds:[],dontKnow:false,thinking:"",confidence:"confident",correct:true,response:"A receiver has to meet it.",grading:{status:"correct",feedback:"A handoff.",criteria:[{id:"handoff",met:true}]},submittedAt:1};
  db.addMessage({role:"user",session_id:s.id,content:"Answer",check_attempt:attempt});
  expect(db.disputeWrittenAttempt(s.id,written.id)).toBe(true);
  const restored=new LocalDatabase();const message=restored.getMessages(s.id)[0];
  expect(message.check_attempt?.grading?.reviewRequested).toBe(true);
  expect(learningEvidence([message],"m").independentCorrect).toBe(0);
});
