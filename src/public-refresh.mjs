// Portfolio public-source reconciliation: one observation per unique public binding,
// one snapshot to persist, no new store/authority and no claimed release acceptance.
import {observe} from "./core.mjs";
import {applySourceObservation} from "./source-observation.mjs";
import {observePublicRepo,observePublicOwner} from "./github-public.mjs";
const MAX_BINDINGS=30,MAX_REQUESTS=4;
const supported=new Set(["github","github_owner"]);
const keyOf=s=>s.kind+":"+s.locator.trim().toLocaleLowerCase("en");
export function planPublicRefresh(snapshot,{now=Date.now(),maxAgeMs=15*60*1000,limit=MAX_BINDINGS,maxRequests=MAX_REQUESTS,only=null}={}){
 if(!Number.isInteger(limit)||limit<1||limit>MAX_BINDINGS||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>MAX_REQUESTS)throw Error("Invalid public refresh limits");
 const requested=only?new Set(only.map(x=>x.projectId+"|"+x.sourceId)):null;
 const groups=new Map();let due=0;
 for(const p of snapshot.projects)for(const s of p.sources){
  if(!supported.has(s.kind))continue;
  if(requested&&!requested.has(p.id+"|"+s.id))continue;
  if(!requested && s.observedAt && Number.isFinite(Date.parse(s.observedAt)) && now-Date.parse(s.observedAt)<maxAgeMs)continue;
  due++;
  const key=keyOf(s);
  if(groups.has(key)){if(groups.get(key).bindings.length<limit)groups.get(key).bindings.push({projectId:p.id,sourceId:s.id});continue}
  if(groups.size>=maxRequests)continue;
  groups.set(key,{key,kind:s.kind,locator:s.locator,bindings:[{projectId:p.id,sourceId:s.id}]});
 }
 const chosen=[...groups.values()];
 return {groups:chosen,due,selected:chosen.reduce((n,x)=>n+x.bindings.length,0),unique:chosen.length};
}
const isRateLimited=e=>/\b(?:403|429)\b|rate.limit|rate-limit/i.test(String(e?.message||e));
export async function reconcilePublicSources(snapshot,{
 plan=planPublicRefresh(snapshot),repoObserver=observePublicRepo,ownerObserver=observePublicOwner
}={}){
 let state=snapshot;
 const report={due:plan.due,selected:plan.selected,requests:0,updated:0,failed:0,rateLimited:false,remaining:Math.max(0,plan.due-plan.selected),errors:[]};
 for(const group of plan.groups){
  let observation,error;
  report.requests++;
  try{
   observation=await (group.kind==="github"?repoObserver:ownerObserver)(group.locator);
  }catch(e){error=e instanceof Error?e:Error(String(e))}
  for(const binding of group.bindings){
   try{
    if(error)state=observe(state,binding.projectId,binding.sourceId,"error",null,error.message);
    else state=applySourceObservation(state,binding.projectId,binding.sourceId,observation).state;
    if(error)report.failed++;else report.updated++;
   }catch(e){
    report.failed++;
    const message=e instanceof Error?e.message:String(e);
    // Mark the failed binding, but leave other bindings and their prior summaries untouched.
    state=observe(state,binding.projectId,binding.sourceId,"error",null,message);
    report.errors.push({projectId:binding.projectId,sourceId:binding.sourceId,message});
   }
  }
  if(error){
   report.errors.push({source:group.locator,message:error.message});
   if(isRateLimited(error)){report.rateLimited=true;break}
  }
 }
 report.remaining=Math.max(0,report.due-report.updated-report.failed);
 return {state,report};
}
