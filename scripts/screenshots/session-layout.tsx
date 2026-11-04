import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {nextTeachingStep} from '../../src/services/learning/teaching';
import {learningEvidence} from '../../src/services/learning/checks';
const sid='session-layout-qa-session',mid='session-layout-qa-milestone',tid='session-layout-qa-track';
const first={question:'Which is larger when both pieces come from the same cake?',options:[{id:'a',label:'One half'},{id:'b',label:'One quarter'},{id:'c',label:'One eighth'}],correctOptionIds:['a'],multiple:false,explanation:'Cutting the same cake into two equal parts gives larger pieces than cutting it into four.'};
const milestone={id:mid,session_id:sid,title:'Compare parts of a whole',prompt:'Compare fractions and notice when the whole changes.',lesson:'## Compare equal wholes\n\nA fraction describes a part of a whole. If two cakes are the same size, half a cake is larger than a quarter of a cake. More equal cuts make each piece smaller.',starter_code:'',check:first,status:'active',created_at:1};
const intent={interest:'Understand everyday fractions',goal:'Compare parts of a whole',practiceMode:'general',level:'Beginner'};
const track={id:tid,title:'Everyday fractions · authored QA',tagline:'Production app with offline teaching fixtures',language:null,learningIntent:intent,difficulty:'Beginner',description:'Disposable QA',concepts:['Parts of a whole'],initialPrompt:'A small worked example',estimatedHours:1,milestones:[milestone]};
if(!localStorage.getItem('session-layout-qa-seeded')){
 localStorage.setItem('session-layout-qa-seeded','true');
 localStorage.setItem('learnforge:custom-tracks',JSON.stringify([track]));
 localStorage.setItem('learnforge:active-track',tid);localStorage.setItem('learnforge:initialized_v1','true');
 localStorage.setItem('learnforge:sessions',JSON.stringify([{id:sid,track_id:tid,title:track.title,topic:track.tagline,language:null,learning_intent:intent,created_at:1,updated_at:1}]));
 localStorage.setItem('learnforge:milestones',JSON.stringify([milestone]));localStorage.setItem('learnforge:messages','[]');
 localStorage.setItem('learnforge:learning-preferences',JSON.stringify({visuals:'auto',pace:'overview',detail:'brief',retention:false}));
}
const {db}=await import('../../src/services/db/storage');
let calls:string[]=[];
function records(){ const session=db.getSessions().find(s=>s.track_id===tid)!; const lesson=db.getMilestones(session.id)[0]; return {history:db.getMessages(session.id),id:lesson.id}; }
function refresh(){
 const {history,id}=records(),e=learningEvidence(history,id),tools=document.getElementById('qa-tools')!;
 tools.style.cssText='position:fixed;bottom:0;left:0;z-index:500;background:#101514;color:#b4c8bd;font:10px monospace;padding:3px 10px;max-width:100%';
 tools.textContent=`Authored offline QA · calls ${calls.join(', ')||'none'} · independent ${e.independentCorrect} · transfer ${e.transferCorrect} · next ${nextTeachingStep(history,id).stage}`;
}
const guided={...first,question:'How much of the cake are two of its four equal pieces?',context:'A cake is cut into four equal pieces. One piece is one quarter. Count how many quarter-pieces the person takes.',options:[{id:'a',label:'Two quarters'},{id:'b',label:'Three quarters'}],explanation:'Two of the four equal pieces are two quarters, or half of the cake.'};
const own={...first,question:'You take half of a pie cut into eight equal slices. How many slices do you take?',options:[{id:'a',label:'Four slices'},{id:'b',label:'Two slices'}],explanation:'Half divides the eight equal slices into two equal groups. Each group has four slices.'};
const transfer={...first,question:'A 4-litre jug is half full. An 8-litre jug is a quarter full. Which contains more water?',options:[{id:'a',label:'Both jugs contain the same amount.'},{id:'b',label:'The half-full jug contains more water.'}],explanation:'Half of 4 litres and a quarter of 8 litres are both 2 litres. The whole changed, so compare actual amounts.'};
window.fetch=async(_input,init)=>{
 if(!init?.body)return new Response(JSON.stringify({data:[{id:'offline-fixture'}]}));
 const body=JSON.parse(String(init.body)),sys=body.messages?.[0]?.content||'',prompt=body.messages?.slice(-1)[0]?.content||'';
 let content='';
 if(sys.startsWith('You are providing optional hint')){
 calls.push('hint');content='Imagine cutting two identical pizzas: one into two equal slices, the other into four. Which pizza gives you the larger single slice?';
 }else if(sys.startsWith('Review one learning question')){
  calls.push('review');content=JSON.stringify({answerable:true,confidence:'high',rubricValid:true,correctOptionIds:['a'],reasoning:'Authored fixture answer.'});
 }else if(prompt.includes('dedicated TEACHING turn')){
  calls.push('teach');content='### Work through the idea\n\nA fraction describes a part compared with its whole. Start by asking what the whole is.\n\nFor example, cut one cake into four equal pieces. Two pieces are two quarters. They cover the same amount as half of that cake.\n\nThe size of the pieces depends on the cake. Half of a tiny cake can be less food than a quarter of a much larger one. Compare the wholes before comparing the fractions.';
 }else if(sys.includes('You plan a learner')){
  calls.push('planner');content=JSON.stringify({action:'stay',reason:'Practise the same distinction.'});
 }else{
  const {history,id}=records(),plan=nextTeachingStep(history,id);calls.push(plan.stage);
  if(plan.stage==='review'){
   const ids=history.flatMap(m=>m.check_attempt?.correct&&!m.check_attempt.assisted&&m.check_attempt.practice!=='guided'?[m.check_attempt.checkId]:[]);
   content='You compared equal wholes independently and noticed why a different whole changes the result.\n\n```forge-assessment\n'+JSON.stringify({decision:'ready',rationale:'Two independent applications include a changed-whole comparison.',evidenceCheckIds:ids})+'\n```';
  }else content='```forge-check\n'+JSON.stringify(plan.stage==='guided'?guided:plan.stage==='transfer'?transfer:own)+'\n```';
 }
 refresh();
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,500);init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});
 return new Response(body.stream?'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\ndata: [DONE]\n\n':JSON.stringify({choices:[{message:{content}}]}),{headers:{'content-type':body.stream?'text/event-stream':'application/json'}});
};
const App=(await import('../../src/App')).default;
createRoot(document.getElementById('root')!).render(<App/>);
setInterval(refresh,700);
