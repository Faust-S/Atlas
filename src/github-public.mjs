// Public repositories only: no credentials or private source contents in this adapter.
const valid=/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
export function repoName(value){let s=String(value||"").trim();if(s.startsWith("https://github.com/")){const u=new URL(s);if(u.hostname!=="github.com"||u.search||u.hash)throw Error("Invalid URL");s=u.pathname.replace(/^\/+|\/+$/g,"").replace(/\.git$/,"");}if(!valid.test(s)||s.includes(".."))throw Error("Invalid repository name");return s}
export async function observePublicRepo(value,fetcher=fetch){
 const name=repoName(value),base="https://api.github.com/repos/"+name;
 async function req(url){const r=await fetcher(url,{headers:{Accept:"application/vnd.github+json"}});if(!r.ok)throw Error("GitHub API "+r.status);return r.json()}
 const repo=await req(base);if(repo.private||repo.visibility==="private")throw Error("Private repositories require an authorized host");
 const branches=[],branchHeads={},maxPages=20;let complete=false;
 for(let page=1;page<=maxPages;page++){const data=await req(base+"/branches?per_page=100&page="+page);if(!Array.isArray(data))throw Error("Invalid branch response");for(const b of data){if(typeof b.name!=="string")throw Error("Invalid branch");branches.push(b.name);if(typeof b.commit?.sha==="string")branchHeads[b.name]=b.commit.sha;}if(data.length<100){complete=true;break}}
 return {repository:name,defaultBranch:repo.default_branch||null,branches:[...new Set(branches)].sort(),branchHeads,complete,pushedAt:repo.pushed_at||null,readiness:"not_assessed"};
}
