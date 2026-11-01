import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,attach,observe} from "../src/core.mjs";
import {addTarget,recordFinding,planChange} from "../src/trace.mjs";
import {portfolioSummary,renderPortfolioInsight,filterTraceRows,statusBand} from "../src/visual.mjs";
const now="2026-11-01T20:00:00.000Z";
function portfolio(){
 const a=createProject(empty(),{name:"Portfolio Alpha",type:"business"});
 const ta=addTarget(a.state,a.id,{title:"Delivery",desired:"Deliver working result"});
 const a2=recordFinding(ta.state,a.id,{targetId:ta.id,result:"partial",observedAt:now});
 const a3=planChange(a2.state,a.id,{title:"Finish remaining work",targetIds:[ta.id]});
 const b=createProject(a3.state,{name:"Portfolio Beta",type:"personal"});
 const tb=addTarget(b.state,b.id,{title:"Backup",desired:"Successful recovery"});
 return {state:tb.state,first:a.id,second:b.id};
}
test("portfolio totals combine projects without claiming release readiness",()=>{
 const p=portfolio(),s=portfolioSummary(p.state.projects,{now});
 assert.equal(s.projects,2);assert.equal(s.committed,2);
 assert.equal(s.counts.partial_reported,1);assert.equal(s.counts.unknown,1);
 assert.equal(s.gaps,1);assert.equal(s.proposals,1);assert.equal(s.stale,0);
});
test("portfolio does not equate zero declared requirements with completion",()=>{
 const p=createProject(empty(),{name:"Empty"});
 const s=portfolioSummary(p.state.projects,{now});
 assert.equal(s.committed,0);assert.match(renderPortfolioInsight(p.state.projects),/Требования ещё не определены/);
});
test("all report counts describe claims and show exact source distinction",()=>{
 const p=portfolio(),html=renderPortfolioInsight(p.state.projects);
 assert.match(html,/Общая картина портфеля/);
 assert.match(html,/Проблемных/);
 assert.match(html,/Portfolio Alpha/);
 assert.match(html,/Неясно \/ есть разрывы/);
 assert.doesNotMatch(html,/Релиз принят/);
});
test("source read failures are reported separately",()=>{
 const p=createProject(empty(),{name:"Example"});
 const a=attach(p.state,p.id,"github","public/test");
 const x=observe(a.state,p.id,a.id,"error",null,"API denied");
 const summary=portfolioSummary(x.projects,{now});
 assert.equal(summary.sourceProblems,1);
 assert.equal(summary.rows[0].sourceStats.unavailable,1);
});
test("trace filters separate candidate, stale and reported findings",()=>{
 const rows=[
  {assessment:"unknown",intent:"committed"}, {assessment:"stale",intent:"committed"},
  {assessment:"gap_reported",intent:"committed"}, {assessment:"test_claim",intent:"committed"},
  {assessment:"acceptance_claim",intent:"candidate"}
 ];
 assert.equal(filterTraceRows(rows,"needs_attention").length,3);
 assert.equal(filterTraceRows(rows,"unconfirmed").length,2);
 assert.equal(filterTraceRows(rows,"reported").length,2);
 assert.equal(filterTraceRows(rows,"candidate").length,1);
 assert.equal(filterTraceRows(rows,"all").length,5);
 assert.throws(()=>filterTraceRows(rows,"incorrect"),/Unknown/);
});
test("status band includes accessible count labels and excludes zero values",()=>{
 const html=statusBand({unknown:2,stale:1});
 assert.match(html,/role="img"/);
 assert.match(html,/Нет подтверждений: 2/);
 assert.match(html,/Устарело \/ недоступно: 1/);
 assert.doesNotMatch(html,/Заявлен пробел:/);
});
test("portfolio HTML escapes untrusted project titles",()=>{
 const p=createProject(empty(),{name:'<img src=x onerror=alert(1)>'});
 const safe=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const html=renderPortfolioInsight(p.state.projects,safe);
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img/);
});
