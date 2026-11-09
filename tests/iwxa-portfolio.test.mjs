import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const {zipSync,unzipSync,strToU8,strFromU8}=createRequire(new URL("../desktop/package.json",import.meta.url))("fflate");
import {empty,createProject,createItem,createDecision,serialize} from "../src/core.mjs";
import {buildIwxaPortfolio,readIwxaPortfolio,IWXA_PROFILE,IWXA_ADOPTION,
 IWXA_MAX_BYTES,toBase64,fromBase64} from "../desktop/src/iwxa-portfolio.mjs";
const fixture=()=>{
 let state=createProject(empty(),{name:"Проект Ω",type:"research"}),id=state.id;
 let s=createItem(state.state,id,{title:"Наблюдение — тест"}).state;
 s=createDecision(s,id,"Продолжать эксперименты");
 return s;
};
const make=()=>buildIwxaPortfolio(fixture(),{now:"2026-11-09T10:00:00.000Z"});
test("IWXA 1.0 ZIP carrier roundtrip preserves Atlas work, Unicode and project IDs",async()=>{
 const snapshot=fixture(),archive=await buildIwxaPortfolio(snapshot,{now:"2026-11-09T10:00:00.000Z"});
 assert.ok(archive instanceof Uint8Array);
 assert.deepEqual(Array.from(archive.slice(0,4)),[80,75,3,4]);
 const result=await readIwxaPortfolio(archive);
 assert.equal(serialize(result.snapshot),serialize(snapshot));
 assert.equal(result.profile,IWXA_PROFILE);
 assert.equal(result.adoption,IWXA_ADOPTION);
 assert.equal(result.manifest.format,"iwxa.package");
 assert.equal(result.manifest.format_version,"1.0");
 assert.equal(result.manifest.encryption,"none");
 assert.equal(result.manifest.counts.objects,1);
 assert.equal(result.manifest.counts.schemas,1);
 assert.equal(result.manifest.files.length,3);
 assert.equal(result.manifest.options.include_history,false);
 assert.equal(result.manifest.options.include_schemas,true);
 assert.equal(result.manifest.options.include_assets,false);
 assert.equal(toBase64(fromBase64(toBase64(archive))),toBase64(archive));
});
test("IWXA 1.0 object archive is inspectable by external ZIP readers, not a renamed JSON file",async()=>{
 const archive=await make(),files=unzipSync(archive);
 assert.deepEqual(Object.keys(files).sort(),["content/objects.ndjson","content/workspaces.ndjson",
  "manifest.json","schemas/iwxa.atlas.portfolio@1.0.0.json"].sort());
 const lines=strFromU8(files["content/objects.ndjson"]).trim().split("\n");
 assert.equal(lines.length,1);
 const obj=JSON.parse(lines[0]);
 assert.equal(obj.schema_id,IWXA_PROFILE);
 assert.equal(obj.schema_version,"1.0.0");
 assert.equal(obj.data.snapshot.schema,"atlas.project/1");
 const manifest=JSON.parse(strFromU8(files["manifest.json"]));
 assert.equal(manifest.workspaces.length,1);
 assert.equal(manifest.workspace_states[0].workspace_id,manifest.workspaces[0]);
 assert.equal(manifest.files[0].path,"content/objects.ndjson");
});
test("IWXA import rejects modified payload bytes, missing manifest and unknown profiles",async()=>{
 const archive=await make(),files=unzipSync(archive);
 const changed={...files,"content/objects.ndjson":strToU8(strFromU8(files["content/objects.ndjson"]).replace("Проект Ω","Проект Ψ"))};
 await assert.rejects(readIwxaPortfolio(zipSync(changed,{level:0})),/контрольная сумма файла/);
 const noManifest={...files};delete noManifest["manifest.json"];
 await assert.rejects(readIwxaPortfolio(zipSync(noManifest,{level:0})),/повреждённый список файлов/);
 const badProfile={...files,"content/objects.ndjson":strToU8(strFromU8(files["content/objects.ndjson"]).replaceAll(IWXA_PROFILE,"iwxa.other.portfolio"))};
 await assert.rejects(readIwxaPortfolio(zipSync(badProfile,{level:0})));
 const badManifest={...files,"manifest.json":strToU8(strFromU8(files["manifest.json"]).replace("iwxa.package","other.package"))};
 await assert.rejects(readIwxaPortfolio(zipSync(badManifest,{level:0})),/неподдерживаемый формат/);
});
test("IWXA importer rejects unexpected files and refuses invalid base64",async()=>{
 const archive=await make(),files=unzipSync(archive);
 await assert.rejects(readIwxaPortfolio(zipSync({...files,"technical/passwords.txt":strToU8("no")},{level:0})),
  /повреждённый список файлов/);
 await assert.rejects(readIwxaPortfolio(archive.slice(0,20)),/неверный размер/);
 assert.throws(()=>fromBase64("**not-base64**"),/ошибка чтения/);
 assert.throws(()=>fromBase64("A"),/неверные данные/);
 assert.equal(IWXA_MAX_BYTES,32*1024*1024);
});
test("IWXA exported source never invents organizational acceptance or signed transfers",async()=>{
 const module=readFileSync(new URL("../desktop/src/iwxa-portfolio.mjs",import.meta.url),"utf8");
 assert.match(module,/CONSUMER_LOCAL_PENDING_OWNER/);
 assert.match(module,/iwxa\.package/);
 assert.doesNotMatch(module,/grantIssuer|signatureIssuer|organizationSigner/);
});


test("native IWXA Save As and import preserve Atlas native generation and explicit preview",()=>{
 const rust=readFileSync(new URL("../desktop/src-tauri/src/lib.rs",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(rust,/fn atlas_export_iwxa\(/);
 assert.match(rust,/fn atlas_select_iwxa\(/);
 assert.match(rust,/write_export_atomic\(&selected,&bytes\)/);
 assert.match(rust,/head.generation!=expected_generation/);
 assert.match(rust,/add_filter\("IWXA",&\["iwxa"\]\)/);
 assert.match(ui,/const exportIwxa=async\(\)=>/);
 assert.match(ui,/const importIwxa=async\(\)=>/);
 assert.match(ui,/readSavedSnapshotForReference\(/);
 assert.match(ui,/readIwxaPortfolio\(fromBase64\(selected\)\)/);
 assert.match(ui,/prepareImportedSnapshot\(\s*startedWith,imported.snapshot,undefined,"iwxa.atlas.portfolio\/1.0.0"\)/);
 assert.match(ui,/format:"iwxa"/);
 assert.match(ui,/const applyPendingImport=async\(\)=>/);
 assert.match(ui,/head.needsConfirmation\|\|head.generation!==candidate.expectedGeneration/);
});

test("native IWXA exchange remains disabled inside a host without file-picker commands",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const host=readFileSync(new URL("../desktop/src/embedded-host.ts",import.meta.url),"utf8");
 assert.match(ui,/\{!embedded&&<>/);
 assert.match(ui,/Файловый обмен \.iwxa доступен в самостоятельном Atlas/);
 assert.doesNotMatch(host,/atlas_export_iwxa|atlas_select_iwxa/);
 assert.match(ui,/История сохранений в него не входит/);
});

test("fresh empty Atlas snapshot uses T2 object envelope revision 1 but retains local revision 0",async()=>{
 const snapshot=empty(),archive=await buildIwxaPortfolio(snapshot,
  {now:"2026-11-09T10:00:00.000Z"}),files=unzipSync(archive);
 const obj=JSON.parse(strFromU8(files["content/objects.ndjson"]));
 assert.equal(obj.revision,1,"T2 Runtime 1.3.0 Object requires revision >= 1");
 assert.equal(obj.data.snapshot.revision,0,"Atlas initial snapshot revision must not be rewritten");
 assert.equal(serialize((await readIwxaPortfolio(archive)).snapshot),serialize(snapshot));
});
test("T2 package date-time envelope is not merely a parsable date",async()=>{
 await assert.rejects(buildIwxaPortfolio(empty(),{now:"2026-11-09"}),/неверная дата/);
 await assert.rejects(buildIwxaPortfolio(empty(),{now:"invalid date"}),/неверная дата/);
 const accepted=await buildIwxaPortfolio(empty(),{now:"2026-11-09T10:00:00+03:00"});
 assert.equal((await readIwxaPortfolio(accepted)).snapshot.revision,0);
});
test("Atlas rejects a re-signed carrier with a different local project schema",async()=>{
 const zip=unzipSync(await make()),path="schemas/iwxa.atlas.portfolio@1.0.0.json";
 const schema=JSON.parse(strFromU8(zip[path]));
 schema.json_schema={type:"object"};
 const digest=async bytes=>{
  const raw=typeof bytes==="string"?new TextEncoder().encode(bytes):bytes;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",raw)),
   b=>b.toString(16).padStart(2,"0")).join("");
 };
 const canonical=value=>Array.isArray(value)?value.map(canonical):
  value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort()
   .map(key=>[key,canonical(value[key])])):value;
 schema.canonical_sha256=await digest(JSON.stringify(canonical(schema.json_schema)));
 zip[path]=strToU8(JSON.stringify(schema));
 const manifest=JSON.parse(strFromU8(zip["manifest.json"]));
 const file=manifest.files.find(f=>f.path===path);
 file.size=zip[path].length;file.sha256=await digest(zip[path]);
 manifest.package_digest=await digest(manifest.files.map(f=>f.path+"\t"+f.sha256+"\n").join(""));
 zip["manifest.json"]=strToU8(JSON.stringify(manifest));
 await assert.rejects(readIwxaPortfolio(zipSync(zip,{level:0})),/неверная схема данных/);
});

test("previous empty-portfolio IWXA copies stay readable; new copies use the canonical T2 object revision",async()=>{
 const zip=unzipSync(await buildIwxaPortfolio(empty(),{now:"2026-11-09T10:00:00.000Z"}));
 const path="content/objects.ndjson";
 const object=JSON.parse(strFromU8(zip[path]));
 assert.equal(object.revision,1);
 object.revision=0; // A previously issued Atlas 0.5 dev archive.
 zip[path]=strToU8(JSON.stringify(object)+"\n");
 const sha=async bytes=>Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256",typeof bytes==="string"?new TextEncoder().encode(bytes):bytes)),
  b=>b.toString(16).padStart(2,"0")).join("");
 const manifest=JSON.parse(strFromU8(zip["manifest.json"]));
 const file=manifest.files.find(f=>f.path===path);
 file.size=zip[path].length;file.sha256=await sha(zip[path]);
 manifest.package_digest=await sha(manifest.files.map(f=>f.path+"\t"+f.sha256+"\n").join(""));
 zip["manifest.json"]=strToU8(JSON.stringify(manifest));
 const restored=await readIwxaPortfolio(zipSync(zip,{level:0}));
 assert.equal(restored.snapshot.revision,0);
 assert.deepEqual(restored.snapshot.projects,[]);
 const renewed=unzipSync(await buildIwxaPortfolio(restored.snapshot,{now:"2026-11-09T11:00:00.000Z"}));
 assert.equal(JSON.parse(strFromU8(renewed[path])).revision,1);
});
test("Atlas refuses a manifest that claims excluded relations or history without carrying them",async()=>{
 const zip=unzipSync(await make()),manifest=JSON.parse(strFromU8(zip["manifest.json"]));
 manifest.options.include_history=true;
 zip["manifest.json"]=strToU8(JSON.stringify(manifest));
 await assert.rejects(readIwxaPortfolio(zipSync(zip,{level:0})),/состав портфеля не подтверждён/);
 manifest.options.include_history=false;manifest.options.include_relations=true;
 zip["manifest.json"]=strToU8(JSON.stringify(manifest));
 await assert.rejects(readIwxaPortfolio(zipSync(zip,{level:0})),/состав портфеля не подтверждён/);
});
