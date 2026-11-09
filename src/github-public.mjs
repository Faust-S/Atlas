// Public GitHub REST observation only; never accepts tokens or writes to source.
const API="https://api.github.com";
const ownerRe=/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const repoRe=/^[a-z\d_.-]+$/i;
export function ownerName(value){
 let text=String(value??"").trim();
 if(text.startsWith("https://github.com/")){
  const url=new URL(text);
  if(url.hostname!=="github.com"||url.search||url.hash)throw Error("Invalid GitHub owner URL");
  text=url.pathname.replace(/^\/|\/$/g,"");
 }
 if(!ownerRe.test(text)||text.includes("--"))throw Error("Invalid public GitHub owner");
 return text;
}
export function repoName(value){
 let text=String(value??"").trim();
 if(text.startsWith("https://github.com/")){
  const url=new URL(text);
  if(url.hostname!=="github.com"||url.search||url.hash)throw Error("Invalid public GitHub repository URL");
  text=url.pathname.replace(/^\/|\/$/g,"").replace(/\.git$/,"");
 }
 const parts=text.split("/");
 if(parts.length!==2||!ownerRe.test(parts[0])||!repoRe.test(parts[1])||parts[1]==="."||parts[1]===".."||parts[1].includes(".."))throw Error("Invalid repository name");
 return parts.join("/");
}
async function request(url,fetcher,signal){
 const response=await fetcher(url,{headers:{Accept:"application/vnd.github+json"},signal});
 if(!response?.ok){
  const reset=response?.headers?.get?.("x-ratelimit-reset");
  const rate=response?.status===403||response?.status===429;
  const retry=rate&&/^\d+$/.test(reset||"")?" · rate-limit reset at "+new Date(Number(reset)*1000).toISOString():"";
  throw Error("GitHub public API "+(response?.status??"unavailable")+retry);
 }
 return response.json();
}
// The public Actions API is evidence about a particular revision, not an
// assessment of project readiness. Do not trust a run from another branch.
export function publicWorkflowObservation(payload,repository,branch,currentSha,branchesComplete){
 if(!payload||!Array.isArray(payload.workflow_runs))return {state:"invalid",branch};
 if(payload.workflow_runs.length===0)return {state:"none",branch};
 const run=payload.workflow_runs[0];
 const states=new Set(["queued","in_progress","completed","waiting","pending","requested"]);
 if(!run||!Number.isSafeInteger(run.id)||run.id<=0||
    run.head_branch!==branch||typeof run.head_sha!=="string"||
    !/^[a-f0-9]{40}$/i.test(run.head_sha)||!states.has(run.status)||
    (run.conclusion!=null&&typeof run.conclusion!=="string"))
   return {state:"invalid",branch};
 const validConclusions=new Set(["success","failure","cancelled","timed_out","skipped","neutral","action_required","stale"]);
 const conclusion=run.status==="completed"&&validConclusions.has(run.conclusion)?run.conclusion:null;
 const headCurrent=branchesComplete&&typeof currentSha==="string"&&/^[a-f0-9]{40}$/i.test(currentSha)
  ?(run.head_sha.toLowerCase()===currentSha.toLowerCase()?"current":"previous")
  :"unknown";
 return {state:"observed",branch,runId:run.id,status:run.status,conclusion,
  headSha:run.head_sha.toLowerCase(),headCurrent,
  url:"https://github.com/"+repoName(repository)+"/actions/runs/"+run.id};
}
export async function observePublicRepo(value,fetcher=globalThis.fetch,{maxPages=20,signal,includeActions=false}={}){
 const name=repoName(value),base=API+"/repos/"+name;
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>50)throw Error("Invalid GitHub pagination limit");
 const repo=await request(base,fetcher,signal);
 if(repo?.private||repo?.visibility==="private")throw Error("Private repositories require an authorized host");
 const branches=[],branchHeads=Object.create(null);
 let complete=false;
 for(let page=1;page<=maxPages;page++){
  const batch=await request(base+"/branches?per_page=100&page="+page,fetcher,signal);
  if(!Array.isArray(batch))throw Error("Invalid public branches response");
  for(const branch of batch){
   if(typeof branch?.name!=="string"||!branch.name.trim())throw Error("Invalid GitHub branch");
   branches.push(branch.name);
   if(typeof branch.commit?.sha==="string")branchHeads[branch.name]=branch.commit.sha;
  }
  if(batch.length<100){complete=true;break}
 }
 let ci=null;
 if(includeActions){
  const branch=typeof repo.default_branch==="string"?repo.default_branch:null;
  if(!branch||!branches.includes(branch)){
   ci={state:"unavailable",branch,reason:"NO_DEFAULT_BRANCH"};
  }else{
   try{
    const payload=await request(base+"/actions/runs?branch="+encodeURIComponent(branch)+
     "&per_page=1&exclude_pull_requests=true",fetcher,signal);
    ci=publicWorkflowObservation(payload,name,branch,branchHeads[branch],complete);
   }catch(error){
    // An unavailable Actions endpoint never turns a successful branch
    // observation into a failed project/source statement.
    const message=String(error?.message||error);
    ci={state:"unavailable",branch,
     reason:/\\b(?:403|429)\\b|rate.limit|rate-limit/i.test(message)?"RATE_LIMITED":"SOURCE_UNAVAILABLE"};
   }
  }
 }
 return {
  scope:"repository",repository:name,repositoryId:Number.isSafeInteger(repo.id)?repo.id:null,
  defaultBranch:repo.default_branch||null,branches:[...new Set(branches)].sort(),branchHeads,complete,
  pushedAt:repo.pushed_at||null,observedAt:new Date().toISOString(),
  ...(includeActions?{ci}:{}),
  provenance:{provider:"github",access:"public",endpoint:base,authority:"GitHub REST API"},
  readiness:"not_assessed"
 };
}
export async function observePublicOwner(value,fetcher=globalThis.fetch,{maxPages=10,signal}={}){
 const owner=ownerName(value);
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>50)throw Error("Invalid GitHub pagination limit");
 const profile=await request(API+"/users/"+owner,fetcher,signal);
 if(!profile||!["User","Organization"].includes(profile.type))throw Error("Not a public GitHub user or organization");
 const route=profile.type==="Organization"?"orgs":"users";
 const base=API+"/"+route+"/"+owner+"/repos";
 const repositories=[];
 let complete=false;
 for(let page=1;page<=maxPages;page++){
  const query=(route==="orgs"?"type=public":"type=owner")+"&per_page=100&page="+page;
  const batch=await request(base+"?"+query,fetcher,signal);
  if(!Array.isArray(batch))throw Error("Invalid public repositories response");
  for(const repo of batch){
   if(repo?.private||repo?.visibility==="private")continue;
   if(!repo||typeof repo.full_name!=="string")throw Error("Invalid GitHub repository metadata");
   const full=repoName(repo.full_name);
   if(full.split("/")[0].toLowerCase()!==owner.toLowerCase())continue;
   repositories.push({
    id:Number.isSafeInteger(repo.id)?repo.id:null,name:full,
    defaultBranch:repo.default_branch||null,pushedAt:repo.pushed_at||null,
    archived:repo.archived===true
   });
  }
  if(batch.length<100){complete=true;break}
 }
 return {
  scope:"owner",owner,ownerType:profile.type,
  repositories:[...new Map(repositories.map(r=>[String(r.id??r.name).toLowerCase(),r])).values()].sort((a,b)=>a.name.localeCompare(b.name)),
  complete,observedAt:new Date().toISOString(),
  provenance:{provider:"github",access:"public",endpoint:base,authority:"GitHub REST API"},
  readiness:"not_assessed"
 };
}
