import {validate} from './core.mjs';

// Read-only references into the existing Atlas portfolio. No store or operation authority.
const validId = value => typeof value === 'string' && value.length > 0;
const sameRevision = (left,right) =>
  (typeof right === 'string' || Number.isSafeInteger(right)) &&
  String(left) === String(right);
const fail = code => {throw Object.assign(new Error(code),{code});};

export function projectReference(snapshot,projectId) {
  validate(snapshot);
  const project=snapshot.projects.find(row=>row.id===projectId);
  if(!project)fail('ATLAS_PROJECT_NOT_IN_SOURCE');
  return {projectId:project.id,revision:String(snapshot.revision)};
}

export function workReference(snapshot,projectId,workId) {
  const ref=projectReference(snapshot,projectId);
  const project=snapshot.projects.find(row=>row.id===projectId);
  if(!project.items.some(row=>row.id===workId))fail('ATLAS_WORK_NOT_IN_SOURCE');
  return {...ref,workId};
}

export function observeProjectReference(snapshot,ref) {
  if(snapshot==null)return 'NOT_OBSERVED';
  validate(snapshot);
  if(!validId(ref?.projectId) || !sameRevision(snapshot.revision,ref.revision) &&
     (typeof ref?.revision!=='string' || !/^(0|[1-9][0-9]*)$/.test(ref.revision)))
    return 'REFERENCE_INVALID';
  if(!snapshot.projects.some(row=>row.id===ref.projectId))
    return 'PROJECT_MISSING_IN_SOURCE';
  return sameRevision(snapshot.revision,ref.revision)
    ? 'SOURCE_REVISION_MATCHES':'SOURCE_REVISION_CHANGED';
}

export function observeWorkReference(snapshot,ref) {
  if(!validId(ref?.workId))return 'WORK_NOT_LINKED';
  const state=observeProjectReference(snapshot,ref);
  if(state==='NOT_OBSERVED'||state==='REFERENCE_INVALID'||state==='PROJECT_MISSING_IN_SOURCE')
    return state;
  const project=snapshot.projects.find(row=>row.id===ref.projectId);
  if(!project.items.some(row=>row.id===ref.workId))return 'WORK_MISSING_IN_SOURCE';
  return state;
}

// This is the only strict read of a work reference; caller must use a freshly
// opened canonical snapshot and its own authorization before any corporate act.
export function requireCurrentWorkReference(snapshot,ref) {
  validate(snapshot);
  if(!validId(ref?.projectId)||!validId(ref?.workId)||
     typeof ref?.revision!=='string'||!/^(0|[1-9][0-9]*)$/.test(ref.revision))
    fail('ATLAS_WORK_REFERENCE_INVALID');
  if(!sameRevision(snapshot.revision,ref.revision))fail('ATLAS_SOURCE_REVISION_CHANGED');
  const project=snapshot.projects.find(row=>row.id===ref.projectId);
  if(!project)fail('ATLAS_PROJECT_NOT_IN_SOURCE');
  const work=project.items.find(row=>row.id===ref.workId);
  if(!work)fail('ATLAS_WORK_NOT_IN_SOURCE');
  return {projectId:project.id,workId:work.id,revision:String(snapshot.revision),
    work:{id:work.id,title:work.title,state:work.state,priority:work.priority,
      dueDate:work.dueDate??null}};
}

// A host explicitly asserts its access decision. This function never grants
// access or exposes the project owner's private portfolio and decision history.
export function personalWorkProjection(snapshot,ref,{hostAuthorized=false}={}) {
  if(hostAuthorized!==true)fail('ATLAS_HOST_AUTHORIZATION_REQUIRED');
  const resolved=requireCurrentWorkReference(snapshot,ref);
  return {source:'atlas.project/1',projectId:resolved.projectId,
    workId:resolved.workId,revision:resolved.revision,work:resolved.work,
    writeAuthority:false};
}
