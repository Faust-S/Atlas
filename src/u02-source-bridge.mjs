// Atlas is the project authority. U02 is an observation source, never a
// change/approval authority. This adapter is read-only and has no Store.
import {validate} from "./core.mjs";
import {repoName} from "./github-public.mjs";

const U02="IWXA_SOURCE_CONNECTOR/1.0.0";
const SHA=/^[a-f0-9]{40}$/i;
const fail=code=>{throw Object.assign(new Error(code),{code})};
const same=(a,b)=>a.toLowerCase()===b.toLowerCase();

export function inspectU02ProjectSource(snapshot,projectId,sourceId,observation){
 validate(snapshot);
 const project=snapshot.projects.find(p=>p.id===projectId);
 if(!project)fail("ATLAS_PROJECT_NOT_FOUND");
 const source=project.sources.find(s=>s.id===sourceId);
 if(!source)fail("ATLAS_SOURCE_NOT_FOUND");
 if(source.kind!=="github")fail("ATLAS_U02_GITHUB_SOURCE_REQUIRED");
 const attached=repoName(source.locator);
 if(!observation||observation.schema!==U02||
    observation.authority!=="OBSERVATION_ONLY"||
    !["github.public","github.authorized"].includes(observation.providerId)||
    observation.observationType!=="file"||
    typeof observation.sourceRef!=="string"||
    !observation.sourceRef.startsWith("github://"))
   fail("ATLAS_U02_OBSERVATION_INVALID");
 const match=/^github:\/\/([^/?]+\/[^/?]+)\/([^?]+)\?ref=([^&#]+)$/.exec(observation.sourceRef);
 if(!match)fail("ATLAS_U02_SOURCE_REF_INVALID");
 let branch,path;
 try{branch=decodeURIComponent(match[3]);path=decodeURIComponent(match[2]);}
 catch{fail("ATLAS_U02_SOURCE_REF_INVALID");}
 if(!same(match[1],attached)||!branch||!path||path.startsWith("/")||
    path.split("/").some(segment=>!segment||segment==="."||segment===".."))
   fail("ATLAS_U02_SOURCE_MISMATCH");
 const status=observation.status;
 if(typeof status!=="string"||!/^[A-Z_]+$/.test(status))
   fail("ATLAS_U02_OBSERVATION_INVALID");
 // Incomplete/denied observations must not alter plan or certify any result.
 const ok=status==="OK"&&SHA.test(observation.revision??"")&&
   Number.isFinite(Date.parse(observation.observedAt??""))&&
   observation.provenance?.provider==="github"&&
   observation.provenance?.access===observation.providerId.slice(7);
 const pinned=ok?observation.revision.toLowerCase():null;
 const known=source.summary?.branchHeads?.[branch];
 const previous=typeof known==="string"&&SHA.test(known)?known.toLowerCase():null;
 return Object.freeze({
  projectId,sourceId,sourceRef:observation.sourceRef,
  sourceContract:U02,projectRevision:String(snapshot.revision),
  observedRevision:pinned,previousRevision:previous,
  status:ok?"OBSERVED":status==="OK"?"SOURCE_INVALID":status,
  revisionChange:ok&&previous?(previous===pinned?"UNCHANGED":"CHANGED"):"NOT_COMPARABLE",
  requiresHumanReview:ok&&previous!==null&&previous!==pinned,
  authority:"OBSERVATION_ONLY"
 });
}
