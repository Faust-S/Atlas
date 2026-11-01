import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,validate,serialize,deserialize} from "../src/core.mjs";
import {editorSpec,applyEditor} from "../src/editor.mjs";
import {addPortfolioLink,removePortfolioLink,portfolioNetwork,renderPortfolioNetwork,renderProjectRelations} from "../src/portfolio.mjs";

const values = record => ({get: key => record[key] ?? ""});
const fixture = () => {
 const a=createProject(empty(),{name:"Foundation",type:"engineering"});
 const b=createProject(a.state,{name:"Interface",type:"engineering"});
 const c=createProject(b.state,{name:"Launch",type:"business"});
 return {a:a.id,b:b.id,c:c.id,state:c.state};
};

test("project-to-project dependencies retain one snapshot and reject cycles",()=>{
 const f=fixture(),before=f.state;
 const one=addPortfolioLink(before,{from:f.a,to:f.b,note:"API stable"});
 const two=addPortfolioLink(one,{from:f.b,to:f.c});
 assert.equal(before.portfolioLinks,undefined);
 assert.equal(two.revision,before.revision+2);
 assert.equal(portfolioNetwork(two).pending,2);
 assert.equal(portfolioNetwork(two).affected,2);
 assert.throws(()=>addPortfolioLink(two,{from:f.c,to:f.a}),/cycle/);
 assert.throws(()=>addPortfolioLink(two,{from:f.a,to:f.b}),/Duplicate/);
 assert.throws(()=>addPortfolioLink(two,{from:f.a,to:f.a}),/Invalid portfolio/);
 assert.throws(()=>addPortfolioLink(two,{from:f.a,to:"missing"}),/Invalid portfolio/);
 assert.deepEqual(deserialize(serialize(two)),two);
 const removed=removePortfolioLink(two,one.portfolioLinks[0].id);
 assert.equal(removed.portfolioLinks.length,1);
 assert.equal(two.portfolioLinks.length,2);
});

test("portfolio editor uses project names, links exact IDs, and survives export/import",()=>{
 const f=fixture();
 const spec=editorSpec(null,"portfolio-link",f.state);
 assert.equal(spec.fields[0].options[0].label,"Foundation");
 assert.equal(spec.fields[1].value,f.b);
 const {state}=applyEditor(f.state,null,"portfolio-link",values({from:f.a,to:f.b,note:"Validated API"}));
 assert.equal(state.portfolioLinks.length,1);
 assert.equal(state.portfolioLinks[0].note,"Validated API");
 assert.equal(deserialize(serialize(state)).portfolioLinks[0].from,f.a);
 assert.match(renderProjectRelations(state,f.b),/Foundation/);
 assert.match(renderPortfolioNetwork(state),/Зависимости между проектами/);
});

test("old portfolios remain valid while invalid imported links are rejected",()=>{
 const f=fixture();
 assert.equal(validate(f.state),true);
 for(const link of [
  {id:"x",kind:"blocks",from:f.a,to:"missing"},
  {id:"x",kind:"blocks",from:f.a,to:f.a}
 ]){
  assert.throws(()=>deserialize(JSON.stringify({...f.state,portfolioLinks:[link]})),/Invalid portfolio/);
 }
 const linked=addPortfolioLink(f.state,{from:f.a,to:f.b});
 const malicious=structuredClone(linked);
 malicious.projects[0].name="<script>alert(1)</script>";
 const html=renderPortfolioNetwork(malicious);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 assert.doesNotMatch(html,/Релиз подтверждён/);
});
