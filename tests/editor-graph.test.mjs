import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,connect,editItem,serialize,deserialize,attach,observe} from "../src/core.mjs";
import {editorSpec,renderEditor,applyEditor} from "../src/editor.mjs";
import {addTarget} from "../src/trace.mjs";
import {renderDependencyGraph,renderTimeline} from "../src/graph.mjs";
const values=o=>({get:k=>o[k]??""});
test("editors create a project, target, finding, change, named work and dependency without UUID input",()=>{
 let s=empty();
 const project=applyEditor(s,null,"new",values({name:"Garden",type:"personal",goal:"Grow food"}));s=project.state;
 const pid=project.projectId;
 assert.match(renderEditor(editorSpec(null,"new"),x=>String(x)),/Новый проект/);
 s=applyEditor(s,pid,"stage",values({name:"Planning"})).state;
 const stage=s.projects[0].stages[0];
 s=applyEditor(s,pid,"item",values({title:"Prepare beds",stageId:stage.id,estimateDays:"2"})).state;
 s=applyEditor(s,pid,"item",values({title:"Plant seeds",estimateDays:"3"})).state;
 const [a,b]=s.projects[0].items;
 const spec=editorSpec(s.projects[0],"dep");
 assert.equal(spec.fields[0].options[0].label,"Prepare beds");
 assert.equal(spec.fields[0].value,a.id);
 assert.equal(spec.fields[1].value,b.id);
 assert.notEqual(spec.fields[0].value,spec.fields[1].value);
 s=applyEditor(s,pid,"dep",values({from:a.id,to:b.id})).state;
 assert.equal(s.projects[0].dependencies.length,1);
 assert.throws(()=>applyEditor(s,pid,"dep",values({from:b.id,to:a.id})),/cycle/);
 s=applyEditor(s,pid,"target",values({title:"Harvest",desired:"Food in autumn",intent:"committed"})).state;
 const target=s.projects[0].targets[0];
 s=applyEditor(s,pid,"finding",values({targetId:target.id,result:"partial",level:"implementation",note:"Trial crop"})).state;
 s=applyEditor(s,pid,"proposal",values({title:"Try another variety",targetId:target.id})).state;
 assert.equal(s.projects[0].findings.length,1);
 assert.equal(s.projects[0].changes.length,1);
 assert.match(renderDependencyGraph(s.projects[0]),/Prepare beds/);
 assert.match(renderTimeline(s.projects[0]),/atlas-timeline-row/);
 assert.equal(s.projects[0].items[1].state,"todo");
});
test("graph modes never promote a task completion to certified readiness",()=>{
 let s=createProject(empty(),{name:"Test"}),p=s.state.projects[0];
 const a=createItem(s.state,s.id,{title:"Build"}),b=createItem(a.state,s.id,{title:"Verify"});
 const d=connect(b.state,s.id,a.id,b.id),done=editItem(d,s.id,a.id,{state:"done"});
 p=done.projects[0];
 assert.match(renderDependencyGraph(p,{mode:"critical"}),/Критический путь/);
 assert.match(renderDependencyGraph(p,{mode:"blocked"}),/Нет заблокированных работ/);
 const blocked=editItem(done,s.id,b.id,{state:"blocked"});
 assert.match(renderDependencyGraph(blocked.projects[0],{mode:"blocked"}),/Есть блокировка/);
 assert.doesNotMatch(renderDependencyGraph(p),/сертифицирован/);
 assert.throws(()=>renderDependencyGraph(p,{mode:"oops"}),/filter/);
});

test("R2 portfolio dependency editor preselects different project IDs",()=>{
 const first=createProject(empty(),{name:"A"}),second=createProject(first.state,{name:"B"});
 const spec=editorSpec(null,"portfolio-link",second.state);
 assert.equal(spec.fields[0].value,first.id);
 assert.equal(spec.fields[1].value,second.id);
 assert.notEqual(spec.fields[0].value,spec.fields[1].value);
});

test("work observation editor fixes the exact target and persists the originating work",()=>{
 const project=createProject(empty(),{name:"Work evidence",type:"engineering"});
 const target=addTarget(project.state,project.id,{title:"Expected result",desired:"Review"});
 const other=addTarget(target.state,project.id,{title:"Other result",desired:"Separate"});
 const work=createItem(other.state,project.id,{title:"Implementation work",targetIds:[target.id]});
 const action="finding-work:"+encodeURIComponent(work.id)+":"+encodeURIComponent(target.id);
 const spec=editorSpec(work.state.projects[0],action);
 const selector=spec.fields.find(f=>f.name==="targetId");
 assert.equal(selector.value,target.id);
 assert.deepEqual(selector.options,[{value:target.id,label:"Expected result"}]);
 assert.match(spec.hint,/Implementation work/);
 const applied=applyEditor(work.state,project.id,action,values({targetId:target.id,result:"partial",level:"implementation",note:"Observed"}));
 const recorded=applied.state.projects[0].findings[0];
 assert.equal(recorded.targetId,target.id);
 assert.equal(recorded.workId,work.id);
 assert.equal(recorded.origin,"manual");
 assert.equal(recorded.result,"partial");
 assert.equal(deserialize(serialize(applied.state)).projects[0].findings[0].workId,work.id);
 assert.throws(()=>applyEditor(work.state,project.id,action,values({targetId:other.id,result:"partial"})),/Нельзя изменить требование/);
 assert.throws(()=>editorSpec(work.state.projects[0],"finding-work:"+encodeURIComponent(work.id)+":"+encodeURIComponent(other.id)),/не связана/);
 assert.equal(work.state.projects[0].findings.length,0);
});

test("work editor preserves secondary target links on ordinary edits and when primary changes",()=>{
 const made=createProject(empty(),{name:"Multi-target evidence",type:"engineering"});
 const a=addTarget(made.state,made.id,{title:"Alpha",desired:"A"});
 const b=addTarget(a.state,made.id,{title:"Beta",desired:"B"});
 const c=addTarget(b.state,made.id,{title:"Gamma",desired:"C"});
 const item=createItem(c.state,made.id,{title:"Both outcomes",targetIds:[a.id,b.id]});
 const action="work:"+item.id;
 const spec=editorSpec(item.state.projects[0],action);
 assert.match(spec.hint,/остальные сохраняются: Beta/);
 assert.equal(spec.fields.find(f=>f.name==="targetId").label,"Основное ожидаемое требование");
 const lone=createItem(item.state,made.id,{title:"Unlinked work",targetIds:[]});
 assert.equal(editorSpec(lone.state.projects[0],"work:"+lone.id).fields.find(f=>f.name==="targetId").label,
  "Связать с ожидаемым результатом");
 const form={title:"Renamed outcome",stageId:"",dueDate:"",state:"todo",priority:"normal",
  assignee:"",estimateDays:"1",resourceId:"",allocationPct:"100"};
 const before=serialize(item.state);
 const rename=applyEditor(item.state,made.id,action,values({...form,targetId:a.id}));
 assert.deepEqual(rename.state.projects[0].items[0].targetIds,[a.id,b.id]);
 assert.equal(rename.state.projects[0].items[0].title,"Renamed outcome");
 assert.equal(serialize(item.state),before,"Source snapshot mutated");
 const moved=applyEditor(rename.state,made.id,action,values({...form,targetId:c.id}));
 assert.deepEqual(moved.state.projects[0].items[0].targetIds,[c.id,b.id],
  "Selecting a new primary must preserve the secondary relation");
 const cleared=applyEditor(moved.state,made.id,action,values({...form,targetId:""}));
 assert.deepEqual(cleared.state.projects[0].items[0].targetIds,[b.id],
  "Clearing primary must not erase secondary work outcomes");
 assert.deepEqual(deserialize(serialize(cleared.state)).projects[0].items[0].targetIds,[b.id]);
});


test("GitHub source editor keeps human labels and validates repository before writing",()=>{
 const made=createProject(empty(),{name:"Source connection"}),s=made.state,pid=made.id;
 const spec=editorSpec(s.projects[0],"source");
 assert.equal(spec.title,"Добавить источник проекта");
 assert.equal(spec.fields[0].options[0].label,"Репозиторий GitHub");
 assert.equal(spec.fields[0].options[1].label,"Организация или пользователь GitHub");
 const invalid=serialize(s);
 assert.throws(()=>applyEditor(s,pid,"source",values({kind:"github",locator:"not-a-repository"})),/Введите адрес открытого репозитория/);
 assert.throws(()=>applyEditor(s,pid,"source",values({kind:"github_owner",locator:"https:\/\/invalid.example"})),/Введите имя или адрес/);
 assert.equal(serialize(s),invalid,"Invalid input may not change the project");
 const linked=applyEditor(s,pid,"source",values({kind:"github",locator:"https://github.com/example/project"})).state;
 assert.equal(linked.projects[0].sources[0].kind,"github");
 assert.equal(linked.projects[0].sources[0].locator,"https://github.com/example/project");
 assert.equal(linked.projects[0].sources[0].status,"never");
 const owner=applyEditor(linked,pid,"source",values({kind:"github_owner",locator:"example"})).state;
 assert.equal(owner.projects[0].sources[1].kind,"github_owner");
 const other=applyEditor(owner,pid,"source",values({kind:"gitlab",locator:"https://gitlab.com/example/project"})).state;
 assert.equal(other.projects[0].sources[2].kind,"gitlab");
 assert.equal(other.projects[0].sources[2].status,"never");
});

test("existing source editor keeps an optional selected GitHub branch through snapshots",()=>{
 const project=createProject(empty(),{name:"IWXA Atlas"});
 const editor=editorSpec(project.state.projects[0],"source");
 assert.ok(editor.fields.some(field=>field.name==="branch"&&!field.required));
 const updated=applyEditor(project.state,project.id,"source",
  values({kind:"github",locator:"Faust-S/Atlas",branch:"work/2026-11-09-atlas-0-5"})).state;
 const stored=deserialize(serialize(updated));
 assert.equal(stored.projects[0].sources[0].branch,"work/2026-11-09-atlas-0-5");
 const legacy=applyEditor(stored,project.id,"source",
  values({kind:"github",locator:"Faust-S/Center",branch:""})).state;
 assert.equal("branch" in legacy.projects[0].sources[1],false);
 assert.throws(()=>applyEditor(stored,project.id,"source",
  values({kind:"github_owner",locator:"Faust-S",branch:"main"})),/только для репозитория/);
 assert.throws(()=>applyEditor(stored,project.id,"source",
  values({kind:"github",locator:"Faust-S/Atlas",branch:"work/../bad"})),/корректное имя ветки/);
});

test("existing GitHub source changes branch without carrying old CI evidence",()=>{
 const project=createProject(empty(),{name:"Working project"});
 const attached=applyEditor(project.state,project.id,"source",
  values({kind:"github",locator:"Faust-S/Atlas",branch:"release/0.4"})).state;
 const original=attached.projects[0].sources[0],id=original.id;
 const spec=editorSpec(attached.projects[0],"source-branch:"+encodeURIComponent(id));
 assert.equal(spec.fields[0].name,"branch");
 assert.equal(spec.fields[0].value,"release/0.4");
 const observed=structuredClone(attached);
 observed.projects[0].sources[0].status="ok";
 observed.projects[0].sources[0].observedAt="2026-11-09T12:00:00Z";
 observed.projects[0].sources[0].summary={scope:"repository",ci:{state:"observed",branch:"release/0.4",conclusion:"success"}};
 const changed=applyEditor(observed,project.id,"source-branch:"+encodeURIComponent(id),
  values({branch:"work/2026-11-09-atlas-0-5"})).state;
 const source=changed.projects[0].sources[0];
 assert.equal(source.id,id);
 assert.equal(source.locator,"Faust-S/Atlas");
 assert.equal(source.branch,"work/2026-11-09-atlas-0-5");
 assert.equal(source.status,"never");
 assert.equal(source.observedAt,null);
 assert.equal(source.summary,null,"Previous branch CI must not be reused");
 assert.equal(source.error,null);
 assert.equal(changed.revision,observed.revision+1);
 const saved=deserialize(serialize(changed));
 assert.equal(saved.projects[0].sources[0].branch,source.branch);
 const cleared=applyEditor(saved,project.id,"source-branch:"+encodeURIComponent(id),
  values({branch:""})).state;
 assert.equal("branch" in cleared.projects[0].sources[0],false);
 assert.equal(cleared.projects[0].sources[0].status,"never");
 assert.equal(applyEditor(cleared,project.id,"source-branch:"+encodeURIComponent(id),
  values({branch:""})).state,cleared,"Unchanged branch must not create another revision");
 assert.throws(()=>editorSpec(cleared.projects[0],"source-branch:unknown"),/не найден/);
});

test("finding editor keeps explicitly checked nested branch outside paginated GitHub list",()=>{
 const project=createProject(empty(),{name:"Repository evidence",type:"engineering"});
 const target=addTarget(project.state,project.id,{title:"CI criteria",desired:"Reviewed result"});
 const selected="work/2026-11-09-atlas-0-5",sha="c".repeat(40);
 const linked=attach(target.state,project.id,"github","Faust-S/Atlas",{branch:selected});
 const enumerated=Array.from({length:100},(_,i)=>"old-branch-"+i);
 const observed=observe(linked.state,project.id,linked.id,"ok",{
  scope:"repository",complete:false,branches:enumerated,
  defaultBranch:"main",branchHeads:{[selected]:sha},observedAt:new Date().toISOString(),
  ci:{state:"observed",branch:selected,headSha:sha,headCurrent:"current",
   status:"completed",conclusion:"success",runId:3}
 });
 const spec=editorSpec(observed.projects[0],"finding-target:"+target.id);
 const options=spec.fields.find(x=>x.name==="sourceRef")?.options||[];
 assert.equal(options[1].value,linked.id+"::"+selected);
 assert.match(options[1].label,/редакция наблюдалась/);
 assert.equal(options.filter(x=>x.value===linked.id+"::"+selected).length,1);
 assert.equal(options.length,102,"User's selected branch supplements capped list exactly once");
 const recorded=applyEditor(observed,project.id,"finding-target:"+target.id,values({
  targetId:target.id,result:"partial",level:"test",
  sourceRef:linked.id+"::"+selected,note:"Human-reviewed test results"
 }));
 const finding=recorded.state.projects[0].findings[0];
 assert.equal(finding.ref,selected);
 assert.equal(finding.revision,sha);
 assert.equal(finding.sourceId,linked.id);
 assert.equal(finding.origin,"manual");
 assert.equal(recorded.state.projects[0].items.length,0);
 assert.deepEqual(deserialize(serialize(recorded.state)),recorded.state);
});
test("source choice never presents a branch as checked without its observed revision",()=>{
 const project=createProject(empty(),{name:"Source evidence",type:"engineering"});
 const target=addTarget(project.state,project.id,{title:"Evidence",desired:"Known state"});
 const preferred="release/0.5";
 const source=attach(target.state,project.id,"github","Faust-S/Atlas",{branch:preferred});
 const observed=observe(source.state,project.id,source.id,"ok",{
  scope:"repository",complete:false,branches:["main"],branchHeads:{main:"b".repeat(40)},
  observedAt:new Date().toISOString()
 });
 const spec=editorSpec(observed.projects[0],"finding-target:"+target.id);
 const options=spec.fields.find(x=>x.name==="sourceRef").options;
 assert.equal(options[1].value,source.id+"::"+preferred);
 assert.match(options[1].label,/редакция не подтверждена/);
 assert.doesNotMatch(options[1].label,/редакция наблюдалась/);
 const recorded=applyEditor(observed,project.id,"finding-target:"+target.id,values({
  targetId:target.id,result:"partial",sourceRef:source.id+"::"+preferred
 }));
 assert.equal(recorded.state.projects[0].findings[0].revision,null);
 assert.equal(recorded.state.projects[0].findings[0].origin,"manual");
});
