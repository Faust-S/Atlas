import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ganttViewport,dependencyDiagram,ganttFocusOffset} from '../desktop/src/visual-layout.mjs';
const rows=[
 {id:'A',title:'A',state:'done',critical:true,earlyStart:0,earlyFinish:3,durationDays:3,floatDays:0,predecessors:[]},
 {id:'B',title:'B',state:'todo',critical:false,earlyStart:0,earlyFinish:2,durationDays:2,floatDays:1,predecessors:[]},
 {id:'C',title:'C',state:'blocked',critical:true,earlyStart:3,earlyFinish:7,durationDays:4,floatDays:0,blockedBy:['A'],predecessors:['A','B']},
 {id:'D',title:'D',state:'todo',critical:true,earlyStart:7,earlyFinish:7,durationDays:0,floatDays:0,predecessors:['C']}
];
const schedule={durationDays:7,rows};
test('calendar Gantt follows original CPM without inventing progress',()=>{
 const original=JSON.stringify(schedule);
 const view=ganttViewport(schedule,{startDate:'2026-11-01',dueDate:'2026-11-06'});
 assert.equal(view.rows[2].dateStart,'2026-11-04');
 assert.equal(view.rows[2].dateFinish,'2026-11-08');
 assert.equal(view.deadline.day,5);
 assert.equal(view.rows[3].isMilestone,true);
 assert.equal(view.rows[3].leftPct,100);
 assert.equal(JSON.stringify(schedule),original);
});
test('relative Gantt zoom clips spans and clamps navigation',()=>{
 const view=ganttViewport({rows:[{id:'X',earlyStart:40,earlyFinish:80,durationDays:40}],durationDays:150},
  {scale:'30',offset:44,dueDate:'2026-11-01'});
 assert.equal(view.dated,false);
 assert.equal(view.from,44);
 assert.equal(view.until,74);
 assert.equal(view.rows[0].leftPct,0);
 assert.equal(view.rows[0].widthPct,100);
 assert.equal(view.deadline,null);
 assert.match(view.windowLabel,/День 44/);
 assert.equal(ganttViewport({rows:[],durationDays:150},{scale:'90',offset:999}).from,60);
});
test('zoomed Gantt selects the current work window instead of offscreen first rows',()=>{
 const long={durationDays:300,rows:Array.from({length:210},(_,i)=>({
  id:'task-'+i,title:'Work '+i,earlyStart:i,earlyFinish:i+1
 }))};
 const window=ganttViewport(long,{scale:'30',offset:170});
 assert.equal(window.rows[0].visible,false);
 assert.equal(window.rows[170].visible,true);
 assert.equal(window.rows.filter(row=>row.visible).length,30);
 const ui=readFileSync(new URL('../desktop/src/ProjectVisuals.tsx',import.meta.url),'utf8');
 assert.match(ui,/const inWindow=matching\.filter\(\(r:any\)=>r\.visible\)/);
 assert.match(ui,/scale==='fit'\?matching:inWindow/);
 assert.match(ui,/Перейти к ближайшей работе/);
 assert.match(ui,/const focusMatch=\(index:number\)=>/);
 assert.match(ui,/ganttFocusOffset\(schedule,row\.id,targetScale\)/);
 assert.match(ui,/Показать на шкале/);
});
test('Gantt search jumps to real work at zoom and near schedule end',()=>{
 const schedule={durationDays:240,rows:Array.from({length:240},(_,i)=>({id:'w-'+i,title:'Work '+i,earlyStart:i,earlyFinish:i+1}))};
 const before=JSON.stringify(schedule);
 assert.equal(ganttFocusOffset(schedule,'w-170','30'),164);
 assert.equal(ganttFocusOffset(schedule,'w-170','90'),150);
 assert.equal(ganttFocusOffset(schedule,'w-0','30'),0);
 assert.equal(ganttFocusOffset(schedule,'w-239','30'),210);
 assert.equal(ganttViewport(schedule,{scale:'30',offset:ganttFocusOffset(schedule,'w-170','30')}).rows[170].visible,true);
 assert.throws(()=>ganttFocusOffset(schedule,'missing','30'),/not found/);
 assert.throws(()=>ganttFocusOffset(schedule,'w-170','fit'),/Unsupported/);
 assert.equal(JSON.stringify(schedule),before);
});
test('dependency layout follows DAG and highlights critical links only',()=>{
 const graph=dependencyDiagram(schedule);
 assert.equal(graph.nodes.length,4);
 assert.equal(graph.edges.length,3);
 assert.ok(graph.nodes.find(x=>x.id==='C').x>graph.nodes.find(x=>x.id==='A').x);
 assert.ok(graph.nodes.find(x=>x.id==='D').x>graph.nodes.find(x=>x.id==='C').x);
 assert.equal(graph.edges.find(e=>e.from==='B'&&e.to==='C').critical,false);
 assert.equal(graph.edges.find(e=>e.from==='C'&&e.to==='D').critical,true);
 assert.ok(graph.edges.every(e=>/^M \d+/.test(e.path)));
});
test('large graph limits display but focus keeps a local DAG neighborhood',()=>{
 const many=[];
 for(let i=0;i<160;i++)many.push({id:String(i),title:'Work '+i,critical:false,
  earlyStart:i,earlyFinish:i+1,predecessors:i?[String(i-1)]:[]});
 const first=dependencyDiagram({rows:many},{limit:20});
 assert.equal(first.shown,20);assert.equal(first.total,160);assert.equal(first.partial,true);
 const focused=dependencyDiagram({rows:many},{limit:20,focusId:'100'});
 assert.equal(focused.shown,5);
 assert.deepEqual(new Set(focused.nodes.map(n=>n.id)),new Set(['98','99','100','101','102']));
 assert.equal(focused.edges.length,4);
});
test('empty portfolio and zero-day schedule can render without invented dates',()=>{
 assert.deepEqual(dependencyDiagram({rows:[]}).nodes,[]);
 const value=ganttViewport({rows:[],durationDays:0});
 assert.equal(value.days,1);assert.equal(value.visibleCount,0);
});

test('desktop workbench actually mounts existing Gantt/DAG and preserves real editing actions',()=>{
 const entry=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
 const component=readFileSync(new URL('../desktop/src/ProjectVisuals.tsx',import.meta.url),'utf8');
 assert.match(entry,/import\s*\{ProjectGantt,ProjectDependencyDiagram\}\s*from\s*["']\.\/ProjectVisuals["']/);
 assert.match(entry,/tab==="timeline"[\s\S]*?<ProjectGantt/);
 assert.match(entry,/tab==="graph"[\s\S]*?<ProjectDependencyDiagram/);
 assert.match(entry,/onEditDates=\{\(\)=>openEditor\("dates"\)\}/);
 assert.match(entry,/onOpenWork=\{id=>openEditor\("work:"\+id\)\}/);
 assert.match(component,/onEditDates:\(\)=>void/);
 assert.match(component,/projectStatus==='paused'\|\|projectStatus==='cancelled'/);
 assert.match(component,/исходный календарный план CPM/);
 assert.match(entry,/projectStatus=\{project.status\}/);
 assert.match(entry,/unavailableOrigins=\{projected\?\.unavailableOrigins\|\|\[\]\}/);
 assert.match(entry,/onOpenProject=\{id=>selectProject\(id\)\}/);
 assert.match(component,/unavailableOrigins\.slice\(0,5\)\.map/);
 assert.match(component,/Поставка этого проекта не имеет расчётной даты/);
 assert.match(component,/onClick=\{\(\)=>\{setExpanded\(false\);onOpenProject\(origin.id\)\}\}/);
 assert.match(component,/onClick=\{\(\)=>\{setExpanded\(false\);onEditDates\(\)\}\}/);
 assert.match(entry,/getCurrentWindow\(\)\.setTitle\("IWXA Atlas — "/);
 assert.match(entry,/\[native,embedded,ready,project\?\.name,tab,editor\?\.spec\.title,dirty,savedRefPreview\?\.label\]/);
 assert.match(entry,/Форма: /);
 assert.match(entry,/Не сохранено/);
 assert.match(entry,/Digit1:"work",Digit2:"timeline",Digit3:"graph"/);
 assert.match(entry,/openEditor\(code==="KeyN"\?"item":"dep"\)/);
 assert.match(entry,/code==="KeyL"&&project\.items\.length<2/);
 assert.match(entry,/title="Ctrl\+Shift\+N"/);
 assert.match(entry,/title="Ctrl\+Shift\+L"/);
 assert.match(entry,/reviewRows\.slice\(0,reviewLimit\)/);
 assert.match(entry,/sourceQueue\.rows\.slice\(0,sourceLimit\)/);
 assert.match(entry,/recheckRows\.slice\(0,recheckLimit\)/);
 assert.match(entry,/Показать ещё решения/);
 assert.match(entry,/Показать ещё источники/);
 assert.match(entry,/Показать ещё проверки/);
 assert.doesNotMatch(entry,/\.slice\(0,20\)\.map\(\(r:any,i:number\)=>/);
 assert.match(component,/setVisibleLimit\(limit=>Math\.min\(candidates\.length,limit\+160\)\)/);
 assert.match(component,/Показать ещё 160 работ/);
 assert.match(component,/const displayed=candidates\.slice\(0,visibleLimit\)/);
 assert.doesNotMatch(entry,/className="graph-list"/);
 assert.doesNotMatch(entry,/className="timeline-line"/);
});

test("R3 impact preview exposes all affected projects and resources",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/const \[projectLimit,setProjectLimit\]=useState\(40\)/);
 assert.match(ui,/const \[resourceLimit,setResourceLimit\]=useState\(30\)/);
 assert.match(ui,/result\.rows\.slice\(0,projectLimit\)/);
 assert.match(ui,/result\.resourceRows\.slice\(0,resourceLimit\)/);
 assert.match(ui,/Показать ещё проекты/);
 assert.match(ui,/Показать ещё ресурсы/);
 assert.match(ui,/Строк последствий: \{result\.rows\.length\}/);
});

test("R4 plan amendments show concrete before/after changes and allow removal before approval",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/c\.planAmendments\.map\(\(a:any,i:number\)=>/);
 assert.match(ui,/a\.kind==="work"\?"work:"\+a\.itemId:"new_work:"\+a\.id/);
 assert.match(ui,/removeAmendment\(c\.id,key\)/);
 assert.match(ui,/\["proposed","deferred"\]\.includes\(c\.status\)&&!c\.planAppliedAt/);
 assert.match(ui,/if\(!confirmAction\("Убрать выбранную корректировку/);
 assert.match(ui,/Применить утверждённый план/);
});

test("R3 fullscreen workspace remains within the installed window and supports Escape",()=>{
 const ts=readFileSync(new URL("../desktop/src/ProjectVisuals.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(ts,/Развернуть график/);
 assert.match(ts,/Свернуть график/);
 assert.match(ts,/Развернуть граф/);
 assert.match(ts,/Свернуть граф/);
 assert.match(ts,/aria-expanded=\{expanded\}/);
 assert.match(ts,/role=\{expanded\?'dialog':undefined\}/);
 assert.equal((ts.match(/if\(event\.key==='Escape'\)/g)||[]).length,2);
 assert.match(css,/\.atlas-gantt-panel\.is-expanded,\.atlas-dag-panel\.is-expanded/);
 assert.match(css,/position:fixed;inset:10px;z-index:900/);
 assert.match(css,/\.atlas-dag-panel\.is-expanded \.atlas-dependency-scroll/);
});

test("fullscreen views release overlay before invoking project/work editors",()=>{
 const ts=readFileSync(new URL("../desktop/src/ProjectVisuals.tsx",import.meta.url),"utf8");
 assert.match(ts,/onClick=\{\(\)=>\{setExpanded\(false\);onEditDates\(\)\}\}/);
 assert.match(ts,/onClick=\{\(\)=>\{setExpanded\(false\);onOpenProject\(origin\.id\)\}\}/);
 assert.equal((ts.match(/setExpanded\(false\);onOpenWork\(row\.id\)/g)||[]).length,2);
 assert.match(ts,/setExpanded\(false\);onOpenWork\(node\.id\)/);
});
