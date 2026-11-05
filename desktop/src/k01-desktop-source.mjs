// Atlas 0.3 optional K01 desktop consumer. Public GitHub read-only sources.
// Canonical Atlas persistence and permissions remain the host's responsibility.
import {selectContext,revalidateProjection} from '@iwxa/k01-context';
import {atlasProjectSourceRef} from '@iwxa/k01-context/atlas-project-source';
import {createAtlasPublicRepoObservationPort} from '@iwxa/k01-context/atlas-public-source';
import {observePublicRepo} from '../../src/github-public.mjs';
import {createAtlasK01ContextHost} from '../../src/k01-context-host.mjs';

const valid = s => typeof s==='string' && s.trim()===s && s.length>0 && s.length<=160 && !/[\x00-\x1f]/.test(s);
const commit=/^[a-f0-9]{40}$/i;
const filePath = path => {
  if(!valid(path)||path.startsWith('/')||path.split('/').some(s=>!s||s==='.'||s==='..'||/[?#\\%]/.test(s)))
    throw Error('K01: укажите путь к публичному файлу внутри репозитория.');
  return path;
};
const safePhrase = text => {
  if(!valid(text)||text.length>100)throw Error('K01: задайте короткую точную фразу для поиска.');
  return text;
};
async function githubLine({repository,revision,path,phrase,fetcher}){
  if(!commit.test(revision))throw Error('K01: редакция GitHub не подтверждена.');
  const route=path.split('/').map(encodeURIComponent).join('/');
  const url='https://api.github.com/repos/'+repository+'/contents/'+route+'?ref='+revision;
  const response=await fetcher(url,{headers:{Accept:'application/vnd.github+json'}});
  if(!response?.ok)throw Error('K01: GitHub-файл недоступен или чтение не разрешено.');
  const file=await response.json();
  if(file?.type!=='file'||file.encoding!=='base64'||typeof file.content!=='string'||
     file.content.length>350000)throw Error('K01: поддерживается только небольшой текстовый GitHub-файл.');
  let bytes;
  try {
    const data=atob(file.content.replace(/\s/g,''));
    bytes=Uint8Array.from(data,c=>c.charCodeAt(0));
  }catch{throw Error('K01: неверное кодирование GitHub-файла.');}
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{throw Error('K01: источник не является UTF-8 текстом.');}
  const lines=text.split(/\r?\n/);
  const hits=lines.map((line,i)=>({line,index:i+1})).filter(x=>x.line.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()));
  if(hits.length!==1 || !hits[0].line.trim())
    throw Error('K01: требуется ровно одна строка с искомой фразой; уточните запрос.');
  return {observedRevision:revision,excerpt:hits[0].line,evidenceRef:'line:'+hits[0].index};
}

export function createAtlasK01DesktopService({
  openSavedSnapshot,authorize,fetcher=globalThis.fetch
}={}){
  if(typeof openSavedSnapshot!=='function'||typeof authorize!=='function'||typeof fetcher!=='function')
    throw Error('K01: необходимы штатные порты Atlas и публичного GitHub.');
  const k01={selectContext,revalidateProjection,atlasProjectSourceRef};
  const makeHost=({branch,path,phrase,pinnedRevision})=>createAtlasK01ContextHost({
    k01,openSavedSnapshot,authorize,
    observationPort:async ({source,sourceRef})=>{
      // Atlas host validates persisted ProjectRef, source identity, authority
      // and current native generation before and after every K01 invocation.
      // Repeating that read inside the source adapter can suppress otherwise
      // valid candidates. Keep K01 focused on public source revision/evidence.
      if(source.kind!=='github'||source.summary?.complete!==true||
         !Object.hasOwn(source.summary.branchHeads??{},branch))
        throw Error('K01: выбранная ветка отсутствует в сохранённом источнике.');
      return createAtlasPublicRepoObservationPort({
        sourceRef,repository:source.locator,branch,
        pinnedItems:[{id:'file-line',type:'github-file',sourceRef,revision:pinnedRevision,
          epistemic:'observed',estimatedTokens:160,keywords:[phrase]}],
        observeRepository:async ({repository})=>observePublicRepo(repository,fetcher,{maxPages:10}),
        readEvidence:async ({repository,requestedRevision})=>
          githubLine({repository,revision:requestedRevision,path,phrase,fetcher})
      });
    }
  });
  return Object.freeze({
    async select({projectId,sourceId,branch,path,phrase,context}){
      path=filePath(path);phrase=safePhrase(phrase);
      if(!valid(branch))throw Error('K01: выберите ветку источника.');
      const snapshot=await openSavedSnapshot();
      const project=snapshot.projects?.find(p=>p.id===projectId);
      const source=project?.sources?.find(s=>s.id===sourceId);
      const pinnedRevision=source?.summary?.branchHeads?.[branch];
      if(source?.kind!=='github'||source.status!=='ok'||!commit.test(pinnedRevision??''))
        throw Error('K01: источник должен иметь сохранённую проверенную редакцию GitHub.');
      const ref={projectId,sourceId,revision:String(snapshot.revision)};
      // Task relevance is keyed by source capability; the user phrase is an
      // evidence-line locator, not a metadata search term. Bind it to profile
      // so a changed phrase cannot reuse an old projection on revalidation.
      const request={taskId:'atlas:k01:'+projectId+':'+sourceId,
        terms:['github-file'],profile:'github-file:'+path+':'+phrase,
        maxTokens:240,allowInferred:false};
      const host=makeHost({branch,path,phrase,pinnedRevision});
      const projection=await host.select(ref,context,request);
      if(projection.selected.length!==1)
        throw Error('K01: подтверждённое свидетельство не найдено ('+
          (projection.omissions[0]?.reason??'missing')+').');
      return {ref,request,branch,path,phrase,pinnedRevision,projection};
    },
    async revalidate(saved,{context}={}){
      if(!saved?.ref||!saved?.request||!commit.test(saved.pinnedRevision??''))
        throw Error('K01: отсутствует сохранённая проекция.');
      const host=makeHost(saved);
      return host.revalidate(saved.ref,context,saved.request,saved.projection);
    }
  });
}
