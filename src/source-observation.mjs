// Source discovery is observation, not authority over requirements or releases.
import {observe,attach} from "./core.mjs";
import {repoName} from "./github-public.mjs";
const identity=entry=>entry.id==null?"name:"+entry.name.toLowerCase():"id:"+entry.id;
const label=entry=>entry.name;
export function sourceChanges(previous,next){
 if(!next||!["owner","repository"].includes(next.scope))throw Error("Invalid source observation scope");
 if(!previous||previous.scope!==next.scope||previous.complete!==true||next.complete!==true)
  return {baseline:!previous,comparable:false,added:[],removed:[],renamed:[],changed:[],reason:"Comparison requires two complete source snapshots"};
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
 const prior=previous.branchHeads||{},current=next.branchHeads||{};
 const old=new Set(previous.branches||Object.keys(prior)),fresh=new Set(next.branches||Object.keys(current));
 return {baseline:false,comparable:true,added:[...fresh].filter(x=>!old.has(x)),
  removed:[...old].filter(x=>!fresh.has(x)),renamed:[],
  changed:[...fresh].filter(x=>old.has(x)&&prior[x]!==current[x])};
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
