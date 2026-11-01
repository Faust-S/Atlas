// Read-only response panel over existing projects, findings, changes, decisions and work.
// No independent task engine, execution authority or persistent response store.
const ESCAPE = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attentionStates = new Set(['unknown','stale','conflict','gap_reported','partial_reported','implemented_claim','test_claim']);
const statusLabel = {proposed:'Предложено',approved:'Утверждено',in_progress:'В работе',implemented:'Реализовано (заявлено)',deferred:'Отложено',rejected:'Отклонено'};
const activeChangeStatuses = new Set(['proposed','approved','in_progress']);
const signalOrder={blocked:0,review:1,planning:2};

export function validCauseKey(project,key){
 if(typeof key!=='string'||key.length>180)return false;
 if(['project-stopped','completion-review','criteria-missing'].includes(key))return true;
 const colon=key.indexOf(':');if(colon<1)return false;
 const kind=key.slice(0,colon),ref=key.slice(colon+1);
 if(!ref)return false;
 const lookup={
  'work-blocked':project.items,
  'source-issue':project.sources,
  'target-review':project.targets||[]
 };
 return Array.isArray(lookup[kind])&&lookup[kind].some(x=>x.id===ref);
}

export function projectSignals(project,impact){
 if(!project||!Array.isArray(impact?.rows))throw Error('Atlas project impact is required');
 const signals=[];
 const add=(key,title,detail,level,targetIds=[])=>signals.push({key,title,detail,level,targetIds});
 if(['paused','cancelled'].includes(project.status))add('project-stopped','Проект приостановлен или отменён','Требуется решение о продолжении или пересмотре плана','blocked');
 for(const item of project.items||[]){
  if(item.state==='blocked')add('work-blocked:'+item.id,'Заблокирована работа: '+item.title,'Уточнить препятствие и согласовать изменение плана','blocked',item.targetIds||[]);
 }
 for(const row of impact.rows){
  if(row.intent!=='committed'||!attentionStates.has(row.assessment))continue;
  const title='Требование: '+row.title;
  const reason=row.reasons?.join('; ')||'Достоверность результата требует проверки';
  add('target-review:'+row.targetId,title,reason,row.assessment==='gap_reported'||row.assessment==='partial_reported'?'planning':'review',[row.targetId]);
 }
 for(const source of project.sources||[]){
  if(source.status==='error'||source.status==='never'||source.summary?.complete===false)
   add('source-issue:'+source.id,'Источник требует сверки: '+source.locator,source.error||'Наблюдение отсутствует, неполно или устарело','review');
 }
 if(!(project.targets||[]).some(t=>t.intent==='committed'))add('criteria-missing','Не определены обязательные результаты','Уточнить требования и критерии достижения цели','planning');
 if(project.status==='completed')add('completion-review','Завершение проекта заявлено','Для принятия результата нужна независимая проверка','review');
 return signals.sort((a,b)=>signalOrder[a.level]-signalOrder[b.level]||a.title.localeCompare(b.title));
}

export function responseState(project,impact){
 const signals=projectSignals(project,impact);
 const known=new Map(signals.map(s=>[s.key,s]));
 const changes=project.changes||[],work=project.items||[],decisions=project.decisions||[];
 const rows=signals.map(signal=>{
  const related=changes.filter(change=>change.causeKey===signal.key);
  const active=related.filter(change=>activeChangeStatuses.has(change.status));
  const linkedWork=work.filter(item=>related.some(change=>change.id===item.changeId));
  const linkedDecisions=decisions.filter(decision=>related.some(change=>change.id===decision.changeId));
  return {...signal,changes:related,activeChanges:active,work:linkedWork,decisions:linkedDecisions,
   needsProposal:active.length===0,
   approvedWithoutWork:active.some(change=>['approved','in_progress'].includes(change.status)&&!linkedWork.some(item=>item.changeId===change.id))};
 });
 return {rows,signals:signals.length,unplanned:rows.filter(row=>row.needsProposal).length,
  proposed:rows.reduce((sum,row)=>sum+row.activeChanges.filter(c=>c.status==='proposed').length,0),
  approvedWithoutWork:rows.filter(row=>row.approvedWithoutWork).length,
  resolved:changes.filter(change=>change.causeKey&&!known.has(change.causeKey)).length};
}

export function portfolioResponses(snapshot,inspectProject){
 const rows=snapshot.projects.map(project=>{
  const state=responseState(project,inspectProject(project));
  return {projectId:project.id,name:project.name,...state};
 });
 return {rows,signals:rows.reduce((sum,row)=>sum+row.signals,0),
  unplanned:rows.reduce((sum,row)=>sum+row.unplanned,0),
  proposed:rows.reduce((sum,row)=>sum+row.proposed,0),
  approvedWithoutWork:rows.reduce((sum,row)=>sum+row.approvedWithoutWork,0)};
}

export function renderProjectResponses(project,impact,escape=ESCAPE){
 const state=responseState(project,impact);
 const rows=state.rows.slice(0,60).map(row=>{
  const plans=row.changes.map(change=>{
   const decisions=row.decisions.filter(decision=>decision.changeId===change.id);
   const jobs=row.work.filter(item=>item.changeId===change.id);
   const status='<span class="tag">'+escape(statusLabel[change.status]||change.status)+'</span>';
   let actions='';
   if(change.status==='proposed'||change.status==='deferred')actions='<button data-action="change:'+escape(change.id)+'">Рассмотреть</button>';
   if(change.status==='approved'||change.status==='in_progress')actions='<button data-action="work-change:'+escape(change.id)+'">＋ Работа по изменению</button>';
   const logs=decisions.map(d=>'<div class="muted">Решение: '+escape(d.text)+' · '+escape(d.at||'')+'</div>').join('');
   const linked=jobs.map(item=>'<div class="muted">Работа: '+escape(item.title)+' · '+escape(item.state)+'</div>').join('');
   return '<div class="atlas-response-plan"><strong>'+escape(change.title)+'</strong> '+status+' '+actions+logs+linked+'</div>';
  }).join('');
  const propose=row.needsProposal?'<button data-action="respond:'+escape(encodeURIComponent(row.key))+'" class="primary">Предложить изменение</button>':'';
  return '<div id="atlas-cause-'+escape(encodeURIComponent(row.key))+'" tabindex="-1" class="atlas-response-row atlas-focus-target"><div><strong>'+escape(row.title)+'</strong><p class="muted">'+escape(row.detail)+'</p></div><div>'+plans+propose+'</div></div>';
 }).join('');
 return '<section class="card atlas-response"><h2>Устранение причин и решения</h2><p class="muted">Сигнал → предлагаемое изменение → решение человека → плановая работа. Никаких автоматических утверждений и запусков исполнителей.</p>'+
  '<div class="atlas-kpis"><div><small>Сигналы</small><strong>'+state.signals+'</strong></div><div><small>Без активного плана</small><strong>'+state.unplanned+'</strong></div><div><small>Ожидают решения</small><strong>'+state.proposed+'</strong></div><div><small>Утверждено без работы</small><strong>'+state.approvedWithoutWork+'</strong></div></div>'+
  (rows?'<div class="atlas-response-list">'+rows+'</div>':'<p class="muted">Активных сигналов для действий не найдено; это не подтверждение готовности.</p>')+
  (state.resolved?'<p class="muted">Исторических изменений, причины которых больше не наблюдаются: '+state.resolved+'. Они остаются в журнале изменений.</p>':'')+
  (state.rows.length>60?'<p class="muted">Показаны первые 60 сигналов.</p>':'')+'</section>';
}

export function renderPortfolioResponses(snapshot,inspectProject,escape=ESCAPE){
 const value=portfolioResponses(snapshot,inspectProject);
 const rows=value.rows.filter(r=>r.signals).slice(0,100).map(row=>'<tr><td><button class="atlas-plain-button" data-action="open:'+escape(row.projectId)+'">'+escape(row.name)+'</button></td><td>'+row.signals+'</td><td>'+row.unplanned+'</td><td>'+row.proposed+'</td><td>'+row.approvedWithoutWork+'</td></tr>').join('');
 return '<section class="card"><h2>Решения и устранение проблем</h2><p class="muted">Планы действий привязаны к установленным причинам; окончательное утверждение и выполнение остаются за человеком или уполномоченным исполнителем.</p>'+
 '<div class="atlas-kpis"><div><small>Сигналы</small><strong>'+value.signals+'</strong></div><div><small>Без плана</small><strong>'+value.unplanned+'</strong></div><div><small>Ожидают решения</small><strong>'+value.proposed+'</strong></div><div><small>Утверждены без работ</small><strong>'+value.approvedWithoutWork+'</strong></div></div>'+
 (rows?'<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr><th>Проект</th><th>Сигналы</th><th>Без плана</th><th>Предложено</th><th>Нет работы</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="muted">Пока нет сигналов, требующих действий. Это не подтверждение готовности.</p>')+'</section>';
}
