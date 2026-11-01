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
export async function observePublicRepo(value,fetcher=globalThis.fetch,{maxPages=20,signal}={}){
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
 return {
  scope:"repository",repository:name,repositoryId:Number.isSafeInteger(repo.id)?repo.id:null,
  defaultBranch:repo.default_branch||null,branches:[...new Set(branches)].sort(),branchHeads,complete,
  pushedAt:repo.pushed_at||null,observedAt:new Date().toISOString(),
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
