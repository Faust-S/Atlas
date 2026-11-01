// Dependency graph and time lanes are projections, never proof of acceptance.
import {scheduleProject} from "./planning.mjs";
const escape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function renderDependencyGraph(project,{mode="all"}={}){
 if(!["all","critical","blocked"].includes(mode))throw Error("Unknown graph filter");
 const plan=scheduleProject(project);
 const rows=plan.rows;
 if(!rows.length)return '<p class="muted">Добавьте работы, чтобы увидеть граф зависимостей.</p>';
 const relevant=rows.filter(r=>mode==="all"||mode==="critical"&&r.critical||mode==="blocked"&&(r.blockedBy.length>0||r.state==="blocked"));
 const selected=new Set(relevant.map(r=>r.id)),labels=new Map(project.items.map(x=>[x.id,x.title]));
 const edges=project.dependencies.filter(e=>selected.has(e.from)&&selected.has(e.to));
 const outgoing=new Map(rows.map(r=>[r.id,[]])),incoming=new Map(rows.map(r=>[r.id,[]]));
 for(const e of project.dependencies){outgoing.get(e.from)?.push(e.to);incoming.get(e.to)?.push(e.from)}
 const levels=new Map();
 for(const row of rows)levels.set(row.id,Math.max(0,...(incoming.get(row.id)||[]).map(x=>(levels.get(x)||0)+1)));
 const buckets=new Map();
 for(const row of relevant){const level=levels.get(row.id)||0;if(!buckets.has(level))buckets.set(level,[]);buckets.get(level).push(row)}
 const levelsSorted=[...buckets.keys()].sort((a,b)=>a-b);
 const maxNodes=150;
 if(relevant.length>maxNodes)return '<p class="muted">Граф содержит '+relevant.length+' работ: показана компактная схема уровнями, используйте фильтр. Полная таблица планирования доступна выше.</p>'+renderLanes(relevant.slice(0,maxNodes),plan.durationDays);
 const nodes=relevant.map(r=>{
  const level=levels.get(r.id)||0,position=buckets.get(level).indexOf(r);
  const x=24+level*246,y=24+position*108;
  const pending=r.blockedBy.length>0||r.state==="blocked";
  return {id:r.id,title:r.title,state:r.state,critical:r.critical,pending,x,y,width:206,height:78,predecessors:r.predecessors.map(x=>labels.get(x)||x),blockedBy:r.blockedBy.map(x=>labels.get(x)||x)};
 });
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const width=Math.max(360,Math.max(...nodes.map(n=>n.x+n.width))+24);
 const height=Math.max(152,Math.max(...nodes.map(n=>n.y+n.height))+24);
 const edgeSvg=edges.map(e=>{
  const a=byId.get(e.from),b=byId.get(e.to);if(!a||!b)return "";
  const x1=a.x+a.width,y1=a.y+a.height/2,x2=b.x,y2=b.y+b.height/2,cx=(x1+x2)/2;
  return '<path d="M'+x1+' '+y1+' C'+cx+' '+y1+' '+cx+' '+y2+' '+x2+' '+y2+'" stroke="#8497a9" fill="none" stroke-width="2" marker-end="url(#atlas-arrow)"/>';
 }).join("");
 const nodeSvg=nodes.map(n=>{
  const color=n.pending?"#af6540":n.critical?"#267b78":"#526d89";
  const max=26,short=n.title.length>max?n.title.slice(0,max-1)+"…":n.title;
  return '<g><title>'+escape(n.title+'; '+n.state+(n.critical?'; критический путь':'')+(n.pending?'; блокировка':''))+'</title><rect x="'+n.x+'" y="'+n.y+'" width="'+n.width+'" height="'+n.height+'" rx="11" fill="#fff" stroke="'+color+'" stroke-width="2"/><text x="'+(n.x+12)+'" y="'+(n.y+27)+'" font-size="13" fill="#213f50">'+escape(short)+'</text><text x="'+(n.x+12)+'" y="'+(n.y+51)+'" font-size="11" fill="'+color+'">'+escape(n.pending?"Есть блокировка":n.critical?"Критический путь":"Плановая работа")+'</text></g>';
 }).join("");
 const accessible=nodes.map(n=>'<li><strong>'+escape(n.title)+'</strong> · '+escape(n.state)+(n.predecessors.length?' · После: '+escape(n.predecessors.join(", ")):"")+'</li>').join("");
 return '<div class="atlas-graph-scroll" role="region" aria-label="Граф зависимостей" tabindex="0"><svg viewBox="0 0 '+width+' '+height+'" width="'+width+'" height="'+height+'" role="img" aria-label="Граф из '+nodes.length+' работ и '+edges.length+' связей"><defs><marker id="atlas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#8497a9"/></marker></defs>'+edgeSvg+nodeSvg+'</svg></div><details><summary>Текстовое представление графа</summary><ol>'+accessible+'</ol></details>';
}
function renderLanes(rows,duration){
 const total=Math.max(1,duration);
 return '<div class="atlas-timeline">'+rows.map(r=>{
  const left=Math.min(100,Math.max(0,r.earlyStart/total*100)),width=Math.max(1,r.durationDays/total*100);
  return '<div class="atlas-timeline-row"><span title="'+escape(r.title)+'">'+escape(r.title)+'</span><div class="atlas-track"><span class="atlas-bar '+(r.critical?"critical":"")+'" style="left:'+left.toFixed(2)+'%;width:'+Math.min(width,100-left).toFixed(2)+'%" title="'+escape(r.title)+': '+r.earlyStart+'–'+r.earlyFinish+' день"></span></div><small>'+r.earlyStart+'–'+r.earlyFinish+'</small></div>';
 }).join("")+'</div>';
}
export function renderTimeline(project){const plan=scheduleProject(project);if(!plan.rows.length)return '<p class="muted">Для временной шкалы добавьте работы.</p>';
 return '<p class="muted">Расчёт от даты начала проекта · '+plan.durationDays+' календарных дней · красная шкала — критический путь. Процент выполнения не выводится из графика.</p>'+renderLanes(plan.rows,plan.durationDays);
}
