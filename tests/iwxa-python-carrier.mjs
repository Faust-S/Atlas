// Independent Python ZIP/JSON reader for Atlas's existing IWXA 1.0 envelope.
// This proves real cross-language carrier compatibility, not normative profile adoption.
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {createProject,empty} from "../src/core.mjs";
import {buildIwxaPortfolio} from "../desktop/src/iwxa-portfolio.mjs";
const snapshot=createProject(empty(),{name:"Работы и наблюдения Ω"}).state;
const bytes=await buildIwxaPortfolio(snapshot,{now:"2026-11-09T10:00:00.000Z"});
const dir=mkdtempSync(join(tmpdir(),"iwxa-carrier-")),target=join(dir,"atlas.iwxa");
const python=String.raw`
import hashlib,json,sys,zipfile
path=sys.argv[1]
canon=lambda obj:json.dumps(obj,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode('utf-8')
sha=lambda data:hashlib.sha256(data).hexdigest()
with zipfile.ZipFile(path) as z:
    names=z.namelist()
    expected=['manifest.json','content/objects.ndjson','content/workspaces.ndjson',
              'schemas/iwxa.atlas.portfolio@1.0.0.json']
    assert sorted(names)==sorted(expected),names
    assert all(info.compress_type==zipfile.ZIP_STORED for info in z.infolist())
    manifest=json.loads(z.read('manifest.json'))
    assert manifest['format']=='iwxa.package'
    assert manifest['format_version']=='1.0'
    assert manifest['encryption']=='none'
    files=manifest['files']
    assert [row['path'] for row in files]==sorted(expected[1:])
    checks=[]
    for row in files:
        data=z.read(row['path'])
        assert row['size']==len(data)
        assert row['sha256']==sha(data)
        checks.append(row['path']+'\t'+row['sha256']+'\n')
    assert manifest['package_digest']==sha(''.join(checks).encode('utf-8'))
    obj=json.loads(z.read('content/objects.ndjson'))
    ws=json.loads(z.read('content/workspaces.ndjson'))
    schema=json.loads(z.read('schemas/iwxa.atlas.portfolio@1.0.0.json'))
    assert obj['schema_id']=='iwxa.atlas.portfolio'
    assert obj['workspace_id']==ws['workspace_id']==manifest['workspaces'][0]
    assert obj['data']['snapshot']['schema']=='atlas.project/1'
    assert obj['data']['snapshot']['projects'][0]['name']=='Работы и наблюдения Ω'
    assert manifest['semantic_digest']==sha(canon(obj['data']))
    assert schema['canonical_sha256']==sha(canon(schema['json_schema']))
    assert manifest['counts']==dict(workspaces=1,objects=1,events=0,relations=0,assets=0,schemas=1)
    print('ATLAS05_IWXA_T2_CARRIER_PASS bytes='+str(len(open(path,'rb').read())))
`;
try{
 writeFileSync(target,bytes,{flag:"wx"});
 const completed=spawnSync("python3",["-c",python,target],{encoding:"utf8",maxBuffer:1024*1024});
 if(completed.status!==0)throw Error("Cross-language IWXA failed: "+completed.stderr+completed.stdout);
 process.stdout.write(completed.stdout);
}finally{rmSync(dir,{recursive:true,force:true})}
