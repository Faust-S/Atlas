// Read-only cross-project consequence projection. Does not verify or execute delivery.
import {validatePortfolioLinks} from './portfolio.mjs';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const riskStates = new Set(['unknown','stale','conflict','gap_reported','partial_reported']);
const rootRank = {blocked:3,review:2,waiting:1};
const required = project => (project.targets || []).filter(t => t.intent === 'committed').length;
const sourceIssues = project => (project.sources || []).filter(s => s.status === 'error' || s.status === 'never' || s.summary?.complete === false).length;

// inspectProject must be the Atlas impact projection, rather than a competing assessment engine.
// Exact current revision/freshness logic remains owned by projectImpact/compareProject.
export function portfolioCascade(snapshot, inspectProject) {
 if (typeof inspectProject !== 'function') throw Error('Atlas project assessment required');
 const order = validatePortfolioLinks(snapshot), byId = new Map(snapshot.projects.map(p => [p.id,p]));
 const incoming = new Map(order.map(id => [id,[]])), outgoing = new Map(order.map(id => [id,[]]));
 for (const edge of snapshot.portfolioLinks || []) {
  incoming.get(edge.to).push(edge.from);
  outgoing.get(edge.from).push(edge.to);
 }
 const rows = new Map();
 for (const id of order) {
  const project = byId.get(id), impact = inspectProject(project);
  if (!impact || !Array.isArray(impact.rows)) throw Error('Invalid project assessment');
  const blockedWork = (project.items || []).filter(item => item.state === 'blocked').length;
  const statusBlock = project.status === 'paused' || project.status === 'cancelled';
  const flagged = impact.rows.filter(x => x.intent === 'committed' && riskStates.has(x.assessment));
  const unknownCriteria = required(project) === 0;
  const issues = sourceIssues(project);
  const local = [];
  if (statusBlock) local.push({kind:'blocked',message:'Проект приостановлен или отменён'});
  if (blockedWork) local.push({kind:'blocked',message:'Заблокированные работы: '+blockedWork});
  if (flagged.length) local.push({kind:'review',message:'Требования с пробелами или без актуальных подтверждений: '+flagged.length});
  if (issues) local.push({kind:'review',message:'Источники без надёжного наблюдения: '+issues});
  if (unknownCriteria) local.push({kind:'review',message:'Обязательные критерии результата не определены'});
  // A completed checkbox cannot resolve a project-to-project delivery contract.
  if (project.status === 'completed') local.push({kind:'review',message:'Завершение заявлено, независимая приёмка не установлена'});
  const inherited = new Map();
  for (const from of incoming.get(id)) {
   const predecessor = rows.get(from), p = byId.get(from);
   if (p.status !== 'completed') {
    const key = from+':waiting';
    inherited.set(key,{originId:from,kind:'waiting',path:[from,id],message:'Результат предшествующего проекта ещё не заявлен завершённым'});
   } else {
    const key = from+':review';
    inherited.set(key,{originId:from,kind:'review',path:[from,id],message:'Завершение предшественника заявлено без независимой приёмки'});
   }
   for (const root of predecessor.propagated) {
    const next = {...root,path:[...root.path,id]};
    const key = root.originId+':'+root.kind+':'+root.message;
    const previous = inherited.get(key);
    if (!previous || previous.path.length > next.path.length) inherited.set(key,next);
   }
  }
  const propagated = [...local.map(signal=>({originId:id,...signal,path:[id]})),...inherited.values()];
  const highest = Math.max(0,...propagated.map(x=>rootRank[x.kind]||0));
  rows.set(id,{
   id,name:project.name,status:project.status,required:required(project),blockedWork,sourceIssues:issues,
   local,propagated,inherited:[...inherited.values()],attention:flagged.length,
   level:highest===3?'blocked':highest===2?'review':highest===1?'waiting':'unassessed',
   upstream:incoming.get(id),downstream:outgoing.get(id),downstreamAll:[],affectedRequirements:0
  });
 }
 // Compute reachability once in reverse topological order; deduplicate diamond graphs.
 for (const id of [...order].reverse()) {
  const affected = new Set();
  for (const child of outgoing.get(id)) {
   affected.add(child);
   for (const indirect of rows.get(child).downstreamAll) affected.add(indirect);
  }
  const row = rows.get(id);
  row.downstreamAll = [...affected];
  row.affectedRequirements = [...affected].reduce((sum,child)=>sum+rows.get(child).required,0);
 }
 const projects = snapshot.projects.map(p=>rows.get(p.id));
 return {projects,byId:rows,
  totals:{projects:projects.length,linked:(snapshot.portfolioLinks||[]).length,
   explicitBlockers:projects.filter(row=>row.local.some(s=>s.kind==='blocked')).length,
   exposed:projects.filter(row=>row.inherited.length>0).length,
   waiting:projects.filter(row=>row.level==='waiting').length,
   review:projects.filter(row=>row.level==='review').length},
  warning:'Плановые зависимости и заявленные результаты не подтверждают фактическую готовность продукта'};
}

const label = {blocked:'Явная блокировка',review:'Требуется проверка',waiting:'Ожидает предшественников',unassessed:'Нет сигналов о блокировках'};
const levelLabel = row => row.level === 'blocked' && !row.local.some(x=>x.kind==='blocked') ? 'Риск блокировки по цепочке' : label[row.level];
function causes(row,byId,escape,limit=4) {
 const relevant = [...row.local.map(c=>({...c,path:[row.id]})),...row.inherited]
  .sort((a,b)=>(rootRank[b.kind]||0)-(rootRank[a.kind]||0)||a.path.length-b.path.length);
 if (!relevant.length) return '<span class="muted">Явные блокировки не обнаружены; готовность не подтверждена</span>';
 return '<ul class="atlas-cascade-causes">'+relevant.slice(0,limit).map(c=>'<li>'+escape(c.message)+
  (c.path.length>1?' · '+escape(c.path.map(id=>byId.get(id)?.name||id).join(' → ')):'')+'</li>').join('')+
  (relevant.length>limit?'<li>Ещё '+(relevant.length-limit)+' причин</li>':'')+'</ul>';
}
export function renderPortfolioCascade(snapshot, inspectProject, {mode='attention',escape=escapeHtml}={}) {
 if (!['attention','all'].includes(mode)) throw Error('Unknown portfolio cascade filter');
 const analysis = portfolioCascade(snapshot,inspectProject),all=analysis.projects;
 const visible = mode==='all'?all:all.filter(r=>r.level!=='unassessed'||r.downstreamAll.length>0);
 const trs = visible.map(row=>'<tr><td><button data-action="open:'+escape(row.id)+'" class="atlas-plain-button">'+escape(row.name)+'</button></td><td>'+escape(levelLabel(row))+'</td><td>'+row.downstreamAll.length+'</td><td>'+row.affectedRequirements+'</td><td>'+causes(row,analysis.byId,escape,3)+'</td></tr>').join('');
 return '<section class="card atlas-cascade"><h2>Последствия зависимостей портфеля</h2>'+
  '<p class="muted">Учитываются явные блокировки, заявления о фактическом состоянии, свежесть источников и все транзитивные зависимости. Обязательные результаты ниже — зона возможного влияния, не доказанный ущерб.</p>'+
  '<div class="atlas-kpis"><div><small>Проекты с явной блокировкой</small><strong>'+analysis.totals.explicitBlockers+'</strong></div><div><small>Затронуты зависимостями</small><strong>'+analysis.totals.exposed+'</strong></div><div><small>Требуют пересмотра</small><strong>'+analysis.totals.review+'</strong></div><div><small>Ожидают предшественников</small><strong>'+analysis.totals.waiting+'</strong></div></div>'+
  '<div class="row"><label for="atlas-cascade-mode">Показать</label><select id="atlas-cascade-mode"><option value="attention"'+(mode==='attention'?' selected':'')+'>Есть риски / влияет на других</option><option value="all"'+(mode==='all'?' selected':'')+'>Все проекты</option></select></div>'+
  '<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr><th>Проект</th><th>Состояние</th><th>Зависимых далее</th><th>Обязательных результатов под влиянием</th><th>Основания и пути влияния</th></tr></thead><tbody>'+trs+'</tbody></table></div>'+
  (visible.length?'':'<p class="muted">Нет связей и известных проблем по выбранному фильтру.</p>')+'</section>';
}
export function renderProjectCascade(snapshot,projectId,inspectProject,escape=escapeHtml) {
 const analysis = portfolioCascade(snapshot,inspectProject),row=analysis.byId.get(projectId);
 if (!row) return '';
 const affected = row.downstreamAll.map(id=>analysis.byId.get(id));
 const list = affected.slice(0,30).map(p=>'<li><button data-action="open:'+escape(p.id)+'" class="atlas-plain-button">'+escape(p.name)+'</button> · '+p.required+' обязательных результатов</li>').join('');
 return '<section class="card atlas-cascade"><h2>Влияние на другие проекты</h2><p>'+escape(levelLabel(row))+'. Ниже показаны все зависимые проекты, в том числе через несколько связей. Это зона влияния, не подтверждение фактической остановки.</p>'+
  causes(row,analysis.byId,escape,6)+
  '<p><strong>Далее затрагивает:</strong> '+affected.length+' проектов, '+row.affectedRequirements+' обязательных результатов</p>'+
  (affected.length?'<ul>'+list+'</ul>':'<p class="muted">Исходящих зависимостей нет.</p>')+
  (affected.length>30?'<p class="muted">Показаны первые 30 проектов.</p>':'')+'</section>';
}
