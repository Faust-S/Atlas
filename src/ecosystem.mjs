// Read-only IWXA-sized portfolio projection over existing Atlas projects and GitHub sources.
// No second project registry, private GitHub connector, release approval or new storage.
import {validate,createProject,attach} from "./core.mjs";
import {repoName,ownerName,branchName} from "./github-public.mjs";
import {sourceReview} from "./source-review.mjs";

const canonicalRepo=source=>{
 if(source?.kind!=="github")return null;
 try{return repoName(source.locator).toLowerCase()}catch{return null}
};
const canonicalOwner=source=>{
 try{
  if(source?.kind==="github_owner")return ownerName(source.locator).toLowerCase();
  if(source?.kind==="github")return repoName(source.locator).split("/")[0].toLowerCase();
 }catch{}
 return null;
};
function boundRepositories(snapshot){
 const bound=new Map();
 for(const project of snapshot.projects){
  for(const source of project.sources||[]){
   const repo=canonicalRepo(source);
   if(!repo)continue;
   const list=bound.get(repo)||[];
   if(!list.some(p=>p.id===project.id))list.push({id:project.id,name:project.name});
   bound.set(repo,list);
  }
 }
 return bound;
}
function observedCatalog(source){
 if(source?.kind!=="github_owner"||source.summary?.scope!=="owner"||
    !Array.isArray(source.summary.repositories))return null;
 let owner;
 try{owner=ownerName(source.locator)}catch{return null}
 if(typeof source.summary.owner!=="string"||source.summary.owner.toLowerCase()!==owner.toLowerCase())
  return null;
 return {owner,rows:source.summary.repositories};
}

// Inventory stays grounded in the previously saved GitHub observation.
// A failed, old, or partial listing is never promoted to a complete catalogue.
export function githubPortfolioCatalog(snapshot,projectId,ownerSourceId,{query="",limit=24}={}){
 validate(snapshot);
 if(typeof query!=="string"||query.length>240||!Number.isInteger(limit)||limit<1||limit>500)
  throw Error("Некорректный фильтр каталога GitHub");
 const project=snapshot.projects.find(p=>p.id===projectId);
 const source=project?.sources.find(s=>s.id===ownerSourceId);
 if(!source||source.kind!=="github_owner")throw Error("Каталог GitHub не подключён к проекту");
 const observed=observedCatalog(source);
 const current=Boolean(observed&&source.status==="ok");
 const index=boundRepositories(snapshot),items=[],seen=new Set();
 for(const entry of observed?.rows||[]){
  let name;
  try{name=repoName(entry?.name)}catch{continue}
  if(name.split("/")[0].toLowerCase()!==observed.owner.toLowerCase()||
     seen.has(name.toLowerCase()))continue;
  seen.add(name.toLowerCase());
  const projectRefs=index.get(name.toLowerCase())||[];
  items.push({name,repository:name.split("/")[1],defaultBranch:entry.defaultBranch||null,
   archived:entry.archived===true,pushedAt:entry.pushedAt||null,projects:projectRefs,
   canCreate:current&&projectRefs.length===0});
 }
 const match=query.trim().toLocaleLowerCase("ru-RU");
 const filtered=items.filter(row=>!match||
  (row.name+" "+row.projects.map(p=>p.name).join(" ")).toLocaleLowerCase("ru-RU").includes(match));
 return {owner:observed?.owner||source.locator,observed:current,
  complete:current&&source.summary.complete===true,
  lastObserved:source.summary?.observedAt||source.observedAt||null,
  total:items.length,matched:filtered.length,
  connected:items.filter(row=>row.projects.length>0).length,
  rows:filtered.slice(0,limit),remaining:Math.max(0,filtered.length-limit)};
}

// One user action creates one ordinary engineering project and connects an
// already discovered public GitHub repository. Nothing is written to GitHub.
// Existing repository bindings are opened instead of silently duplicated.
export function createProjectFromGitHubCatalog(snapshot,projectId,ownerSourceId,repository){
 validate(snapshot);
 const source=snapshot.projects.find(p=>p.id===projectId)?.sources.find(s=>s.id===ownerSourceId);
 const observed=observedCatalog(source);
 if(!observed||source.status!=="ok")throw Error("Сначала обновите каталог GitHub");
 const normalized=repoName(repository);
 if(normalized.split("/")[0].toLowerCase()!==observed.owner.toLowerCase())
  throw Error("Репозиторий принадлежит другому владельцу");
 const entry=observed.rows.find(item=>{
  try{return repoName(item.name).toLowerCase()===normalized.toLowerCase()}
  catch{return false}
 });
 if(!entry)throw Error("Репозиторий отсутствует в последнем наблюдении");
 const found=boundRepositories(snapshot).get(normalized.toLowerCase())||[];
 if(found.length)return {state:snapshot,projectId:found[0].id,created:false};
 const branch=entry.defaultBranch==null?null:branchName(entry.defaultBranch);
 const created=createProject(snapshot,{name:normalized.split("/")[1],type:"engineering",goal:"",owner:""});
 const attached=attach(created.state,created.id,"github",normalized,{branch});
 return {state:attached.state,projectId:created.id,sourceId:attached.id,created:true};
}

// Compact cross-product development overview. All readiness remains declared
// through the existing facts/decisions, never inferred from a passing Actions run.
export function githubPortfolioOverview(snapshot){
 validate(snapshot);
 const owners=new Set(),links=snapshot.portfolioLinks||[];
 const rows=snapshot.projects.map(project=>{
  const sources=project.sources.filter(s=>s.kind==="github"||s.kind==="github_owner");
  const repositories=[];
  for(const source of sources){
   const owner=canonicalOwner(source);
   if(owner)owners.add(owner);
   const key=canonicalRepo(source);
   const review=sourceReview(source);
   repositories.push({id:source.id,kind:source.kind,locator:source.locator,
    owner,repository:key,url:review.sourceUrl,branch:source.branch||source.summary?.defaultBranch||null,
    status:source.status,observation:review.status,
    ci:review.ci?.label||null});
  }
  return {id:project.id,name:project.name,status:project.status,goal:project.goal||"",
   owners:[...new Set(repositories.map(s=>s.owner).filter(Boolean))],
   repositories,
   works:project.items.length,blocked:project.items.filter(w=>w.state==="blocked").length,
   doneClaims:project.items.filter(w=>w.state==="done").length,
   requirements:(project.targets||[]).filter(t=>t.intent==="committed").length,
   findings:(project.findings||[]).length,
   decisions:project.decisions.length,
   proposals:(project.changes||[]).filter(c=>["proposed","approved","in_progress"].includes(c.status)).length,
   predecessors:links.filter(l=>l.to===project.id).length,
   downstream:links.filter(l=>l.from===project.id).length,
   sourcesMissing:repositories.filter(s=>s.status==="never"||s.status==="error").length,
   search:(project.name+" "+project.goal+" "+repositories.map(s=>s.locator).join(" ")).toLocaleLowerCase("ru-RU")};
 });
 return {owners:[...owners].sort(),rows,
  totals:{projects:rows.length,connected:rows.filter(r=>r.repositories.length>0).length,
   blocked:rows.reduce((n,r)=>n+r.blocked,0),
   requirements:rows.reduce((n,r)=>n+r.requirements,0),
   findings:rows.reduce((n,r)=>n+r.findings,0),
   dependencies:links.length}};
}
export function filterGithubPortfolioOverview(overview,{owner="all",query=""}={}){
 if(owner!=="all"&&!overview.owners.includes(owner))throw Error("Неизвестный владелец источников");
 if(typeof query!=="string"||query.length>240)throw Error("Некорректный поиск проектов");
 const text=query.trim().toLocaleLowerCase("ru-RU");
 return overview.rows.filter(row=>
  (owner==="all"||row.owners.includes(owner))&&(!text||row.search.includes(text)));
}
