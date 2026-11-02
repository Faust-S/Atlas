// Real three-OS Chromium acceptance. Browser + IndexedDB are native, sources are deterministic public REST fixtures.
// CI-only, no external secrets, no app runtime dependencies.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,resolve,sep} from "node:path";
import {chromium} from "playwright";

const root=process.cwd(),errors=[],checkpoints=[];
const mime={".html":"text/html; charset=utf-8",".mjs":"text/javascript; charset=utf-8",
 ".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",
 ".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon"};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
  if(pathname==="/favicon.ico"){res.writeHead(204);res.end();return}
  const file=resolve(root,"."+ (pathname==="/"?"/index.html":pathname));
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return}
  const data=await readFile(file);
  res.writeHead(200,{"content-type":mime[extname(file)]||"application/octet-stream","cache-control":"no-store"});
  res.end(data);
 }catch(e){res.writeHead(404);res.end("Not found")}
});
const listen=()=>new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});
const close=()=>new Promise(resolve=>server.close(resolve));
let browser,step="initial",origin="";
function mark(label){step=label;checkpoints.push(label);console.log("ATLAS_BROWSER_STAGE "+label)}
function watch(page){
 page.on("pageerror",e=>errors.push("PAGEERROR "+step+": "+e.message));
 page.on("console",e=>{if(e.type()==="error")errors.push("CONSOLE "+step+": "+e.text())});
}
function noUiError(page){return page.locator("#message").innerText().then(v=>assert.equal(v,"","Atlas UI error at "+step))}
async function form(page,action,values){
 await page.locator('[data-action="'+action+'"]').first().click();
 const editor=page.locator("#atlas-editor-form");
 await editor.waitFor({timeout:20000});
 for(const [name,value] of Object.entries(values)){
  const field=editor.locator('[name="'+name+'"]');
  const type=await field.evaluate(el=>el.tagName);
  if(type==="SELECT")await field.selectOption(typeof value==="object"?value:String(value));
  else await field.fill(String(value));
 }
 await editor.locator('button[type="submit"]').click();
 await editor.waitFor({state:"detached",timeout:25000});
 await noUiError(page);
}
async function snapshot(page){
 return page.evaluate(async()=>{
  const open=indexedDB.open("iwxa-atlas-standalone",1);
  return new Promise((resolve,reject)=>{
   open.onerror=()=>reject(open.error);
   open.onsuccess=()=>{
    const db=open.result,tx=db.transaction("snapshots","readonly"),head=tx.objectStore("snapshots").get("head");
    head.onsuccess=()=>{try{resolve(JSON.parse(head.result.json))}catch(e){reject(e)}};
    head.onerror=()=>reject(head.error);
    tx.oncomplete=()=>db.close();
   };
  });
 });
}
async function until(page,predicate,label){
 for(let i=0;i<80;i++){
  const state=await snapshot(page);
  if(predicate(state))return state;
  await page.waitForTimeout(100);
 }
 throw Error("IndexedDB readback failed: "+label);
}
async function browserStorage(){
 mark("native IndexedDB: legacy migration, stale tab, corrupt head and restore");
 const page=await browser.newPage();
 watch(page);
 try{
  await page.goto(origin+"/tests/storage-browser.html",{waitUntil:"load"});
  await page.waitForFunction(()=>["PASS","FAIL"].includes(document.documentElement.dataset.status),null,{timeout:45000});
  const result=await page.locator("#results").innerText();
  assert.equal(await page.locator("html").getAttribute("data-status"),"PASS",result);
  assert.match(result,/legacy localStorage migrated/);
  assert.match(result,/stale-tab write rejected/);
  assert.match(result,/corrupt head detected/);
  console.log("ATLAS_REAL_INDEXEDDB "+result.replace(/\n/g," | "));
 }catch(e){
  await page.screenshot({path:"atlas-ci-storage-failure.png",fullPage:true}).catch(()=>{});
  throw e;
 }finally{await page.close()}
}
async function browserUserJourney(){
 let branchSha="a".repeat(40),requests=0;
 const context=await browser.newContext({viewport:{width:1320,height:900},acceptDownloads:true});
 const page=await context.newPage();
 watch(page);
 await page.route("https://api.github.com/**",async route=>{
  requests++;
  const u=new URL(route.request().url()),path=u.pathname;
  let data;
  if(path==="/users/atlas-public-fixture")data={type:"Organization"};
  else if(path==="/orgs/atlas-public-fixture/repos")
   data=[{id:112233,full_name:"atlas-public-fixture/atlas",name:"atlas",default_branch:"main",pushed_at:"2026-11-02T00:00:00Z",archived:false,private:false}];
  else if(path==="/repos/atlas-public-fixture/atlas")
   data={id:112233,name:"atlas",full_name:"atlas-public-fixture/atlas",private:false,default_branch:"main",pushed_at:"2026-11-02T00:00:00Z"};
  else if(path==="/repos/atlas-public-fixture/atlas/branches")
   data=[{name:"main",commit:{sha:branchSha}},{name:"work/test",commit:{sha:"c".repeat(40)}}];
  else throw Error("Unexpected GitHub REST endpoint "+path);
  await route.fulfill({status:200,contentType:"application/json",headers:{"access-control-allow-origin":"*","cache-control":"no-store"},body:JSON.stringify(data)});
 });
 try{
  mark("open standalone Atlas and create project");
  await page.goto(origin+"/index.html",{waitUntil:"load"});
  await page.locator("#storage-status").getByText("Локальные данные: IndexedDB").waitFor({timeout:30000});
  assert.match(await page.locator("#app").innerText(),/Портфель проектов/);
  await form(page,"new",{name:"Atlas Chromium qualification",type:"engineering",goal:"Validate restoration, evidence and delivery"});
  assert.match(await page.locator("#app").innerText(),/Atlas Chromium qualification/);
  let state=await snapshot(page),main=state.projects[0];
  assert.equal(state.projects.length,1);
  mark("expected outcome, two tasks and dependency graph");
  await form(page,"target",{title:"Offline result",desired:"Restore the recorded state",intent:"committed"});
  await form(page,"item",{title:"Implement",targetId:{label:"Offline result"},estimateDays:"2"});
  await form(page,"item",{title:"Validate",targetId:{label:"Offline result"},estimateDays:"1"});
  await form(page,"dep",{from:{label:"Implement"},to:{label:"Validate"}});
  await page.locator('#atlas-relations svg').waitFor({timeout:10000});
  await page.locator("#atlas-graph-mode").selectOption("critical");
  assert.match(await page.locator("#atlas-relations").innerText(),/Критический путь/);
  await page.locator("#atlas-graph-mode").selectOption("all");
  state=await snapshot(page);
  main=state.projects[0];
  assert.equal(main.targets.length,1);
  assert.equal(main.items.length,2);
  assert.equal(main.dependencies.length,1);
  assert.deepEqual(main.items.map(w=>w.targetIds.length),[1,1]);
  mark("public GitHub owner discovery and explicit repo enrollment");
  await form(page,"source",{kind:"github_owner",locator:"atlas-public-fixture"});
  state=await snapshot(page);
  const owner=state.projects[0].sources.find(s=>s.kind==="github_owner");
  await page.locator('[data-action="sync:'+owner.id+'"]').click();
  state=await until(page,s=>s.projects[0].sources.find(x=>x.id===owner.id)?.status==="ok","owner discovery");
  assert.equal(state.projects[0].sources.find(x=>x.id===owner.id).summary.repositories.length,1);
  await page.locator('[data-action^="adopt:"]').first().click();
  state=await until(page,s=>s.projects[0].sources.some(x=>x.kind==="github"),"explicit repo enrollment");
  const repo=state.projects[0].sources.find(s=>s.kind==="github");
  await page.locator('[data-action="sync:'+repo.id+'"]').click();
  state=await until(page,s=>s.projects[0].sources.find(x=>x.id===repo.id)?.status==="ok","branch SHA readback");
  assert.equal(state.projects[0].sources.find(x=>x.id===repo.id).summary.branchHeads.main,branchSha);
  assert.ok(requests>=4,"GitHub REST fixture was not exercised");
  mark("source-linked finding and SHA invalidation");
  await form(page,"finding",{targetId:{label:"Offline result"},result:"partial",level:"test",
   sourceRef:{value:repo.id+"::main"},reference:"https://example.org/qa-public",note:"Re-test pending"});
  state=await snapshot(page);
  assert.equal(state.projects[0].findings.length,1);
  assert.equal(state.projects[0].findings[0].revision,branchSha);
  const oldSha=branchSha;
  branchSha="b".repeat(40);
  await page.locator('[data-action="sync:'+repo.id+'"]').click();
  state=await until(page,s=>s.projects[0].sources.find(x=>x.id===repo.id)?.summary.branchHeads.main===branchSha,"changed branch SHA");
  assert.equal(state.projects[0].findings[0].revision,oldSha,"earlier claim must remain on its original commit");
  assert.deepEqual(state.projects[0].sources.find(x=>x.id===repo.id).summary.changes.changed,["main"]);
  assert.match(await page.locator("#atlas-trace").innerText(),/Данные требуют сверки/);
  mark("review changed SHA with an explicit, revision-pinned human claim");
  const previousFinding=state.projects[0].findings[0];
  const recheck="recheck:"+[main.id,previousFinding.id,branchSha].map(encodeURIComponent).join(":");
  await page.locator('[data-action="back"]').click();
  await page.locator('#atlas-revision-review [data-action^="recheck:"]').first().waitFor();
  await form(page,recheck,{result:"partial",level:"test",reference:"https://example.org/recheck",
   note:"Executed the offline recovery scenario against the newly observed Git SHA"});
  state=await snapshot(page);
  assert.equal(state.projects[0].findings.length,2);
  const followup=state.projects[0].findings[1];
  assert.equal(followup.reviewOfFindingId,previousFinding.id);
  assert.equal(followup.revision,branchSha);
  assert.equal(previousFinding.revision,oldSha);
  assert.match(await page.locator("#atlas-trace").innerText(),/Реализовано частично/);
  await page.locator('[data-action="back"]').click();
  assert.equal(await page.locator('#atlas-revision-review [data-action^="recheck:"]').count(),0);
  await page.locator('[data-action="open:'+main.id+'"]').first().click();
  mark("human decision with rationale and approved remediation work");
  const blocked=state.projects[0].items.find(x=>x.title==="Implement");
  await page.locator('select[data-work="'+blocked.id+'"]').selectOption("blocked");
  state=await until(page,s=>s.projects[0].items.find(w=>w.id===blocked.id)?.state==="blocked","blocked work");
  const cause="work-blocked:"+blocked.id;
  await form(page,"respond:"+encodeURIComponent(cause),{title:"Repair persistence writer",description:"Restore verified storage"});
  state=await snapshot(page);
  const change=state.projects[0].changes.find(c=>c.causeKey===cause);
  assert.ok(change,"Linked proposal was not persisted");
  assert.equal(change.status,"proposed");
  await form(page,"change:"+change.id,{status:"approved",rationale:"Owner reviewed the recovery procedure"});
  state=await snapshot(page);
  assert.equal(state.projects[0].changes.find(c=>c.id===change.id).status,"approved");
  assert.ok(state.projects[0].decisions.some(d=>d.changeId===change.id && d.text.includes("Owner reviewed")));
  await form(page,"work-change:"+change.id,{title:"Re-test storage writer",estimateDays:"2"});
  state=await snapshot(page);
  assert.ok(state.projects[0].items.some(w=>w.changeId===change.id));
  mark("application reload and IndexedDB readback");
  await page.reload({waitUntil:"load"});
  await page.locator("#storage-status").getByText("Локальные данные: IndexedDB").waitFor();
  await page.locator('[data-action="open:'+main.id+'"]').first().click();
  assert.match(await page.locator("#atlas-trace").innerText(),/Реализовано частично/);
  assert.match(await page.locator("#atlas-trace").innerText(),/повторная проверка/);
  state=await snapshot(page);
  assert.equal(state.projects[0].findings[0].revision,oldSha);
  assert.equal(state.projects[0].findings[1].revision,branchSha);
  assert.match(await page.locator("#atlas-project-response").innerText(),/Owner reviewed the recovery procedure/);
  assert.ok(await page.locator('#atlas-relations svg').count());
  mark("second project, cross-project link and portfolio visualization");
  await page.locator('[data-action="back"]').click();
  await form(page,"new",{name:"Consumer project",type:"business",goal:"Depends on qualified API"});
  state=await snapshot(page);
  const consumer=state.projects.find(p=>p.name==="Consumer project");
  await form(page,"target",{title:"Product acceptance",desired:"Independent review",intent:"committed"});
  await page.locator('[data-action="back"]').click();
  await page.locator('[data-action="portfolio-view:details"]').click();
  await form(page,"portfolio-link",{from:{value:main.id},to:{value:consumer.id},note:"Requires validated offline result"});
  await page.locator('svg[aria-label="Граф зависимостей портфеля"]').waitFor();
  state=await snapshot(page);
  assert.equal(state.projects.length,2);
  assert.equal(state.portfolioLinks.length,1);
  assert.equal(state.portfolioLinks[0].from,main.id);
  assert.equal(state.portfolioLinks[0].to,consumer.id);
  mark("human plan-review decisions and linked proposal for downstream projects");
  const rechecked=state.projects.find(p=>p.id===main.id).findings.at(-1);
  const reviewAction=(pid)=>"plan-review:"+[main.id,rechecked.id,pid,branchSha].map(encodeURIComponent).join(":");
  await page.locator('#atlas-plan-reviews [data-action^="plan-review:"]').first().waitFor();
  await form(page,reviewAction(consumer.id),{
   outcome:"revise",rationale:"Upstream retest requires dependent launch review"
  });
  state=await snapshot(page);
  const reviewDecision=state.projects.find(p=>p.id===consumer.id).decisions.at(-1);
  assert.equal(reviewDecision.kind,"plan_review");
  assert.equal(reviewDecision.outcome,"revise");
  assert.equal(state.projects.find(p=>p.id===consumer.id).changes.length,0);
  await page.locator('[data-action="back"]').click();
  const proposalAction="plan-proposal:"+[consumer.id,reviewDecision.id].map(encodeURIComponent).join(":");
  await form(page,proposalAction,{
   title:"Revalidate consumer launch",
   description:"Recheck consumer assumptions and dependencies after changed upstream SHA"
  });
  state=await snapshot(page);
  const dependent=state.projects.find(p=>p.id===consumer.id);
  assert.equal(dependent.changes.length,1);
  assert.equal(dependent.changes[0].status,"proposed");
  assert.equal(dependent.changes[0].planReviewDecisionId,reviewDecision.id);
  assert.equal(dependent.items.length,0);
  mark("concrete amendment proposal, forecast, approval and explicit plan application");
  const amendment=dependent.changes[0];
  await form(page,"amend-new:"+amendment.id,{
   title:"Revalidate consumer delivery",estimateDays:"3",assignee:"Launch reviewer",dueDate:"2026-11-20"
  });
  state=await snapshot(page);
  assert.equal(state.projects.find(p=>p.id===consumer.id).items.length,0,"proposal must not create real work");
  assert.equal(state.projects.find(p=>p.id===consumer.id).changes[0].planAmendments.length,1);
  await page.locator('[data-action="preview-amendment:'+amendment.id+'"]').click();
  assert.match(await page.locator("#atlas-plan-amendments").innerText(),/Расчёт CPM/);
  await noUiError(page);
  await form(page,"change:"+amendment.id,{status:"approved",rationale:"Owner reviewed the concrete work and assumptions"});
  state=await snapshot(page);
  assert.equal(state.projects.find(p=>p.id===consumer.id).items.length,0,"approval cannot apply plan");
  await page.locator('[data-action="preview-amendment:'+amendment.id+'"]').click();
  await page.locator('[data-action="preview-amendment:'+amendment.id+'"]').click();
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('[data-action="apply-amendment:'+amendment.id+'"]').click();
  state=await until(page,s=>s.projects.find(p=>p.id===consumer.id)?.changes[0]?.planAppliedAt,
   "applied amendment persisted");
  const committed=state.projects.find(p=>p.id===consumer.id);
  assert.equal(committed.items.length,1);
  assert.equal(committed.items[0].assignee,"Launch reviewer");
  assert.equal(committed.items[0].estimateDays,3);
  assert.equal(committed.items[0].changeId,amendment.id);
  assert.ok(committed.decisions.some(d=>d.kind==="plan_application"&&d.changeId===amendment.id));
  await page.reload({waitUntil:"load"});
  await page.locator("#storage-status").getByText("Локальные данные: IndexedDB").waitFor();
  await page.locator('[data-action="open:'+consumer.id+'"]').first().click();
  assert.match(await page.locator("#atlas-plan-amendments").innerText(),/план изменён/);
  assert.match(await page.locator("#atlas-project-resources").innerText(),/Launch reviewer/);
  mark("explicit planning resource and work capacity survive native readback");
  await page.locator('[data-action="back"]').click();
  await form(page,"resource-new",{
   label:"Launch reviewer capacity",capacityPct:"80",
   availableFrom:"2026-11-01",availableUntil:"2026-12-01"
  });
  state=await snapshot(page);
  const resource=state.resources.at(-1);
  assert.equal(resource.capacityPct,80);
  assert.equal(resource.label,"Launch reviewer capacity");
  assert.match(await page.locator("#atlas-portfolio-resources").innerText(),/Launch reviewer capacity/);
  await page.locator('[data-action="open:'+consumer.id+'"]').first().click();
  await form(page,"work:"+committed.items[0].id,{
   resourceId:{value:resource.id},allocationPct:"60"
  });
  state=await snapshot(page);
  const bound=state.projects.find(p=>p.id===consumer.id).items.find(w=>w.id===committed.items[0].id);
  assert.equal(bound.resourceId,resource.id);
  assert.equal(bound.allocationPct,60);
  await page.reload({waitUntil:"load"});
  await page.locator("#storage-status").getByText("Локальные данные: IndexedDB").waitFor();
  state=await snapshot(page);
  assert.equal(state.resources.find(r=>r.id===resource.id)?.capacityPct,80);
  assert.equal(state.projects.find(p=>p.id===consumer.id).items.find(w=>w.id===bound.id).resourceId,resource.id);
  await form(page,reviewAction(main.id),{
   outcome:"keep",rationale:"The current upstream plan remains suitable"
  });
  state=await snapshot(page);
  assert.equal(state.projects.find(p=>p.id===main.id).decisions.at(-1).outcome,"keep");
  await page.locator('[data-action="back"]').click();
  mark("portfolio evidence filter and deep-link navigation");
  await page.locator("#atlas-command-filter").selectOption("evidence");
  assert.ok(await page.locator('#atlas-command-rows [data-action^="inspect:"]').count());
  const evidenceLink=page.locator('#atlas-command-rows [data-action*=":evidence"]').first();
  if(!await evidenceLink.isVisible()){
   const details=evidenceLink.locator("xpath=ancestor::details");
   await details.evaluate(el=>{el.open=true});
  }
  await evidenceLink.click();
  await page.locator("#atlas-trace").waitFor();
  assert.match(await page.locator("#atlas-trace").innerText(),/Offline result|Product acceptance/);
  mark("JSON export, restore after edits, and native reload");
  await page.locator('[data-action="back"]').click();
  const downloadPromise=page.waitForEvent("download",{timeout:15000});
  await page.locator("#export").click();
  const download=await downloadPromise;
  const chunks=[];
  for await(const c of await download.createReadStream())chunks.push(c);
  const exported=Buffer.concat(chunks);
  const exportedState=JSON.parse(exported.toString("utf8"));
  assert.equal(exportedState.projects.length,2);
  await form(page,"new",{name:"Temporary project",type:"other",goal:"Removed on import"});
  assert.equal((await snapshot(page)).projects.length,3);
  await page.locator('[data-action="back"]').click();
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#file").setInputFiles({name:"atlas-backup.json",mimeType:"application/json",buffer:exported});
  state=await until(page,s=>s.projects.length===2 && !s.projects.some(p=>p.name==="Temporary project"),"imported JSON restored");
  assert.equal(state.portfolioLinks.length,1);
  const restoredFindings=state.projects.find(p=>p.id===main.id).findings;
  assert.equal(restoredFindings.length,2);
  assert.equal(restoredFindings[0].revision,oldSha);
  assert.equal(restoredFindings[1].revision,branchSha);
  assert.equal(restoredFindings[1].reviewOfFindingId,restoredFindings[0].id);
  const restoredConsumer=state.projects.find(p=>p.id===consumer.id);
  assert.ok(restoredConsumer.changes[0].planAppliedAt);
  assert.equal(restoredConsumer.items.find(w=>w.changeId===amendment.id)?.estimateDays,3);
  assert.equal(restoredConsumer.items.find(w=>w.changeId===amendment.id)?.resourceId,resource.id);
  assert.equal(state.resources.find(r=>r.id===resource.id)?.capacityPct,80);
  assert.ok(restoredConsumer.decisions.some(d=>d.kind==="plan_application"));
  await page.reload({waitUntil:"load"});
  await page.locator("#storage-status").getByText("Локальные данные: IndexedDB").waitFor();
  assert.match(await page.locator("#app").innerText(),/Consumer project/);
  mark("responsive mobile viewport");
  await page.setViewportSize({width:390,height:844});
  await page.reload({waitUntil:"load"});
  await page.locator("#atlas-command").waitFor();
  assert.ok(await page.locator('[data-action^="open:"]').count()>0);
  assert.equal(await page.locator("#message").innerText(),"");
  assert.deepEqual(errors,[],"Browser runtime errors");
  console.log("ATLAS_REAL_BROWSER_JOURNEY PASS: cross-OS user route, SHA provenance, decision rationale, graph, IndexedDB and JSON");
 }catch(e){
  console.error("ATLAS_BROWSER_FAILED_STAGE "+step);
  await page.screenshot({path:"atlas-ci-journey-failure.png",fullPage:true}).catch(()=>{});
  throw e;
 }finally{await context.close()}
}
try{
 await listen();
 origin="http://127.0.0.1:"+server.address().port;
 browser=await chromium.launch({headless:true});
 await browserStorage();
 await browserUserJourney();
 if(errors.length)throw Error(errors.join("\n"));
 console.log("ATLAS_CHROMIUM_"+process.platform.toUpperCase()+" PASS "+checkpoints.length+" stages");
}catch(e){
 console.error("ATLAS_CHROMIUM_"+process.platform.toUpperCase()+" FAIL "+(e.stack||e));
 process.exitCode=1;
}finally{
 await browser?.close();
 await close();
}
