// Atlas traceability and reality-vs-target projection.
// The evidence ledger records *claims with provenance*, not trusted verdicts.
// No external source writes or task execution are performed here.
import {validate} from "./core.mjs";

const TARGET_INTENT = new Set(["committed","candidate"]);
const EVIDENCE_RESULT = new Set(["present","partial","absent"]);
const EVIDENCE_LEVEL = new Set(["implementation","test","acceptance"]);
const CHANGE_STATUS = new Set(["proposed","approved","in_progress","implemented","deferred","rejected"]);
const MINUTE=60000;
const DAY=24*60*MINUTE;
const id=()=>crypto.randomUUID();
const text=(value,label)=>{if(typeof value!=="string"||!value.trim())throw Error(label+" required");return value.trim()};
const optional=(value)=>value==null?null:String(value).trim()||null;
const timestamp=(value,label)=>{const ms=Date.parse(value);if(typeof value!=="string"||!Number.isFinite(ms)||!value.includes("T"))throw Error("Invalid "+label);return new Date(ms).toISOString()};
const ensure=p=>{p.targets??=[];p.findings??=[];p.changes??=[]};
function mutate(snapshot,projectId,operation){
 validate(snapshot);
 const next=structuredClone(snapshot),p=next.projects.find(v=>v.id===projectId);
 if(!p)throw Error("Unknown Atlas project");
 ensure(p);
 const idResult=operation(p);
 next.revision++;
 validate(next);
 return {id:idResult,state:next};
}
export function addTarget(snapshot,projectId,{title,desired,intent="committed",priority="normal",sourceNote=null}){
 if(!TARGET_INTENT.has(intent))throw Error("Invalid target intent");
 if(!["low","normal","high","critical"].includes(priority))throw Error("Invalid target priority");
 return mutate(snapshot,projectId,p=>{
  const target={id:id(),title:text(title,"Target title"),desired:text(desired,"Desired outcome"),intent,priority,sourceNote:optional(sourceNote),createdAt:new Date().toISOString()};
  p.targets.push(target);return target.id;
 });
}
export function recordFinding(snapshot,projectId,{targetId,result,level="implementation",sourceId=null,ref=null,revision=null,reference=null,observedAt=null,note=""}){
 if(!EVIDENCE_RESULT.has(result)||!EVIDENCE_LEVEL.has(level))throw Error("Invalid finding");
 return mutate(snapshot,projectId,p=>{
  if(!p.targets.some(t=>t.id===targetId))throw Error("Unknown target");
  if(sourceId&&!p.sources.some(s=>s.id===sourceId))throw Error("Unknown source");
  const e={id:id(),targetId,result,level,sourceId:optional(sourceId),ref:optional(ref),revision:optional(revision),reference:optional(reference),observedAt:observedAt?timestamp(observedAt,"evidence date"):new Date().toISOString(),note:String(note||""),origin:"manual"};
  p.findings.push(e);return e.id;
 });
}
export function planChange(snapshot,projectId,{title,description="",targetIds=[],status="proposed",reference=null}){
 if(!CHANGE_STATUS.has(status))throw Error("Invalid change status");
 if(!Array.isArray(targetIds)||new Set(targetIds).size!==targetIds.length)throw Error("Invalid affected targets");
 return mutate(snapshot,projectId,p=>{
  if(targetIds.some(t=>!p.targets.some(x=>x.id===t)))throw Error("Unknown target");
  const c={id:id(),title:text(title,"Change title"),description:String(description),targetIds:[...targetIds],status,reference:optional(reference),createdAt:new Date().toISOString()};
  p.changes.push(c);return c.id;
 });
}
export function updateChange(snapshot,projectId,changeId,status) {
 if(!CHANGE_STATUS.has(status))throw Error("Invalid change status");
 return mutate(snapshot,projectId,p=>{
  const change=p.changes.find(x=>x.id===changeId);
  if(!change)throw Error("Unknown change");
  change.status=status;return changeId;
 });
}

function sourceFreshness(e,source,nowMs,maxAgeMs) {
 if(!e.sourceId) return {state:"unlinked",note:"Manual claim; no external source"};
 if(!source)return {state:"missing_source",note:"Linked source not available"};
 if(source.status!=="ok")return {state:"unavailable",note:"Source is not currently readable"};
 const sourceTime=Date.parse(source.observedAt||"");
 if(!Number.isFinite(sourceTime)||sourceTime>nowMs+5*MINUTE||nowMs-sourceTime>maxAgeMs) return {state:"outdated",note:"Source observation is out of date"};
 if(source.summary?.complete===false)return {state:"incomplete",note:"Source enumeration was truncated"};
 const refs=source.summary?.branchHeads;
 if(e.ref&&e.revision&&refs&&Object.hasOwn(refs,e.ref)) {
   if(refs[e.ref]!==e.revision)return {state:"revision_changed",note:"Evidence references an older/different source revision"};
   return {state:"current_revision",note:"Revision agrees with latest observed source ref (source data are not independently certified)"};
 }
 if(e.ref&&e.revision&&refs&&!Object.hasOwn(refs,e.ref))return {state:"ref_not_found",note:"Referenced branch is absent from the latest complete source snapshot"};
 return {state:"source_fresh",note:"Source reached recently; finding is not independently certified"};
}
function latestFindings(events) {
 const sorted=[...events].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)||a.id.localeCompare(b.id));
 if(!sorted.length)return {latest:null,conflict:false};
 const latest=sorted[0];
 const sameRevision=sorted.filter(e=>e.sourceId===latest.sourceId&&e.ref===latest.ref&&e.revision===latest.revision);
 const conflicting=sameRevision.some(e=>e.result!==latest.result);
 return {latest,conflict:conflicting};
}
function derivedState(e,freshness,conflict) {
 if(!e)return "unknown";
 if(conflict)return "conflict";
 if(["unavailable","outdated","incomplete","missing_source","revision_changed","ref_not_found"].includes(freshness.state))return "stale";
 if(e.result==="absent")return "gap_reported";
 if(e.result==="partial")return "partial_reported";
 if(e.level==="acceptance")return "acceptance_claim";
 if(e.level==="test")return "test_claim";
 return "implemented_claim";
}
export function compareProject(project,{now=new Date().toISOString(),maxAgeMs=7*DAY}={}){
 if(!project||!Array.isArray(project.sources))throw Error("Invalid Atlas project");
 const nowMs=Date.parse(now);
 if(!Number.isFinite(nowMs)||!Number.isFinite(maxAgeMs)||maxAgeMs<0)throw Error("Invalid observation window");
 const targets=project.targets||[],findings=project.findings||[],changes=project.changes||[];
 const sourceById=new Map(project.sources.map(s=>[s.id,s]));
 const evidenceByTarget=new Map(targets.map(t=>[t.id,[]]));
 const changesByTarget=new Map(targets.map(t=>[t.id,[]]));
 for(const e of findings)if(evidenceByTarget.has(e.targetId))evidenceByTarget.get(e.targetId).push(e);
 for(const c of changes)for(const targetId of c.targetIds||[])if(changesByTarget.has(targetId))changesByTarget.get(targetId).push(c);
 const rows=targets.map(target=>{
   const {latest,conflict}=latestFindings(evidenceByTarget.get(target.id));
   const freshness=latest?sourceFreshness(latest,sourceById.get(latest.sourceId),nowMs,maxAgeMs):{state:"never",note:"No evidence"};
   const assessment=derivedState(latest,freshness,conflict);
   const relatedChanges=changesByTarget.get(target.id).map(c=>({id:c.id,title:c.title,status:c.status}));
   return {id:target.id,title:target.title,desired:target.desired,intent:target.intent,priority:target.priority,sourceNote:target.sourceNote,assessment,latest:latest?{...latest}:null,freshness,relatedChanges};
 });
 const counts=Object.fromEntries(["unknown","conflict","stale","gap_reported","partial_reported","acceptance_claim","test_claim","implemented_claim"].map(status=>[status,rows.filter(r=>r.intent==="committed"&&r.assessment===status).length]));
 return {projectId:project.id,asOf:new Date(nowMs).toISOString(),targets:rows.length,committed:rows.filter(r=>r.intent==="committed").length,candidates:rows.filter(r=>r.intent==="candidate").length,counts,
  proposedChanges:changes.filter(c=>c.status==="proposed").length,
  approvedChanges:changes.filter(c=>c.status==="approved"||c.status==="in_progress").length,
  rows,
  warning:"Evidence entries are source-linked or user-declared claims, not independently verified acceptance or current product readiness"};
}
