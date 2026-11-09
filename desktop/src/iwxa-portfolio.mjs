// Atlas consumer adapter for IWXA package 1.0 (T2/T3 envelope).
// The Atlas portfolio object profile is local-only pending IWXA owner adoption.
import {zipSync,unzipSync,strToU8,strFromU8} from "fflate";
import {deserialize,serialize} from "../../src/core.mjs";

export const IWXA_PROFILE="iwxa.atlas.portfolio";
export const IWXA_PROFILE_VERSION="1.0.0";
export const IWXA_ADOPTION="CONSUMER_LOCAL_PENDING_OWNER";
export const IWXA_MAX_BYTES=32*1024*1024;
const PACKAGE="iwxa.package", VERSION="1.0";
const CONTENT="content/objects.ndjson",WORKSPACES="content/workspaces.ndjson";
const SCHEMA="schemas/"+IWXA_PROFILE+"@"+IWXA_PROFILE_VERSION+".json";
const PATHS=[CONTENT,WORKSPACES,SCHEMA].sort(),NAMES=["manifest.json",...PATHS];
const encoder=new TextEncoder();
const validSha=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
// Match the date-time envelopes in the pinned T2 Runtime 1.3.0 contract.
// A date-only string may parse in JavaScript but is not a T2 date-time.
const validDateTime=x=>typeof x==="string"&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&
 Number.isFinite(Date.parse(x));
const fail=reason=>{throw Error("Не удалось открыть архив IWXA: "+reason)};
const expect=(condition,reason)=>{if(!condition)fail(reason)};
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value!==null&&typeof value==="object")return Object.fromEntries(
  Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
async function digest(data){
 const bytes=typeof data==="string"?encoder.encode(data):data;
 if(!globalThis.crypto?.subtle)throw Error("SHA-256 недоступен на этом компьютере");
 const result=await globalThis.crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(result),b=>b.toString(16).padStart(2,"0")).join("");
}
const digestObject=data=>digest(JSON.stringify(canonical(data)));
const schemaDefinition=()=>({
 $schema:"https://json-schema.org/draft/2020-12/schema",type:"object",
 required:["snapshot"],additionalProperties:false,
 properties:{snapshot:{type:"object",required:["schema","revision","projects"],
  properties:{schema:{const:"atlas.project/1"},revision:{type:"integer",minimum:0},
   projects:{type:"array"}},additionalProperties:true}}
});
const line=value=>JSON.stringify(value)+"\n";
function parseLine(bytes,label){
 const rows=strFromU8(bytes).trim().split(/\r?\n/);
 expect(rows.length===1,label+": ожидается одна запись");
 try{return JSON.parse(rows[0])}catch{fail(label+": неверная запись")}
}
// ZIP decompression stays with fflate, never with a second custom ZIP codec.
// Read only the ZIP central-directory sizes before expanding untrusted input.
function preflightZip(bytes){
 expect(bytes instanceof Uint8Array&&bytes.length>=22&&bytes.length<=IWXA_MAX_BYTES,"неверный размер файла");
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let eocd=-1;
 for(let pos=bytes.length-22;pos>=Math.max(0,bytes.length-65557);pos--){
  if(view.getUint32(pos,true)===0x06054b50&&pos+22+view.getUint16(pos+20,true)===bytes.length){eocd=pos;break}
 }
 expect(eocd>=0,"ZIP-контейнер не найден");
 const count=view.getUint16(eocd+10,true),size=view.getUint32(eocd+12,true),start=view.getUint32(eocd+16,true);
 expect(view.getUint16(eocd+4,true)===0&&view.getUint16(eocd+6,true)===0&&
  count===view.getUint16(eocd+8,true)&&count===NAMES.length&&
  start+size<=eocd,"повреждённый список файлов");
 let position=start,total=0;
 const seen=new Set();
 for(let i=0;i<count;i++){
  expect(position+46<=start+size&&view.getUint32(position,true)===0x02014b50,"повреждённая запись ZIP");
  const flags=view.getUint16(position+8,true),method=view.getUint16(position+10,true);
  const compressed=view.getUint32(position+20,true),expanded=view.getUint32(position+24,true);
  const nameSize=view.getUint16(position+28,true),extra=view.getUint16(position+30,true),comment=view.getUint16(position+32,true);
  const end=position+46+nameSize+extra+comment;
  expect(end<=start+size&&!(flags&1)&&method===0&&compressed===expanded,
   "неподдерживаемое сжатие или шифрование");
  const filename=strFromU8(bytes.slice(position+46,position+46+nameSize));
  const lower=filename.toLowerCase();
  expect(NAMES.includes(filename)&&!seen.has(lower),"неожиданный или повторяющийся файл");
  seen.add(lower);total+=expanded;
  expect(total<=IWXA_MAX_BYTES&&expanded<=IWXA_MAX_BYTES,"слишком большие данные");
  position=end;
 }
 expect(position===start+size&&seen.size===NAMES.length,"неполный ZIP");
}
export async function buildIwxaPortfolio(raw,{now=new Date().toISOString()}={}){
 const snapshot=deserialize(serialize(raw));
 expect(validDateTime(now),"неверная дата");
 const workspaceId="iwxa:atlas:portfolio:local",model={snapshot};
 const schema=schemaDefinition();
 const schemeRecord={schema_id:IWXA_PROFILE,schema_version:IWXA_PROFILE_VERSION,
  preserve_unknown:false,canonical_sha256:await digestObject(schema),json_schema:schema,embedded:{}};
 const ws={workspace_id:workspaceId,profile:IWXA_PROFILE,capabilities:["portfolio"],
  read_only:false,created_at:now,updated_at:now};
 const obj={object_id:"portfolio",workspace_id:workspaceId,
  schema_id:IWXA_PROFILE,schema_version:IWXA_PROFILE_VERSION,
  created_by_service:"iwxa.atlas",updated_by_service:"iwxa.atlas",
  // Atlas's first local snapshot has revision 0, but T2 Object 1.3.0
  // requires envelope revision >= 1. Keep the original project revision
  // unchanged inside data.snapshot; the carrier has its own revision.
  created_at:now,updated_at:now,revision:Math.max(1,snapshot.revision),data:model,extensions:{}};
 const contents={
  [CONTENT]:strToU8(line(obj)),[WORKSPACES]:strToU8(line(ws)),
  [SCHEMA]:strToU8(JSON.stringify(schemeRecord,null,2)+"\n")
 };
 const files=[];
 for(const path of PATHS){const data=contents[path];files.push({path,size:data.length,sha256:await digest(data)})}
 const packageDigest=await digest(files.map(f=>f.path+"\t"+f.sha256+"\n").join(""));
 const manifest={format:PACKAGE,format_version:VERSION,encryption:"none",created_at:now,
  workspaces:[workspaceId],workspace_states:[{workspace_id:workspaceId,updated_at:now}],
  options:{include_history:false,include_assets:false,include_relations:false,include_schemas:true},
  counts:{workspaces:1,objects:1,events:0,relations:0,assets:0,schemas:1},
  files,package_digest:packageDigest,semantic_digest:await digestObject(model)};
 const archive=zipSync({"manifest.json":strToU8(JSON.stringify(manifest,null,2)+"\n"),...contents},{level:0});
 expect(archive.length<=IWXA_MAX_BYTES,"архив превышает 32 МБ");
 const verified=await readIwxaPortfolio(archive);
 expect(serialize(verified.snapshot)===serialize(snapshot),"самопроверка архива не пройдена");
 return archive;
}
export async function readIwxaPortfolio(bytes){
 preflightZip(bytes);
 let entries;try{entries=unzipSync(bytes)}catch{fail("повреждённый ZIP")}
 expect(Object.keys(entries).length===NAMES.length&&NAMES.every(p=>entries[p] instanceof Uint8Array),
  "состав архива не совпадает");
 let manifest;try{manifest=JSON.parse(strFromU8(entries["manifest.json"]))}catch{fail("неверный манифест")}
 expect(manifest?.format===PACKAGE&&manifest.format_version===VERSION&&manifest.encryption==="none",
  "неподдерживаемый формат");
 expect(Array.isArray(manifest.files)&&manifest.files.length===PATHS.length,"неверный перечень файлов");
 const lines=[];
 for(let i=0;i<PATHS.length;i++){
  const row=manifest.files[i],path=PATHS[i],content=entries[path];
  expect(row?.path===path&&row.size===content.length&&validSha(row.sha256),"неверные данные файла");
  expect(await digest(content)===row.sha256,"контрольная сумма файла не совпадает");
  lines.push(path+"\t"+row.sha256+"\n");
 }
 expect(validSha(manifest.package_digest)&&await digest(lines.join(""))===manifest.package_digest,
  "контрольная сумма пакета не совпадает");
 const obj=parseLine(entries[CONTENT],"объект"),ws=parseLine(entries[WORKSPACES],"рабочая область");
 let scheme;try{scheme=JSON.parse(strFromU8(entries[SCHEMA]))}catch{fail("неверная схема данных")}
 expect(scheme.schema_id===IWXA_PROFILE&&scheme.schema_version===IWXA_PROFILE_VERSION&&
  scheme.preserve_unknown===false&&Object.keys(scheme.embedded||{}).length===0&&
  await digestObject(scheme.json_schema)===scheme.canonical_sha256&&
  await digestObject(scheme.json_schema)===await digestObject(schemaDefinition()),
  "неверная схема данных");
 expect(obj?.schema_id===IWXA_PROFILE&&obj.schema_version===IWXA_PROFILE_VERSION&&
  obj.object_id==="portfolio"&&obj.workspace_id===ws.workspace_id&&
  ws.profile===IWXA_PROFILE&&Array.isArray(manifest.workspaces)&&
  manifest.workspaces.length===1&&manifest.workspaces[0]===ws.workspace_id,
  "профиль Atlas не поддерживается");
 // Existing 0.5 dev packages may carry object revision 0 for an empty
 // portfolio. Read that one historical shape, but never export it again.
 const legacyEmptyRevision=obj.revision===0&&obj.data?.snapshot?.revision===0;
 expect(Number.isSafeInteger(obj.revision)&&(obj.revision>=1||legacyEmptyRevision)&&
  validDateTime(obj.created_at)&&validDateTime(obj.updated_at)&&
  validDateTime(ws.created_at)&&validDateTime(ws.updated_at)&&
  typeof obj.created_by_service==="string"&&!!obj.created_by_service&&
  typeof obj.updated_by_service==="string"&&!!obj.updated_by_service&&
  validDateTime(manifest.created_at),
  "недопустимая редакция или дата объекта");
 expect(manifest.workspace_states?.length===1&&
  manifest.workspace_states[0]?.workspace_id===ws.workspace_id&&
  JSON.stringify(manifest.counts)===JSON.stringify({workspaces:1,objects:1,events:0,relations:0,assets:0,schemas:1})&&
  manifest.options?.include_schemas===true&&manifest.options?.include_assets===false&&
  manifest.options?.include_relations===false&&manifest.options?.include_history===false,
  "состав портфеля не подтверждён");
 expect(obj.data?.snapshot&&validSha(manifest.semantic_digest)&&
  await digestObject(obj.data)===manifest.semantic_digest,"целостность данных не подтверждена");
 let snapshot;try{snapshot=deserialize(JSON.stringify(obj.data.snapshot))}catch{fail("портфель Atlas повреждён")}
 return {snapshot,manifest,profile:IWXA_PROFILE,profileVersion:IWXA_PROFILE_VERSION,
  adoption:IWXA_ADOPTION};
}
export function toBase64(bytes){
 let binary="";for(let i=0;i<bytes.length;i+=16384)
  binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(binary);
}
export function fromBase64(text){
 if(typeof text!=="string"||text.length>IWXA_MAX_BYTES*2||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))
  fail("ошибка чтения файла");
 let raw;try{raw=atob(text)}catch{fail("неверные данные файла")}
 const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return bytes;
}
