// Search existing projects by the work and sources a person remembers.
// Read-only projection; not a new project model, Store, or execution layer.
const fold=value=>String(value??"").normalize("NFKC")
 .toLocaleLowerCase("ru-RU").replace(/ё/g,"е").replace(/\s+/g," ").trim();
const activeStatuses=new Set(["planned","active","paused"]);
const finishedStatuses=new Set(["completed","cancelled"]);

export function buildPortfolioSearchIndex(projects){
 if(!Array.isArray(projects))throw Error("Неверный портфель");
 return projects.map(project=>{
  const sources=new Map((project.sources||[]).map(s=>[s.id,s.locator]));
  const fields=[project.name,project.goal||"",project.owner||"",
   ...(project.stages||[]).map(stage=>stage.name),
   ...(project.sources||[]).map(source=>source.locator)];
  for(const work of project.items||[]){
   fields.push(work.title,work.assignee||"");
   const source=sources.get(work.sourceId);
   if(source&&work.sourcePath)
    fields.push(source+" "+work.sourcePath);
   else if(work.sourcePath)fields.push(work.sourcePath);
  }
  return {project,fields:fields.map(fold).filter(Boolean)};
 });
}
export function filterPortfolioSearch(index,{query="",status="all"}={}){
 if(!Array.isArray(index))throw Error("Неверный индекс проектов");
 if(!["all","active","finished"].includes(status))
  throw Error("Неизвестный фильтр портфеля");
 const needle=fold(query);
 return index.filter(({project,fields})=>{
  if(status==="active"&&!activeStatuses.has(project.status))return false;
  if(status==="finished"&&!finishedStatuses.has(project.status))return false;
  return !needle||fields.some(field=>field.includes(needle));
 }).map(({project})=>project);
}


// Explain *why* a project matched, without reinterpreting links or altering
// the saved portfolio. This is shown only for visible results of an active
// user search; it is never used to authorize edits or run tasks.
export function portfolioSearchReason(project,query){
 const needle=fold(query);
 if(!needle||!project)return "";
 const matches=value=>fold(value).includes(needle);
 if(matches(project.name))return "Название проекта";
 if(project.goal&&matches(project.goal))return "Цель проекта";
 if(project.owner&&matches(project.owner))return "Ответственный за проект";
 for(const stage of project.stages||[])
  if(matches(stage.name))return "Этап: "+stage.name;
 for(const source of project.sources||[])
  if(matches(source.locator))return "Источник: "+source.locator;
 const sources=new Map((project.sources||[]).map(source=>[source.id,source.locator]));
 for(const work of project.items||[]){
  if(matches(work.title))return "Работа: "+work.title;
  if(work.assignee&&matches(work.assignee))
   return "Ответственный за работу: "+work.assignee;
  const source=sources.get(work.sourceId);
  if(source&&work.sourcePath&&matches(source+" "+work.sourcePath))
   return "Каталог: "+source+" / "+work.sourcePath;
  if(!source&&work.sourcePath&&matches(work.sourcePath))
   return "Каталог: "+work.sourcePath;
 }
 return "";
}


// A direct link is safe only for one unambiguous work title. A stage,
// assignee or source match must continue to open the project as a whole.
export function portfolioSearchWorkTarget(project,query){
 const needle=fold(query);
 if(!needle||!project)return null;
 let selected=null;
 for(const work of project.items||[]){
  if(!fold(work.title).includes(needle))continue;
  if(selected)return null;
  selected=work;
 }
 if(!selected||portfolioSearchReason(project,query)!=="Работа: "+selected.title)
  return null;
 return {id:selected.id,title:selected.title};
}
