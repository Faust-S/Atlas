import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ganttViewport,dependencyDiagram} from '../desktop/src/visual-layout.mjs';
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
 assert.match(component,/onClick=\{\(\)=>onOpenProject\(origin.id\)\}/);
 assert.match(component,/onClick=\{onEditDates\}/);
 assert.match(entry,/getCurrentWindow\(\)\.setTitle\("IWXA Atlas — "/);
 assert.match(entry,/\[native,ready,project\?\.name,tab\]/);
 assert.match(entry,/Digit1:"work",Digit2:"timeline",Digit3:"graph"/);
 assert.match(entry,/openEditor\(code==="KeyN"\?"item":"dep"\)/);
 assert.match(entry,/code==="KeyL"&&project\.items\.length<2/);
 assert.match(entry,/title="Ctrl\+Shift\+N"/);
 assert.match(entry,/title="Ctrl\+Shift\+L"/);
 assert.doesNotMatch(entry,/className="graph-list"/);
 assert.doesNotMatch(entry,/className="timeline-line"/);
});
