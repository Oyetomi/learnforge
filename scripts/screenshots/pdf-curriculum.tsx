import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/foundation.css';
if(!localStorage.getItem('pdf-qa-initialized')){
 localStorage.setItem('pdf-qa-initialized','true');
 for(const key of ['custom-tracks','sessions','milestones','messages'])localStorage.setItem('learnforge:'+key,'[]');
 localStorage.setItem('learnforge:initialized_v1','true');
}
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 if(!init?.body){ if(String(input).includes('/models'))return new Response(JSON.stringify({data:[{id:'authored-offline-demo'}]})); return originalFetch(input,init); }
 const body=JSON.parse(String(init.body)); const message=body.messages?.at(-1)?.content||'{}';let data:any;
 try {const payload=JSON.parse(message); const chapters=payload.selectedBookSections?.sections;
 if(chapters) data={title:'Selected book chapters · authored QA',destination:payload.desiredAbility||payload.originalGoal,practice_mode:'general',language:null,exclusions:['Authored offline UI test; not financial advice.'],modules:chapters.map((s:any,i:number)=>({title:s.title,outcome:'Use the idea in an everyday situation.',units:[{id:'u'+i,title:s.title,outcome:`Apply ${s.title} to a fresh situation.`,assessment:'Explain a sensible choice in a new example.',prerequisite_ids:[],source_section_ids:[s.id]}]}))};
 else if(payload.selectedGoal) data={title:'One selected chapter',practice_mode:'general',language:null,milestones:[{id:'only',title:payload.selectedGoal,prompt:payload.selectedGoal,lesson:'A budget starts with money coming in and the costs you need to cover. Use a small example to compare income with spending.',check:{question:'What should a budget compare?',options:[{id:'a',label:'Income and costs'},{id:'b',label:'Only shopping prices'}],correctOptionIds:['a'],multiple:false,explanation:'A budget relates money available to planned spending.'},prerequisite_ids:[]}]};
 else data={scope:'curriculum',reason:'This goal benefits from a connected curriculum.'};
 }catch{data={scope:'curriculum',reason:'A connected curriculum.'};}
 return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(data)}}]}),{headers:{'content-type':'application/json'}});
};
const App=(await import('../../src/App')).default;
createRoot(document.getElementById('root')!).render(<App/>);
