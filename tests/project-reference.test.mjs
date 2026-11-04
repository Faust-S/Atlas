import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,createProject,createItem,editItem,serialize,deserialize} from '../src/core.mjs';
import {projectReference,workReference,observeProjectReference,observeWorkReference,
  requireCurrentWorkReference,personalWorkProjection} from '../src/project-reference.mjs';

function portfolio(){
 const p=createProject(empty(),{name:'Contract',type:'business',owner:'private owner'});
 const a=createItem(p.state,p.id,{title:'Assigned work'});
 const b=createItem(a.state,p.id,{title:'Second work'});
 return {projectId:p.id,a:a.id,b:b.id,snapshot:b.state};
}
test('project/work identity points to canonical global revision and survives JSON reopen',()=>{
 const fixture=portfolio(),s=fixture.snapshot,workRef=workReference(s,fixture.projectId,fixture.a);
 assert.deepEqual(workRef,{projectId:fixture.projectId,workId:fixture.a,revision:String(s.revision)});
 assert.deepEqual(projectReference(s,fixture.projectId),{projectId:fixture.projectId,revision:String(s.revision)});
 const reopened=deserialize(serialize(s));
 assert.equal(observeProjectReference(reopened,projectReference(s,fixture.projectId)),'SOURCE_REVISION_MATCHES');
 assert.equal(observeWorkReference(reopened,workRef),'SOURCE_REVISION_MATCHES');
 assert.equal(requireCurrentWorkReference(reopened,workRef).work.id,fixture.a);
});
test('a newer portfolio revision refuses stale references even when work id remains',()=>{
 const f=portfolio(),ref=workReference(f.snapshot,f.projectId,f.a);
 const changed=editItem(f.snapshot,f.projectId,f.b,{state:'done'});
 assert.equal(observeWorkReference(changed,ref),'SOURCE_REVISION_CHANGED');
 assert.throws(()=>requireCurrentWorkReference(changed,ref),/ATLAS_SOURCE_REVISION_CHANGED/);
 assert.equal(changed.projects[0].items[0].id,f.a);
 assert.equal(observeWorkReference(changed,workReference(changed,f.projectId,f.a)),'SOURCE_REVISION_MATCHES');
});
test('unknown project/work and malformed ref never become an operation authorization',()=>{
 const f=portfolio(),s=f.snapshot,ref=workReference(s,f.projectId,f.a);
 assert.equal(observeProjectReference(s,{...ref,projectId:'unknown'}),'PROJECT_MISSING_IN_SOURCE');
 assert.equal(observeWorkReference(s,{...ref,workId:'unknown'}),'WORK_MISSING_IN_SOURCE');
 assert.equal(observeWorkReference(s,{...ref,revision:'invalid'}),'REFERENCE_INVALID');
 assert.equal(observeWorkReference(null,ref),'NOT_OBSERVED');
 assert.equal(observeWorkReference(s,{projectId:f.projectId,revision:ref.revision}),'WORK_NOT_LINKED');
 assert.throws(()=>requireCurrentWorkReference(s,{...ref,workId:f.b+'-wrong'}),/ATLAS_WORK_NOT_IN_SOURCE/);
 assert.throws(()=>workReference(s,'absent',f.a),/ATLAS_PROJECT_NOT_IN_SOURCE/);
 const invalid=structuredClone(s);invalid.projects[0].items.push({...invalid.projects[0].items[0]});
 assert.throws(()=>requireCurrentWorkReference(invalid,ref),/Duplicate ID/);
});
test('personal projection requires host decision and never exposes portfolio secrets',()=>{
 const f=portfolio(),ref=workReference(f.snapshot,f.projectId,f.a);
 assert.throws(()=>personalWorkProjection(f.snapshot,ref),/ATLAS_HOST_AUTHORIZATION_REQUIRED/);
 assert.throws(()=>personalWorkProjection(f.snapshot,ref,{hostAuthorized:'yes'}),/ATLAS_HOST_AUTHORIZATION_REQUIRED/);
 const value=personalWorkProjection(f.snapshot,ref,{hostAuthorized:true});
 assert.deepEqual(Object.keys(value),['source','projectId','workId','revision','work','writeAuthority']);
 assert.equal(value.work.id,f.a);
 assert.equal(value.writeAuthority,false);
 assert.equal(JSON.stringify(value).includes('private owner'),false);
 assert.equal(JSON.stringify(value).includes('Second work'),false);
 assert.throws(()=>personalWorkProjection(editItem(f.snapshot,f.projectId,f.a,{state:'done'}),ref,{hostAuthorized:true}),/ATLAS_SOURCE_REVISION_CHANGED/);
});
