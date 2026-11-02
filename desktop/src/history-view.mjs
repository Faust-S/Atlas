// UI-only projection of the existing decision/finding history. Never changes source records.
const timestamp = value => {
 const ms=typeof value==='string'?Date.parse(value):NaN;
 return Number.isFinite(ms)?ms:Number.NEGATIVE_INFINITY;
};
const lower = value => String(value??'').toLocaleLowerCase('ru-RU');
export function projectHistoryRows(project,{kind='all',query=''}={}){
 if(!['all','decision','finding'].includes(kind))throw Error('Unknown history filter');
 const sourceById=new Map((project.sources||[]).map(s=>[s.id,s]));
 let order=0;
 const rows=[
  ...(project.decisions||[]).map(d=>({
   id:d.id,kind:'decision',at:d.at||null,text:d.text||'',source:null,
   revision:d.reviewRevision||null,_order:order++
  })),
  ...(project.findings||[]).map(f=>({
   id:f.id,kind:'finding',at:f.observedAt||null,text:f.note||f.result||'',
   source:sourceById.get(f.sourceId)?.locator||null,revision:f.revision||null,
   _order:order++
  }))
 ];
 const q=lower(query).trim();
 return rows.filter(r=>(kind==='all'||r.kind===kind)&&
  (!q||[r.text,r.source,r.revision,r.id].some(v=>lower(v).includes(q))))
  .sort((a,b)=>timestamp(b.at)-timestamp(a.at)||b._order-a._order)
  .map(({_order,...row})=>row);
}
