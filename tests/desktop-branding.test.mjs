import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL(path,import.meta.url));
const svg=read("../desktop/public/atlas-mark.svg").toString("utf8");
const ui=read("../desktop/src/main.tsx").toString("utf8");
const styles=read("../desktop/src/style.css").toString("utf8");
const html=read("../desktop/index.html").toString("utf8");
const ico=read("../desktop/src-tauri/icons/icon.ico");

test("Atlas patch reuses the Agent IWXA monogram with a blue background",()=>{
 assert.match(svg,/fill="#3F96ED"/);
 assert.match(svg,/x="13" y="13" width="7" height="38"/);
 assert.match(svg,/M29 14 L51 50 M51 14 L29 50/);
 assert.equal((ui.match(/src="\/atlas-mark\.svg"/g)||[]).length,3);
 assert.doesNotMatch(ui,/<span className="logo-symbol">A<\/span>/);
 assert.match(styles,/\.logo-symbol\{display:block;width:44px/);
 assert.match(html,/rel="icon" type="image\/svg\+xml" href="\/atlas-mark\.svg"/);
});

test("Windows icon is valid multiresolution ICO with blue Atlas identity",()=>{
 assert.equal(ico.readUInt16LE(0),0);
 assert.equal(ico.readUInt16LE(2),1);
 const count=ico.readUInt16LE(4);
 assert.equal(count,6);
 const sizes=[];
 for(let i=0;i<count;i++){
  const e=6+i*16,size=ico[e]||256,bytes=ico.readUInt32LE(e+8),offset=ico.readUInt32LE(e+12);
  sizes.push(size);
  assert.ok(offset+bytes<=ico.length);
  assert.equal(ico.readUInt32LE(offset),40);
  assert.equal(ico.readUInt32LE(offset+4),size);
  assert.equal(ico.readUInt32LE(offset+8),size*2);
  assert.equal(ico.readUInt16LE(offset+14),32);
  if(size===64){
   const x=23,y=32,pixel=offset+40+((size-1-y)*size+x)*4;
   assert.deepEqual([...ico.subarray(pixel,pixel+4)],[237,150,63,255]);
  }
 }
 assert.deepEqual(sizes,[16,24,32,48,64,128]);
});

test("candidate identity uses 0.2.1 without mutating tagged 0.2.0",()=>{
 const pkg=JSON.parse(read("../desktop/package.json"));
 const lock=JSON.parse(read("../desktop/package-lock.json"));
 const conf=JSON.parse(read("../desktop/src-tauri/tauri.conf.json"));
 const cargo=read("../desktop/src-tauri/Cargo.toml").toString("utf8");
 const cargoLock=read("../desktop/src-tauri/Cargo.lock").toString("utf8");
 assert.equal(pkg.version,"0.2.1");
 assert.equal(lock.version,"0.2.1");
 assert.equal(lock.packages[""].version,"0.2.1");
 assert.equal(conf.version,"0.2.1");
 assert.match(cargo,/name = "iwxa-atlas-desktop"\nversion = "0.2.1"/);
 assert.match(cargoLock,/name = "iwxa-atlas-desktop"\nversion = "0.2.1"/);
});
