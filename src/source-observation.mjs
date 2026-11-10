// Source discovery is observation, not authority over requirements or releases.
import {observe,attach} from "./core.mjs";
import {repoName} from "./github-public.mjs";
const identity=entry=>entry.id==null?"name:"+entry.name.toLowerCase():"id:"+entry.id;
const label=entry=>entry.name;
// A bounded branch listing cannot prove changes elsewhere in the repository.
// However, two independently observed SHA values for the SAME selected branch
// can still be compared without declaring the entire repository comparable.
function exactSelectedBranch(snapshot){
 const branch=snapshot?.ci?.branch??snapshot?.defaultBranch;
 const sha=typeof branch==="string"&&Array.isArray(snapshot?.branches)&&snapshot.branches.includes(branch)
  ?snapshot.branchHeads?.[branch]:null;
 return typeof branch==="string"&&branch&&typeof sha==="string"&&/^[a-f0-9]{40}$/i.test(sha)
  ?{branch,sha:sha.toLowerCase()}:null;
}
function selectedBranchDelta(previous,next){
 if(previous?.scope!=="repository"||next.scope!=="repository"||
    typeof previous.repository!=="string"||typeof next.repository!=="string"||
    previous.repository.toLowerCase()!==next.repository.toLowerCase())return null;
 const before=exactSelectedBranch(previous),after=exactSelectedBranch(next);
 return before&&after&&before.branch===after.branch&&before.sha!==after.sha
  ?{branch:before.branch,previousSha:before.sha,currentSha:after.sha}:null;
}
// Root tree comparison does not depend on complete branch pagination. It
// needs two exact, fully enumerated root trees for the SAME named branch.
// Missing/limited trees never prove that a directory has been deleted.
function rootStructureDelta(previous,next){
 if(previous?.scope!=="repository"||next?.scope!=="repository"||
    typeof previous.repository!=="string"||typeof next.repository!=="string"||
    previous.repository.toLowerCase()!==next.repository.toLowerCase())return null;
 const before=previous.structure,after=next.structure;
 if(before?.status!=="observed"||after?.status!=="observed"||
    before.branch!==after.branch||!before.branch||
    before.truncated||after.truncated||before.limited||after.limited||
    !/^[a-f0-9]{40}$/i.test(before.commitSha||"")||
    !/^[a-f0-9]{40}$/i.test(after.commitSha||""))return null;
 const values=(tree,key)=>{
  const rows=tree[key];
  if(!Array.isArray(rows)||rows.length>120||
     rows.some(x=>typeof x!=="string"||!x||x.includes("/")||x==="."||x===".."))
   return null;
  return [...new Set(rows)];
 };
 const foldersBefore=values(before,"folders"),foldersAfter=values(after,"folders");
 const filesBefore=values(before,"files"),filesAfter=values(after,"files");
 if(!foldersBefore||!foldersAfter||!filesBefore||!filesAfter)return null;
 if(before.commitSha.toLowerCase()===after.commitSha.toLowerCase()&&
    before.treeSha!==after.treeSha)return null;
 const added=(was,now)=>now.filter(x=>!new Set(was).has(x));
 return {branch:before.branch,previousSha:before.commitSha.toLowerCase(),
  currentSha:after.commitSha.toLowerCase(),
  addedFolders:added(foldersBefore,foldersAfter),
  removedFolders:added(foldersAfter,foldersBefore),
  addedFiles:added(filesBefore,filesAfter),
  removedFiles:added(filesAfter,filesBefore)};
}
export function sourceChanges(previous,next){
 if(!next||!["owner","repository"].includes(next.scope))throw Error("Invalid source observation scope");
 if(!previous||previous.scope!==next.scope||previous.complete!==true||next.complete!==true){
  const selectedRevision=selectedBranchDelta(previous,next);
  const structureDelta=rootStructureDelta(previous,next);
  return {baseline:!previous,comparable:false,added:[],removed:[],renamed:[],changed:[],
   reason:"Comparison requires two complete source snapshots",
   ...(selectedRevision?{selectedRevision}:{}),
   ...(structureDelta?{structureDelta}:{})};
 }
 if(next.scope==="owner"){
  const old=new Map(previous.repositories.map(x=>[identity(x),x]));
  const fresh=new Map(next.repositories.map(x=>[identity(x),x]));
  const added=[],removed=[],renamed=[],changed=[];
  for(const [id,r] of fresh){
   const before=old.get(id);
   if(!before){added.push(r.name);continue}
   if(before.name!==r.name)renamed.push({from:before.name,to:r.name});
   if(before.defaultBranch!==r.defaultBranch||before.pushedAt!==r.pushedAt||before.archived!==r.archived)
    changed.push(r.name);
  }
  for(const [id,r] of old)if(!fresh.has(id))removed.push(label(r));
  return {baseline:false,comparable:true,added,removed,renamed,changed};
 }
 const structureDelta=rootStructureDelta(previous,next);
 const prior=previous.branchHeads||{},current=next.branchHeads||{};
 const old=new Set(previous.branches||Object.keys(prior)),fresh=new Set(next.branches||Object.keys(current));
 return {baseline:false,comparable:true,added:[...fresh].filter(x=>!old.has(x)),
  removed:[...old].filter(x=>!fresh.has(x)),renamed:[],
  changed:[...fresh].filter(x=>old.has(x)&&prior[x]!==current[x]),
  // Retain the actual before/after commit IDs inside the existing source summary.
  // Older snapshots without this optional field remain readable.
  revisions:[...fresh].filter(x=>old.has(x)&&typeof prior[x]==="string"&&typeof current[x]==="string"&&prior[x]!==current[x])
   .map(ref=>({ref,previousSha:prior[ref],currentSha:current[ref]})),
  ...(structureDelta?{structureDelta}:{})};
}
export function applySourceObservation(snapshot,projectId,sourceId,observation){
 const p=snapshot.projects.find(x=>x.id===projectId),source=p?.sources.find(x=>x.id===sourceId);
 if(!source)throw Error("Unknown source");
 if(source.kind==="github"&&observation.scope!=="repository"||source.kind==="github_owner"&&observation.scope!=="owner")
  throw Error("Source and observation scope mismatch");
 if(!["github","github_owner"].includes(source.kind))throw Error("Unsupported public source");
 if(observation.complete!==true&&observation.complete!==false)throw Error("Source completeness missing");
 const changes=sourceChanges(source.summary,observation);
 const result=observe(snapshot,projectId,sourceId,"ok",{...observation,changes});
 return {state:result,changes};
}
export function attachDiscoveredRepo(snapshot,projectId,ownerSourceId,repository){
 const p=snapshot.projects.find(x=>x.id===projectId),owner=p?.sources.find(s=>s.id===ownerSourceId);
 if(!owner||owner.kind!=="github_owner"||owner.status!=="ok")throw Error("Public owner discovery required");
 const entry=owner.summary?.repositories?.find(r=>r.name.toLowerCase()===repository.toLowerCase());
 if(!entry)throw Error("Repository not present in latest discovery");
 const normalized=repoName(entry.name);
 if(p.sources.some(s=>s.kind==="github"&&repoName(s.locator).toLowerCase()===normalized.toLowerCase()))
  throw Error("Repository is already attached");
 return attach(snapshot,projectId,"github",normalized);
}
