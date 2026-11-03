// Run against an independently checked-out, immutable 0.1 source tree.
// This is an authentic 0.1 serialize() result, not 0.2 data labelled 0.1.
import {resolve,join,dirname} from "node:path";
import {pathToFileURL} from "node:url";
import {mkdir,writeFile} from "node:fs/promises";
import assert from "node:assert/strict";

const [legacyDirectory,outputPath]=process.argv.slice(2);
if(!legacyDirectory||!outputPath)throw Error("Usage: node generate-release-01-archive.mjs LEGACY_ROOT OUTPUT.json");
const legacyRoot=resolve(legacyDirectory);
const moduleAt=path=>import(pathToFileURL(join(legacyRoot,path)).href);
const {empty,createProject,createItem,connect,createDecision,attach,serialize,deserialize}=await moduleAt("src/core.mjs");
const {addTarget,recordFinding,planChange}=await moduleAt("src/trace.mjs");
const {addPortfolioLink}=await moduleAt("src/portfolio.mjs");

const first=createProject(empty(),{name:"ATLAS_LEGACY_01_RESEARCH",type:"research"});
const second=createProject(first.state,{name:"ATLAS_LEGACY_01_DELIVERY",type:"engineering"});
let legacy=second.state;
const work1=createItem(legacy,first.id,{title:"ATLAS_LEGACY_01_FIRST_WORK"});
const work2=createItem(work1.state,first.id,{title:"ATLAS_LEGACY_01_SECOND_WORK"});
legacy=connect(work2.state,first.id,work1.id,work2.id);
legacy=createDecision(legacy,first.id,"ATLAS_LEGACY_01_HUMAN_DECISION");
const tagged=addTarget(legacy,first.id,{title:"ATLAS_LEGACY_01_EXPECTED",desired:"Review original evidence",intent:"committed"});
legacy=tagged.state;
const linked=attach(legacy,first.id,"github","openai/openai-node");
legacy=linked.state;
legacy=recordFinding(legacy,first.id,{
 targetId:tagged.id,result:"partial",level:"test",sourceId:linked.id,
 ref:"main",revision:"a".repeat(40),note:"ATLAS_LEGACY_01_EVIDENCE"
}).state;
legacy=planChange(legacy,first.id,{title:"ATLAS_LEGACY_01_PROPOSED_CHANGE",targetIds:[tagged.id]}).state;
legacy=addPortfolioLink(legacy,{from:first.id,to:second.id,note:"ATLAS_LEGACY_01_UPSTREAM"});
const json=serialize(legacy);
assert.deepEqual(deserialize(json),legacy);
assert.equal(legacy.projects.length,2);
assert.equal(legacy.projects[0].items.length,2);
assert.equal(legacy.portfolioLinks.length,1);
await mkdir(dirname(resolve(outputPath)),{recursive:true});
await writeFile(resolve(outputPath),json+"\n","utf8");
console.log("ATLAS_RELEASE_01_AUTHENTIC_EXPORT_PASS projects=2 works=2 dependencies=1 evidence=1 decisions=1 change=1 portfolioLinks=1");
