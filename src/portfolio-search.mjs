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
