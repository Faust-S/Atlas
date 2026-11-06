import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL(path,import.meta.url));
const svg=read("../desktop/public/atlas-mark.svg").toString("utf8");
const ui=read("../desktop/src/main.tsx").toString("utf8");
const styles=read("../desktop/src/style.css").toString("utf8");
const html=read("../desktop/index.html").toString("utf8");
const ico=read("../desktop/src-tauri/icons/icon.ico");
const gitBlobSha=(value)=>{
 const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);
 return createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
};

test("SVG is byte-identical to Agent branding except green replaced by blue",()=>{
 const restored=svg.replace("#3F96ED","#B6F24B");
 assert.equal(gitBlobSha(restored),"9a331ea8bb87e99a59f8716500540dd1e093905d");
 assert.equal((svg.match(/#3F96ED/g)||[]).length,1);
 assert.equal((ui.match(/src=\{logoUrl\}/g)||[]).length,2);
 assert.match(ui,/src=\{this\.props\.logoUrl\?\?"\/atlas-mark\.svg"\}/);
 assert.match(ui,/host\?\.assetUrl\?\?"\/atlas-mark\.svg"/);
 assert.doesNotMatch(ui,/<span className="logo-symbol">A<\/span>/);
 assert.match(styles,/\.logo-symbol\{display:block;width:44px/);
 assert.match(html,/rel="icon" type="image\/svg\+xml" href="\/atlas-mark\.svg"/);
});

test("Windows ICO is exact Agent icon with only background RGB recolored",()=>{
 assert.equal(ico.length,16958);
 assert.equal(ico.readUInt16LE(0),0);
 assert.equal(ico.readUInt16LE(2),1);
 assert.equal(ico.readUInt16LE(4),1);
 assert.equal(ico[6],64);
 assert.equal(ico[7],64);
 const offset=ico.readUInt32LE(18);
 assert.equal(offset,22);
 assert.equal(ico.readUInt32LE(offset),40);
 assert.equal(ico.readUInt16LE(offset+14),32);
 const restored=Buffer.from(ico);
 let blue=0,black=0,transparent=0;
 for(let n=0;n<4096;n++){
  const i=offset+40+n*4;
  const [b,g,r,a]=[ico[i],ico[i+1],ico[i+2],ico[i+3]];
  if(r===63&&g===150&&b===237&&a===255){
   restored[i]=75;restored[i+1]=242;restored[i+2]=182;blue++;
  }else if(r===5&&g===7&&b===13&&a===255)black++;
  else if(r===0&&g===0&&b===0&&a===0)transparent++;
  else assert.fail("Unexpected Atlas pixel at "+n+": "+[r,g,b,a].join(","));
 }
 assert.deepEqual({blue,black,transparent},{blue:3106,black:866,transparent:124});
 assert.equal(gitBlobSha(restored),"31fc05cae8a4cc69ccadcbc3dba31c85a3f9b709");
});

test("0.3 development identity is distinct from published 0.2.0",()=>{
 const pkg=JSON.parse(read("../desktop/package.json"));
 const lock=JSON.parse(read("../desktop/package-lock.json"));
 const conf=JSON.parse(read("../desktop/src-tauri/tauri.conf.json"));
 const cargo=read("../desktop/src-tauri/Cargo.toml").toString("utf8");
 const cargoLock=read("../desktop/src-tauri/Cargo.lock").toString("utf8");
 assert.equal(pkg.version,"0.3.0-dev.1");
 assert.equal(lock.version,"0.3.0-dev.1");
 assert.equal(lock.packages[""].version,"0.3.0-dev.1");
 assert.equal(conf.version,"0.3.0-dev.1");
 assert.match(cargo,/name = "iwxa-atlas-desktop"\nversion = "0.3.0-dev.1"/);
 assert.match(cargoLock,/name = "iwxa-atlas-desktop"\nversion = "0.3.0-dev.1"/);
});
