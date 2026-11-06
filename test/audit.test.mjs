import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { audit,auditText,RULES,PASSES } from '../lib/engine/audit.js';
const temp=mkdtempSync(join(tmpdir(),'ui-deai-audit-'));
after(()=>{if(temp.startsWith(join(tmpdir(),'ui-deai-audit-')))rmSync(temp,{recursive:true,force:true});});
const ids=text=>auditText(text,'page.html').map(f=>f.rule);
test('example reviews separate actionable findings from clear markup',()=>{
  const bad=audit('test/fixtures/review-needed.html'),good=audit('test/fixtures/review-clear.html');
  assert.equal(bad.ok,true);assert.ok(bad.score<good.score);assert.ok(bad.totalFindings>=8);assert.equal(good.score,100);assert.equal(good.totalFindings,0);
  assert.ok(bad.findings.every(f=>f.line>0&&f.column>0&&f.fix&&f.file==='review-needed.html'));
});
test('one normal weight and a single row height are not inconsistencies',()=>{assert.deepEqual(ids('<div class="font-normal h-[32px]">Task</div>'),[]);});
test('font weight aggregation counts distinct weights',()=>{
  assert.ok(ids('<div class="font-light font-normal font-medium font-semibold font-bold">Task</div>').includes('weight-fragmentation'));
  assert.deepEqual(ids('<div class="font-normal font-normal font-normal font-normal font-normal">Task</div>'),[]);
});
test('multiline controls are reviewed with their source location',()=>{
  const report=auditText('<main>\n<button\n class="icon">\n<svg></svg>\n</button>\n</main>','page.html');
  assert.equal(report.find(f=>f.rule==='unnamed-icon-control').line,2);
  assert.ok(!ids('<button aria-label="删除"><svg></svg></button>').includes('unnamed-icon-control'));
});
test('labels are associated with inputs, including wrapping labels',()=>{
  assert.ok(ids('<input placeholder="Name">').includes('unlabelled-input'));
  for(const text of ['<label for="name">Name</label><input id="name">','<label>Name<input></label>','<input aria-label="Name">','<input type="hidden">'])assert.ok(!ids(text).includes('unlabelled-input'));
});
test('comments do not contribute findings and decorative images may have empty alt',()=>{
  assert.deepEqual(ids('<!-- <img src="a"> -->\n<img src="b" alt="">\n<style>/* outline:none; */</style>'),[]);
});
test('reduced motion handling suppresses the continuous-animation reminder',()=>{
  assert.ok(ids('<style>.a{animation:fade 3s infinite}</style>').includes('continuous-animation'));
  assert.ok(!ids('<style>.a{animation:fade 3s infinite}@media(prefers-reduced-motion:reduce){.a{animation:none}}</style>').includes('continuous-animation'));
});
test('ignore file works on a folder that is not excluded by default',()=>{
  mkdirSync(join(temp,'samples'));writeFileSync(join(temp,'samples','ignored.html'),'<img>');writeFileSync(join(temp,'page.html'),'<p>Read</p>');
  writeFileSync(join(temp,'.ui-deai-ignore'),'samples/\n');assert.equal(audit(temp).files,1);
});
test('empty and missing paths do not receive a successful perfect score',()=>{
  const empty=join(temp,'empty');mkdirSync(empty);
  for(const target of [empty,join(temp,'absent')]){const r=audit(target);assert.equal(r.ok,false);assert.equal(r.grade,'unknown');assert.equal(r.score,0);}
});
test('audit identities preserve individual files within a directory',()=>{
  const a=audit('test/fixtures/review-clear.html'),b=audit('test/fixtures/review-needed.html');assert.equal(a.root,b.root);assert.notEqual(a.target,b.target);
});
test('scan limit is reported and oversized files are not counted as scanned',()=>{
  const folder=join(temp,'limits');mkdirSync(folder);writeFileSync(join(folder,'a.html'),'<p>A</p>');writeFileSync(join(folder,'b.html'),'<p>B</p>');
  assert.equal(audit(folder,{maxFiles:1}).truncated,true);
  writeFileSync(join(folder,'big.html'),' '.repeat(513*1024));const r=audit(folder);assert.equal(r.files,2);assert.equal(r.warnings.length,1);
});
test('rules have unique identifiers and valid categories',()=>{assert.equal(new Set(RULES.map(r=>r.id)).size,RULES.length);assert.ok(RULES.every(r=>PASSES.some(p=>p.id===r.pass)));});

