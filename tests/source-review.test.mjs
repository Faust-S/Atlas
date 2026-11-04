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
