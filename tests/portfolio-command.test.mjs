import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,editItem,editProject,attach} from "../src/core.mjs";
import {addPortfolioLink} from "../src/portfolio.mjs";
import {addTarget} from "../src/trace.mjs";
import {buildPortfolioCommand,filterPortfolioCommand,renderPortfolioCommand,renderPortfolioCommandRows} from "../src/portfolio-command.mjs";

function scenario(){
 const a=createProject(empty(),{name:"API",type:"engineering"});
 const b=createProject(a.state,{name:"Client",type:"engineering"});
 const c=createProject(b.state,{name:"Release",type:"business"});
 let s=editProject(c.state,a.id,{startDate:"2026-11-01"});
 s=editProject(s,b.id,{startDate:"2026-11-01",dueDate:"2026-11-03"});
 const work=createItem(s,a.id,{title:"Core"});s=editItem(work.state,a.id,work.id,{state:"blocked",estimateDays:3});
 const ui=createItem(s,b.id,{title:"UI"});s=editItem(ui.state,b.id,ui.id,{estimateDays:3});
 s=addPortfolioLink(s,{from:a.id,to:b.id});
 s=addPortfolioLink(s,{from:b.id,to:c.id});
 const target=addTarget(s,b.id,{title:"Validate UX",desired:"Verified readback"});
 return {snapshot:target.state,a:a.id,b:b.id,c:c.id,target:target.id,work:work.id};
}
test("one command queue connects inherited blockers, due slips and evidence",()=>{
 const s=scenario(),model=buildPortfolioCommand(s.snapshot,{now:"2026-11-02T00:00:00Z"});
 assert.equal(model.rows.length,3);
 assert.equal(filterPortfolioCommand(model,{filter:"blocked"}).length,3);
 const client=model.rows.find(row=>row.id===s.b);
 assert.equal(client.filterTags.has("dates"),true);
 assert.equal(client.slip>0,true);
 assert.equal(client.filterTags.has("evidence"),true);
 assert.match(renderPortfolioCommandRows(model,{filter:"evidence"}),/Validate UX/);
 assert.equal(filterPortfolioCommand(model,{search:"client"}).length,1);
 assert.match(renderPortfolioCommand(model),/Что требует внимания/);
 assert.match(renderPortfolioCommandRows(model,{filter:"sources"}),/Нет проектов по выбранному фильтру/);
 assert.throws(()=>filterPortfolioCommand(model,{filter:"unknown"}),/Invalid/);
});
test("drill-down action targets individual requirement/cause and escapes untrusted text",()=>{
 const s=scenario(),model=buildPortfolioCommand(s.snapshot);
 const html=renderPortfolioCommandRows(model,{filter:"evidence"});
 assert.match(html,/inspect:/);
 assert.match(html,/evidence:/);
 assert.match(html,/Validate UX/);
 const poisoned=createProject(empty(),{name:'<img src=x onerror=alert(1)>'});
 const markup=renderPortfolioCommand(buildPortfolioCommand(poisoned.state));
 assert.match(markup,/&lt;img/);
 assert.doesNotMatch(markup,/<img/);
});
test("unobserved source and absent scheduling inputs remain explicit, not accepted",()=>{
 const p=createProject(empty(),{name:"No dates"});
 const linked=attach(p.state,p.id,"github","example/repo");
 const model=buildPortfolioCommand(linked.state);
 assert.equal(model.totals.unknownDates,1);
 assert.equal(filterPortfolioCommand(model,{filter:"sources"}).length,1);
 assert.equal(model.rows[0].projectedFinish,null);
 assert.doesNotMatch(renderPortfolioCommand(model),/Релиз подтверждён/);
});
