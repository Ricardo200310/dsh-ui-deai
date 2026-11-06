import assert from 'node:assert/strict';
import { test,after } from 'node:test';
import { mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { createServer } from 'node:http';
const home=mkdtempSync(join(tmpdir(),'ui-deai-host-'));process.env.DSH_HOME=home;
const {apply,runAudit}=await import('../lib/index.js');
const {readState,updateState,artifactDir,clearState}=await import('../lib/engine/state.js');
const tools=new Map(),commands=new Map();let skill,route;
apply({get(name){return {tools:{register:d=>{tools.set(d.name,d);return()=>{};}},commands:{register:d=>{commands.set(d.name,d);return()=>{};}},skills:{register:d=>{skill=d;return()=>{};}},webServer:{register:d=>{route=d;return()=>{};}}}[name];},effect:fn=>fn()});
const server=createServer(route.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/dsh-ui-deai/api`;
const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
after(async()=>{await new Promise(resolve=>server.close(resolve));if(home.startsWith(join(tmpdir(),'ui-deai-host-')))rmSync(home,{recursive:true,force:true});});
test('registers the named skill, five tools, command and HTTP route',()=>{
  assert.equal(skill.name,'dsh-ui-deai');assert.ok(!skill.content.includes('{{SKILL_DIR}}'));assert.equal(tools.size,5);assert.ok(commands.has('dsh-ui-deai'));assert.equal(route.path,'/dsh-ui-deai/api');
});
test('tools persist direction and pass progress, failed audits preserve state',async()=>{
  const audit=await tools.get('ui_deai_audit').execute({path:resolve('test/fixtures/review-needed.html')});assert.equal(audit.ok,true);
  const direction=await tools.get('ui_deai_direction').execute({task:'查找待处理项目',keep:['现有品牌']});assert.equal(direction.data.task,'查找待处理项目');
  await tools.get('ui_deai_pass').execute({pass:'content',status:'done',note:'已复核'});
  const before=readState();runAudit(join(home,'missing'));assert.deepEqual(readState(),before);
  runAudit(resolve('test/fixtures/review-needed.html'));assert.equal(readState().passes.find(p=>p.id==='content').status,'done');
});
test('different files in the same directory reset progress, direction and artifacts',()=>{
  updateState({artifacts:{before:['old.png'],after:[],story:null}});runAudit(resolve('test/fixtures/review-clear.html'));
  const s=readState();assert.ok(s.passes.every(p=>p.status==='open'));assert.equal(s.direction.draft,true);assert.deepEqual(s.artifacts.before,[]);
});
test('HTTP re-audit retains the selected file rather than scanning its whole parent',async()=>{
  const response=await post('/audit',{});assert.equal(response.status,200);const value=await response.json();assert.equal(value.data.files,1);assert.equal(value.data.target,resolve('test/fixtures/review-clear.html'));
});
test('HTTP rejects malformed JSON and invalid pass state',async()=>{
  const bad=await fetch(base+'/audit',{method:'POST',body:'{'});assert.equal(bad.status,400);
  assert.equal((await post('/pass',{pass:'content',status:'bogus'})).status,400);
  assert.equal((await post('/pass',{pass:'unknown',status:'done'})).status,400);
});
test('artifact byte ranges implement suffix, prefix and unsatisfiable requests',async()=>{
  writeFileSync(join(artifactDir(),'test.mp4'),'0123456789');
  for(const [range,expected] of [['bytes=0-2','012'],['bytes=-3','789'],['bytes=7-','789']]){const r=await fetch(base+'/artifact/test.mp4',{headers:{range}});assert.equal(r.status,206);assert.equal(await r.text(),expected);}
  const r=await fetch(base+'/artifact/test.mp4',{headers:{range:'bytes=99-100'}});assert.equal(r.status,416);
});
test('snapshot before and after are supported, invalid media inputs fail before spawning',async()=>{
  assert.deepEqual(tools.get('ui_deai_snapshot').parameters.properties.phase.enum,['before','after']);
  await assert.rejects(()=>tools.get('ui_deai_snapshot').execute({url:'file:///private',out:'a.html'}),/HTTP/);
  await assert.rejects(()=>tools.get('ui_deai_story').execute({file:'x.json',out:'x.txt'}),/mp4/);
});
test('command uses the same state and clear resets it',async()=>{
  const result=commands.get('dsh-ui-deai').handler({rawInput:'"'+resolve('test/fixtures/review-clear.html')+'"'});assert.equal(result.kind,'success');
  assert.equal((await post('/clear',{})).status,200);assert.equal(readState().audit,null);assert.equal((await post('/audit',{})).status,400);
});
