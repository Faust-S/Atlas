import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serialize,editItem} from '../src/core.mjs';
import {scheduleProject} from '../src/planning.mjs';
import {portfolioSchedule} from '../src/portfolio-schedule.mjs';
import {previewWorkScheduleEdit} from '../src/work-schedule-preview.mjs';
import {atlas10ShiftedPortfolio} from './fixtures/atlas10-portfolio-forecast.mjs';

const fixture=()=>{
 const {snapshot,projectId}=atlas10ShiftedPortfolio();
 const upstream=snapshot.projects.find(project=>project.id!==projectId);
 return {snapshot,upstream,workId:upstream.items[0].id,downstreamId:projectId};
};
const preview=(snapshot,project,workId,duration,options={})=>previewWorkScheduleEdit(
 project,workId,{estimateDays:duration,dueDate:project.items.find(w=>w.id===workId).dueDate??''},
 scheduleProject(project,{calendarLibrary:snapshot.calendarLibrary}),null,{
 calendarLibrary:snapshot.calendarLibrary,portfolioSnapshot:snapshot,
 portfolioBefore:portfolioSchedule(snapshot),...options
});

test('pre-apply Work form shows canonical downstream working-calendar dates without changing any data',()=>{
 const f=fixture(),before=serialize(f.snapshot),beforeProj=portfolioSchedule(f.snapshot);
 const result=preview(f.snapshot,f.upstream,f.workId,'3');
 assert.equal(result.kind,'changed');
 assert.equal(result.portfolioIssue,null);
 assert.equal(result.portfolioImpact.linkedTotal,1);
 assert.equal(result.portfolioImpact.affectedTotal,1);
 assert.deepEqual(result.portfolioImpact.rows.map(row=>({id:row.id,previousStart:row.previousStart,
  projectedStart:row.projectedStart,previousFinish:row.previousFinish,projectedFinish:row.projectedFinish})),
 [{id:f.downstreamId,previousStart:'2026-11-20',projectedStart:'2026-11-21',
   previousFinish:'2026-11-24',projectedFinish:'2026-11-25'}]);
 assert.equal(serialize(f.snapshot),before);
 assert.deepEqual(portfolioSchedule(f.snapshot).totals,beforeProj.totals);
});

test('invalid and unchanged fields never calculate fictional portfolio consequences',()=>{
 const f=fixture();
 const invalid=preview(f.snapshot,f.upstream,f.workId,'3.5');
 const unchanged=preview(f.snapshot,f.upstream,f.workId,'2');
 assert.equal(invalid.kind,'invalid');
 assert.equal(invalid.portfolioImpact,undefined);
 assert.equal(unchanged.kind,'unchanged');
 assert.equal(unchanged.portfolioImpact,undefined);
 const downstream=f.snapshot.projects.find(p=>p.id===f.downstreamId);
 const isolated=preview(f.snapshot,downstream,downstream.items[0].id,'3');
 assert.equal(isolated.kind,'changed');
 assert.equal(isolated.portfolioImpact,null);
});

test('a follow-up Work preview compares both the next edit and cumulative first baseline',()=>{
 const f=fixture();
 const initial=portfolioSchedule(f.snapshot);
 const state=editItem(f.snapshot,f.upstream.id,f.workId,{estimateDays:3});
 const updated=state.projects.find(p=>p.id===f.upstream.id);
 const next=preview(state,updated,f.workId,'4',{cumulativePortfolioBaseline:initial});
 assert.equal(next.kind,'changed');
 assert.equal(next.portfolioImpact.source.previousFinish,'2026-11-21');
 assert.equal(next.portfolioCumulative.source.previousFinish,'2026-11-20');
 assert.equal(next.portfolioCumulative.source.projectedFinish,'2026-11-22');
 assert.equal(next.portfolioImpact.affectedTotal,1);
 assert.equal(next.portfolioCumulative.affectedTotal,1);
});

test('stale project identity warns rather than presenting unrelated portfolio dates',()=>{
 const f=fixture(),stale=structuredClone(f.upstream);
 const result=preview(f.snapshot,stale,f.workId,'3');
 assert.equal(result.kind,'changed');
 assert.equal(result.portfolioImpact,null);
 assert.match(result.portfolioIssue,/Проект изменился/);
});

test('pre-apply portfolio summary appears in the existing compact native Work form',()=>{
 const ui=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../desktop/src/style.css',import.meta.url),'utf8');
 const form=ui.indexOf('Связанные проекты до применения правки');
 const submit=ui.indexOf('className="form-footer"',form);
 assert.ok(form>0&&submit>form,'Pre-apply effect must be displayed before draft confirmation');
 assert.match(ui,/portfolioSnapshot=\{data\} portfolioBefore=\{dates\}/);
 assert.match(ui,/cumulativePortfolioBaseline=\{correctionBaseline\?recentPlanBefore\?\.portfolioBaseline:null\}/);
 assert.match(ui,/aria-label="Предварительный прогноз связанных проектов"/);
 assert.match(css,/\.editor-panel \.atlas-work-draft-portfolio\{/);
 assert.doesNotMatch(ui.slice(form,submit),/onClick=\{.*editItem\(/);
});
