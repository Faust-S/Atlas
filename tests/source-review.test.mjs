import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {sourceReview} from "../src/source-review.mjs";
import {sourceChanges} from "../src/source-observation.mjs";

const shaA="a".repeat(40),shaB="b".repeat(40);
function source(summary,status="ok"){
 return {kind:"github",locator:"Faust-S/Atlas",status,
  observedAt:"2026-11-04T19:40:00Z",summary,error:status==="error"?"GitHub API 403":null};
}
test("first observation is baseline, not a source-change or acceptance",()=>{
 const observed={scope:"repository",complete:true,branches:["main"],branchHeads:{main:shaA},observedAt:"2026-11-04T17:00:00Z"};
 const model=sourceReview(source({...observed,changes:sourceChanges(null,observed)}));
 assert.equal(model.status,"Получены сведения GitHub");
 assert.equal(model.comparison,"BASELINE");
 assert.equal(model.total,0);
 assert.equal(model.authority,"OBSERVATION_ONLY");
 assert.equal(model.lastSuccess,"2026-11-04T17:00:00Z");
});
test("branch revision drift retains before and after SHA and is only observation",()=>{
 const previous={scope:"repository",complete:true,branches:["main","develop"],branchHeads:{main:shaA,develop:shaA}};
 const next={scope:"repository",complete:true,branches:["main","qa"],branchHeads:{main:shaB,qa:shaB}};
 const review=sourceReview(source({...next,changes:sourceChanges(previous,next)}));
 assert.deepEqual(review.totals,{changed:1,added:1,removed:1,renamed:0});
 assert.equal(review.total,3);
 assert.deepEqual(review.rows[0],{kind:"Изменена",title:"main",before:"aaaaaaaaaaaa",after:"bbbbbbbbbbbb"});
 assert.equal(review.rows[1].title,"qa");
 assert.equal(review.rows[2].title,"develop");
 assert.equal(review.comparison,"COMPARABLE");
});
test("incomplete, rate limited, non-GitHub and error statuses never report success",()=>{
 const previous={scope:"repository",complete:true,branches:["main"],branchHeads:{main:shaA}};
 const partial={scope:"repository",complete:false,branches:["main"],branchHeads:{main:shaB}};
 const bad=sourceReview(source({...partial,changes:sourceChanges(previous,partial)}));
 assert.equal(bad.status,"Неполное наблюдение");
 assert.equal(bad.comparison,"NOT_COMPARABLE");
 assert.equal(bad.total,0);
 const failed=sourceReview(source({...previous,changes:sourceChanges(previous,previous)},"error"));
 assert.equal(failed.status,"Последняя сверка завершилась ошибкой");
 assert.equal(failed.error,"GitHub API 403");
 assert.equal(failed.previousObservation,true);
 const other=sourceReview({kind:"obsidian",locator:"Vault",status:"never"});
 assert.equal(other.supported,false);
 assert.equal(other.status,"Ссылка; автоматическое наблюдение не подключено");
});
test("large comparison has exact totals and pagination without revising data",()=>{
 const branches=Array.from({length:201},(_,i)=>"branch-"+i);
 const before={scope:"repository",complete:true,branches,branchHeads:Object.fromEntries(branches.map(b=>[b,shaA]))};
 const after={scope:"repository",complete:true,branches,branchHeads:Object.fromEntries(branches.map(b=>[b,shaB]))};
 const data=source({...after,changes:sourceChanges(before,after)}),baseline=JSON.stringify(data);
 const page1=sourceReview(data,{limit:12}),page2=sourceReview(data,{limit:200});
 assert.equal(page1.total,201);assert.equal(page1.rows.length,12);assert.equal(page1.remaining,189);
 assert.equal(page2.rows.length,200);assert.equal(page2.remaining,1);
 assert.equal(JSON.stringify(data),baseline);
 assert.throws(()=>sourceReview(data,{limit:0}),/SOURCE_REVIEW_LIMIT_INVALID/);
});
test("overview of latest source observations is explicitly visible in desktop source tab",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/sourceReview\(s,\{limit:sourceRowLimits\[s.id\]\|\|12\}\)/);
 assert.match(ui,/review\.comparison==="COMPARABLE"/);
 assert.match(ui,/review\.rows\.map\(/);
 assert.match(ui,/Показать ещё изменения/);
 assert.match(ui,/Наблюдение источника не подтверждает готовность/);
});

test("CI review distinguishes current, obsolete and unavailable GitHub Actions states",()=>{
 const base={scope:"repository",complete:true,branches:["main"],branchHeads:{main:shaB}};
 const current=sourceReview(source({...base,ci:{state:"observed",branch:"main",runId:100,
  headCurrent:"current",status:"completed",conclusion:"success"}}));
 assert.match(current.ci.label,/этой версии успешно/);
 assert.equal(current.ci.url,"https://github.com/Faust-S/Atlas/actions/runs/100");
 assert.equal(current.ci.authority,"OBSERVATION_ONLY");
 assert.equal(current.authority,"OBSERVATION_ONLY");
 const stale=sourceReview(source({...base,ci:{state:"observed",branch:"main",runId:101,
  headCurrent:"previous",status:"completed",conclusion:"success"}}));
 assert.match(stale.ci.label,/другой редакции/);
 assert.doesNotMatch(stale.ci.label,/этой версии успешно/);
 const running=sourceReview(source({...base,ci:{state:"observed",branch:"main",runId:102,
  headCurrent:"current",status:"in_progress",conclusion:null}}));
 assert.match(running.ci.label,/выполняется/);
 const unavailable=sourceReview(source({...base,ci:{state:"unavailable",reason:"RATE_LIMITED"}}));
 assert.match(unavailable.ci.label,/GitHub временно ограничил количество запросов/);
 assert.equal(unavailable.ci.url,null);
 const failed=sourceReview(source({...base,ci:{state:"observed",branch:"main",runId:103,
  headCurrent:"current",status:"completed",conclusion:"failure"}},"error"));
 assert.match(failed.ci.label,/Предыдущее наблюдение/);
 assert.match(failed.ci.label,/ошибкой/);
 const legacy=sourceReview(source(base));
 assert.match(legacy.ci.label,/ещё не запрашивались/);
 const owner=sourceReview({kind:"github_owner",locator:"example",status:"ok",summary:base});
 assert.equal(owner.ci,null);
});
test("untrusted source URL is never used as an Actions link",()=>{
 const bad=source({ci:{state:"observed",status:"completed",conclusion:"success",
  runId:10,headCurrent:"current"}});bad.locator="javascript:alert(1)";
 const model=sourceReview(bad);
 assert.equal(model.ci.url,null);
});
test("GitHub Actions appears in the existing read-only source screen",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/review\.ci&&<div className="atlas-source-ci"/);
 assert.match(ui,/Проверки GitHub Actions/);
 assert.match(ui,/Сборка на GitHub не подтверждает выполнение требований/);
 assert.match(ui,/rel="noopener noreferrer"/);
});

test("selected branch Actions display is not confused with repository default",()=>{
 const model=source({scope:"repository",complete:true,defaultBranch:"main",
  ci:{state:"none",branch:"work/2026-11-09-atlas-0-5"}});
 model.branch="work/2026-11-09-atlas-0-5";
 const review=sourceReview(model);
 assert.match(review.ci.label,/выбранной ветке нет запусков/);
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/Ветка проверок: \{s\.branch\|\|s\.summary\?\.defaultBranch/);
 assert.match(ui,/review\.ci\.branch\|\|s\.branch/);
});

test("unavailable selected branch is shown as missing, not as a failed product",()=>{
 const model=source({scope:"repository",complete:true,defaultBranch:"main",
  ci:{state:"unavailable",branch:"work/removed",reason:"BRANCH_NOT_FOUND"}});
 model.branch="work/removed";
 const review=sourceReview(model);
 assert.match(review.ci.label,/ветка не найдена/);
 assert.equal(review.ci.branch,"work/removed");
 assert.equal(review.authority,"OBSERVATION_ONLY");
});

test("source screen can edit a connected branch without rebuilding the source",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/openEditor\("source-branch:"\+encodeURIComponent\(s\.id\)\)/);
 assert.match(ui,/Изменить ветку/);
 const editor=readFileSync(new URL("../src/editor.mjs",import.meta.url),"utf8");
 assert.match(editor,/Результаты наблюдения прежней ветки не переносятся/);
});


test("source navigation opens only a normalized official GitHub page",()=>{
 const repo=sourceReview(source(null,"never"));
 assert.equal(repo.sourceUrl,"https://github.com/Faust-S/Atlas");
 const owner=sourceReview({kind:"github_owner",locator:"Faust-S",status:"never"});
 assert.equal(owner.sourceUrl,"https://github.com/Faust-S");
 const old=sourceReview({kind:"github_owner",locator:"https://github.com/Faust-S",status:"never"});
 assert.equal(old.sourceUrl,owner.sourceUrl);
 const suspect=sourceReview({...source(null,"never"),locator:"javascript:alert(1)"});
 assert.equal(suspect.sourceUrl,null);
 assert.equal(sourceReview({kind:"obsidian",locator:"https://github.com/a/b",status:"never"}).sourceUrl,null);
});
test("desktop source screen provides direct official GitHub navigation without write authority",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/href={review.sourceUrl}/);
 assert.match(ui,/Открыть репозиторий на GitHub/);
 assert.match(ui,/Открыть страницу на GitHub/);
 assert.match(ui,/rel="noopener noreferrer"/);
});

test("GitHub source review links to exact observed commit, not latest guess",()=>{
 const observed=source({scope:"repository",complete:true,defaultBranch:"main",
  branchHeads:{main:shaA,"work/atlas-0.5":shaB},observedAt:"2026-11-09T17:00:00.000Z"});
 observed.branch="work/atlas-0.5";
 const report=sourceReview(observed);
 assert.deepEqual(report.observedCommit,{
  branch:"work/atlas-0.5",sha:shaB,
  url:"https://github.com/Faust-S/Atlas/commit/"+shaB
 });
 const old=sourceReview({...observed,status:"error",error:"temporary error"});
 assert.deepEqual(old.observedCommit,report.observedCommit);
 assert.equal(old.status,"Последняя сверка завершилась ошибкой");
 assert.equal(sourceReview({...observed,status:"never"}).observedCommit,null);
 assert.equal(sourceReview({...observed,summary:{...observed.summary,branchHeads:{"work/atlas-0.5":"wrong"}}}).observedCommit,null);
 assert.equal(sourceReview({...observed,locator:"https://evil.example/repo"}).observedCommit,null);
});
test("source screen offers read-only journey from GitHub evidence to project reality",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/review\.observedCommit&&<small>Редакция при последней сверке/);
 assert.match(ui,/href={review.observedCommit.url}/);
 assert.match(ui,/Сверить требования и факты проекта/);
 assert.doesNotMatch(ui,/project\.targets\?\.length>0&&<button type="button" className="text-link"/);
 assert.match(ui,/onClick=\{\(\)=>view\("reality"\)\}/);
 assert.match(ui,/Сборка на GitHub не подтверждает выполнение требований/);
});

test("Actions evidence links the run's exact commit separately from observed branch head",()=>{
 const branch=source({scope:"repository",complete:true,defaultBranch:"main",
  branchHeads:{main:shaB},ci:{state:"observed",branch:"main",runId:902,
  headSha:shaA,headCurrent:"previous",status:"completed",conclusion:"success"}});
 const review=sourceReview(branch);
 assert.equal(review.observedCommit.sha,shaB);
 assert.equal(review.ci.checkedCommit.sha,shaA);
 assert.equal(review.ci.checkedCommit.url,"https://github.com/Faust-S/Atlas/commit/"+shaA);
 assert.match(review.ci.label,/другой редакции/);
 assert.doesNotMatch(review.ci.label,/предыдущей версии/);
 const invalid=sourceReview(source({ci:{state:"observed",branch:"main",runId:901,
  headSha:"https://evil.example/",headCurrent:"previous",status:"completed",conclusion:"success"}}));
 assert.equal(invalid.ci.checkedCommit,null);
 assert.equal(sourceReview({...branch,locator:"javascript:1"}).ci.checkedCommit,null);
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/href={review.ci.checkedCommit.url}/);
 assert.match(ui,/Совпадение с последней наблюдавшейся редакцией ветки не подтверждено/);
});

test("source review distinguishes unverified partial-list branch lookup from a missing branch",()=>{
 const base={scope:"repository",complete:false,branches:["main"],
  branchHeads:{main:shaA},defaultBranch:"main"};
 for(const reason of ["BRANCH_LOOKUP_UNAVAILABLE","BRANCH_LOOKUP_INVALID"]){
  const model=sourceReview(source({...base,ci:{state:"unavailable",branch:"feature/unlisted",reason}}));
  assert.match(model.ci.label,/Не удалось проверить выбранную ветку/);
  assert.doesNotMatch(model.ci.label,/не найдена/);
  assert.equal(model.authority,"OBSERVATION_ONLY");
 }
 const missing=sourceReview(source({...base,ci:{state:"unavailable",branch:"feature/missing",reason:"BRANCH_NOT_FOUND"}}));
 assert.match(missing.ci.label,/ветка не найдена/);
 assert.equal(missing.ci.url,null);
});
