import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scheduleProject} from '../src/planning.mjs';
import {startWorkCorrection} from '../src/work-correction-flow.mjs';
import {inspectorRecentCorrection} from '../desktop/src/inspector-work-context.mjs';

const project = () => ({
 id:'source',startDate:'2026-11-20',
 items:[{id:'a',title:'Поставка',estimateDays:2,state:'todo',priority:'normal',dueDate:null}],
 dependencies:[]
});

test('Inspector shows downstream Work corrections only for the matching source revision',()=>{
 const source=project();
 const baseline=scheduleProject(source);
 const next={...source,items:[{...source.items[0],estimateDays:3}]};
 const plan=scheduleProject(next);
 const context=startWorkCorrection({projectId:source.id,workId:'a',revision:19,
  beforePlan:baseline,afterPlan:plan});
 const linkedFollowups=[{projectId:'downstream',workId:'install'},
  {projectId:'downstream',workId:'test'}];
 const corrected={...context,revision:20,linkedFollowups};
 const unchanged=JSON.stringify(corrected);
 const result=inspectorRecentCorrection(next,20,'a',corrected,plan);
 assert.deepEqual(result.linkedFollowups,linkedFollowups);
 assert.equal(result.linkedFollowupCount,2);
 assert.equal(result.followupCount,0,'Source Work followups are a separate count');
 assert.equal(inspectorRecentCorrection(next,19,'a',corrected,plan),null,
  'A stale revision cannot display a cumulative correction');
 assert.equal(inspectorRecentCorrection({...next,id:'other'},20,'a',corrected,plan),null);
 assert.equal(JSON.stringify(corrected),unchanged,'Projection must not mutate session');
 result.linkedFollowups[0].workId='changed';
 assert.equal(corrected.linkedFollowups[0].workId,'install',
  'Inspector projections must not mutate correction history');
});

test('Absent and foreign work records do not create false downstream edit counts',()=>{
 const source=project(),plan=scheduleProject(source);
 const context=startWorkCorrection({projectId:source.id,workId:'a',revision:1,
  beforePlan:plan,afterPlan:plan});
 assert.deepEqual(inspectorRecentCorrection(source,1,'a',context,plan).linkedFollowups,[]);
 const invalid={...context,linkedFollowups:[null,{},
  {projectId:'source',workId:'a'},
  {projectId:'downstream',workId:''},
  {projectId:'downstream',workId:'b'}]};
 const view=inspectorRecentCorrection(source,1,'a',invalid,plan);
 assert.deepEqual(view.linkedFollowups,[{projectId:'downstream',workId:'b'}]);
 assert.equal(view.linkedFollowupCount,1);
});

test('Existing inspector renders the projected linked correction count in the impact section',()=>{
 const preview=readFileSync(new URL('../desktop/src/AtlasInspectorPreview.tsx',import.meta.url),'utf8');
 assert.match(preview,/correction\.linkedFollowups\?\.length>0/);
 assert.match(preview,/Правок в связанных проектах:/);
 assert.match(preview,/Прогноз от исходного плана/);
 const section=preview.indexOf('<strong>Последствия корректировки</strong>');
 const summary=preview.indexOf('correction.linkedFollowups?.length>0',section);
 const details=preview.indexOf('className="atlas-v6-portfolio-impact"',section);
 assert.ok(section>=0&&summary>section&&details>summary,
  'Linked correction count must appear before scroll-heavy portfolio details at 820x650');
 const helper=readFileSync(new URL('../desktop/src/inspector-work-context.mjs',import.meta.url),'utf8');
 assert.match(helper,/linkedFollowups,linkedFollowupCount:linkedFollowups\.length/);
});
