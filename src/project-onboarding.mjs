// User-confirmed onboarding over the existing Atlas project/source model.
// Reads public GitHub only; preview does not mutate a portfolio or execute work.
import {validate,createProject,attach} from "./core.mjs";
import {applySourceObservation} from "./source-observation.mjs";
import {repoName,ownerName,branchName,observePublicRepo,observePublicOwner,
 observePublicRootTree} from "./github-public.mjs";

export function projectConnectionAddress(input){
 const value=String(input??"").trim();
 if(!value||value.length>250)throw Error("Введите адрес публичного проекта GitHub");
 try{
  const repository=repoName(value);
  return {kind:"repository",locator:repository,url:"https://github.com/"+repository};
 }catch{}
 try{
  const owner=ownerName(value);
  return {kind:"owner",locator:owner,url:"https://github.com/"+owner};
 }catch{}
 throw Error("Укажите ссылку вида github.com/владелец/репозиторий или github.com/владелец");
}

const isSha=x=>typeof x==="string"&&/^[a-f0-9]{40}$/i.test(x);

// A single bounded read for a repository; an inaccessible tree does not erase
// a successfully observed repository. Every proposed component is a real root
// entry, never a fabricated work item, requirement, or readiness assertion.
/** @param {string} input
 * @param {any} [fetcher]
 * @param {{signal?:AbortSignal,branch?:string|null}} [options]
 */
export async function inspectPublicProject(input,fetcher=globalThis.fetch,{signal,branch=null}={}){
 const entry=projectConnectionAddress(input);
 if(entry.kind==="owner"){
  const summary=await observePublicOwner(entry.locator,fetcher,{maxPages:2,signal});
  if(summary.scope!=="owner"||summary.owner.toLowerCase()!==entry.locator.toLowerCase())
   throw Error("GitHub вернул данные другого владельца");
  return {kind:"owner",locator:entry.locator,url:entry.url,name:entry.locator,
   summary,structure:null,observedAt:summary.observedAt};
 }
 const requested=branch===null?null:branchName(branch);
 const summary=await observePublicRepo(entry.locator,fetcher,
  {maxPages:2,signal,includeActions:true,actionsBranch:requested});
 if(summary.scope!=="repository"||
    summary.repository.toLowerCase()!==entry.locator.toLowerCase())
  throw Error("GitHub вернул данные другого репозитория");
 const selected=requested||summary.defaultBranch;
 if(requested&&!isSha(summary.branchHeads?.[requested]))
  throw Error("Указанная ветка GitHub не подтверждена. Проверьте название и доступность.");
 let structure={status:"unavailable",reason:"Ветка исходников не определена"};
 if(typeof selected==="string"&&selected){
  try{
   structure=await observePublicRootTree(entry.locator,selected,fetcher,{
    signal,commitSha:summary.branchHeads?.[selected]??null});
  }catch(error){
   if(signal?.aborted)throw error;
   structure={status:"unavailable",branch:selected,
    reason:String(error?.message||"Не удалось прочитать дерево файлов GitHub").slice(0,260)};
  }
 }
 return {kind:"repository",locator:entry.locator,url:entry.url,
  name:entry.locator.split("/")[1],branch:selected,summary,structure,
  observedAt:summary.observedAt};
}

const sourceRepository=source=>{
 if(source?.kind!=="github")return null;
 try{return repoName(source.locator).toLowerCase()}catch{return null}
};
export function findConnectedRepository(snapshot,locator){
 validate(snapshot);
 const normalized=repoName(locator).toLowerCase();
 return snapshot.projects.filter(project=>
  project.sources.some(source=>sourceRepository(source)===normalized))
  .map(project=>({id:project.id,name:project.name}));
}

const sourceOwner=source=>{
 if(source?.kind!=="github_owner")return null;
 try{return ownerName(source.locator).toLowerCase()}catch{return null}
};
export function findConnectedOwner(snapshot,locator){
 validate(snapshot);
 const normalized=ownerName(locator).toLowerCase();
 return snapshot.projects.find(project=>
  project.sources.some(source=>sourceOwner(source)===normalized))||null;
}

// All changes are ordinary Atlas snapshot changes and explicit user choices.
// Adding a repository does not create a work, assert acceptance, or write to GitHub.
/** @param {any} snapshot
 * @param {any} preview
 * @param {{name?:string,selectedRepositories?:string[]}} [options]
 */
export function applyPublicProjectPreview(snapshot,preview,{name="",selectedRepositories=[]}={}){
 validate(snapshot);
 if(!preview||!["repository","owner"].includes(preview.kind)||
    !preview.summary||preview.summary.complete!==true&&preview.summary.complete!==false)
  throw Error("Сначала получите достоверный предпросмотр GitHub");
 if(typeof name!=="string"||name.length>160||typeof selectedRepositories!=="object"||
    !Array.isArray(selectedRepositories))
  throw Error("Некорректный выбор проекта");
 if(preview.kind==="repository"){
  if(selectedRepositories.length)throw Error("Для отдельного репозитория выбор списка не требуется");
  const locator=repoName(preview.locator);
  if(preview.summary.scope!=="repository"||
     repoName(preview.summary.repository).toLowerCase()!==locator.toLowerCase())
   throw Error("Предпросмотр не соответствует репозиторию");
  const connected=findConnectedRepository(snapshot,locator);
  if(connected.length)
   return {state:snapshot,primaryId:connected[0].id,createdIds:[],existingIds:connected.map(p=>p.id),
    ownerId:null,connected:false};
  const created=createProject(snapshot,{name:name.trim()||locator.split("/")[1],
   type:"engineering",goal:""});
  const selectedBranch=typeof preview.branch==="string"&&preview.branch?
   branchName(preview.branch):
   typeof preview.summary.defaultBranch==="string"&&preview.summary.defaultBranch?
   branchName(preview.summary.defaultBranch):null;
  if(selectedBranch&&selectedBranch!==preview.summary.defaultBranch&&
     !isSha(preview.summary.branchHeads?.[selectedBranch]))
   throw Error("Выбранная рабочая ветка не подтверждена GitHub");
  const link=attach(created.state,created.id,"github",locator,{branch:selectedBranch});
  const observation={
   ...preview.summary,
   // GitHub's null-prototype branch lookup must have the same JSON shape
   // as the subsequently saved and reopened Atlas source observation.
   branchHeads:{...preview.summary.branchHeads},
   ...(preview.structure?.status==="observed"?{structure:preview.structure}:{})
  };
  const observed=applySourceObservation(link.state,created.id,link.id,observation);
  return {state:observed.state,primaryId:created.id,createdIds:[created.id],existingIds:[],
   ownerId:null,connected:true};
 }
 const owner=ownerName(preview.locator);
 if(preview.summary.scope!=="owner"||ownerName(preview.summary.owner).toLowerCase()!==owner.toLowerCase()||
    !Array.isArray(preview.summary.repositories))
  throw Error("Предпросмотр не соответствует владельцу GitHub");
 if(selectedRepositories.length<1||selectedRepositories.length>20)
  throw Error("Выберите от 1 до 20 репозиториев");
 const normalized=new Set(),selected=[];
 for(const item of selectedRepositories){
  if(typeof item!=="string")throw Error("Некорректный репозиторий");
  const repository=repoName(item);
  if(repository.split("/")[0].toLowerCase()!==owner.toLowerCase()||
     normalized.has(repository.toLowerCase()))
   throw Error("Повторный или чужой репозиторий");
  const found=preview.summary.repositories.find(r=>
   typeof r?.name==="string"&&r.name.toLowerCase()===repository.toLowerCase());
  if(!found)throw Error("Выбранный репозиторий отсутствует в предпросмотре");
  normalized.add(repository.toLowerCase());selected.push(found);
 }
 let state=snapshot;
 let root=findConnectedOwner(state,owner),ownerId=root?.id;
 if(!root){
  const created=createProject(state,{name:name.trim()||owner+" · проекты",
   type:"engineering",goal:""});
  const attached=attach(created.state,created.id,"github_owner",owner);
  state=applySourceObservation(attached.state,created.id,attached.id,preview.summary).state;
  ownerId=created.id;
 }else{
  const source=root.sources.find(s=>sourceOwner(s)===owner.toLowerCase());
  state=applySourceObservation(state,root.id,source.id,preview.summary).state;
 }
 const createdIds=[],existingIds=[];
 for(const item of selected){
  const repository=repoName(item.name);
  const connected=findConnectedRepository(state,repository);
  if(connected.length){existingIds.push(connected[0].id);continue}
  const created=createProject(state,{name:repository.split("/")[1],type:"engineering",goal:""});
  state=created.state;
  const branch=typeof item.defaultBranch==="string"&&item.defaultBranch?
   branchName(item.defaultBranch):null;
  state=attach(state,created.id,"github",repository,{branch}).state;
  createdIds.push(created.id);
 }
 return {state,primaryId:createdIds[0]||existingIds[0]||ownerId,
  createdIds,existingIds,ownerId,connected:true};
}
