import assert from 'node:assert/strict';
import { test,after } from 'node:test';
import { mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,mkdirSync,statSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { browserHarness } from './runtime.mjs';
import { openBrowser } from '../skills/dsh-ui-deai/scripts/browser-kit.mjs';
import { capture } from '../skills/dsh-ui-deai/scripts/snapshot.mjs';
import { readStoryboard,renderStory } from '../skills/dsh-ui-deai/scripts/story.mjs';
const temp=mkdtempSync(join(tmpdir(),'ui-deai-browser-'));process.env.DSH_HOME=temp;
const {makeApiHandler,runAudit,definitions}=await import('../lib/index.js');
const {readState}=await import('../lib/engine/state.js');
runAudit(resolve('test/fixtures/review-needed.html'));
const handler=makeApiHandler();
const server=createServer((req,res)=>{
  if(req.url.startsWith('/dsh-ui-deai/api/'))return handler(req,res);
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  if(req.url.startsWith('/fixture'))return res.end(readFileSync('test/fixtures/review-clear.html'));
  return res.end(browserHarness(readState(),{settings:req.url.startsWith('/settings')}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
after(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));if(temp.startsWith(join(tmpdir(),'ui-deai-browser-')))rmSync(temp,{recursive:true,force:true});});
test('real browser renders populated panel, toggles progress and switches targets',async()=>{
  browser=await openBrowser();const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  await page.getByRole('dialog').waitFor();await page.getByText('文案使用泛化承诺',{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'进度',exact:true}).click();await page.getByRole('button',{name:'待处理',exact:true}).first().click();
  await page.getByRole('button',{name:'已完成',exact:true}).waitFor();
  await page.getByRole('textbox',{name:'要审查的源码路径'}).fill(resolve('test/fixtures/review-clear.html'));
  await page.getByRole('button',{name:'扫描',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.dea-score')?.textContent==='100');
  assert.equal(await page.getByRole('button',{name:'已完成',exact:true}).count(),0);
  await page.getByRole('button',{name:'问题',exact:true}).click();await page.getByText('未触发规则。请继续检查实际界面。',{exact:true}).waitFor();
  mkdirSync('.preview',{recursive:true});await page.screenshot({path:'.preview/panel.png'});
  await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'.preview/panel-mobile.png'});await page.goto(base+'/settings');await page.getByRole('heading',{name:'设计方向'}).waitFor();
  assert.deepEqual(errors,[]);await page.close();
});
test('snapshot writes a reopenable HTML file and a PNG from a live page',async()=>{
  const out=join(temp,'capture.html');const result=await capture({url:base+'/fixture',out,width:800,height:600});
  assert.ok(existsSync(out));assert.ok(statSync(result.screenshot).size>1000);assert.ok(readFileSync(out,'utf8').includes('本周任务'));
  const page=await browser.newPage({viewport:{width:800,height:600}});await page.goto(new URL('file:///'+out.replaceAll('\\','/')).href);await page.getByRole('heading',{name:'本周任务',exact:true}).waitFor();await page.close();
});
test('snapshot tool records both before and after through its child-process runner',async()=>{
  const tool=definitions().find(t=>t.name==='ui_deai_snapshot');
  for(const phase of ['before','after']) {
    const result=await tool.execute({url:base+'/fixture',out:join(temp,`${phase}.html`),phase,width:800,height:600});
    assert.equal(result.ok,true,result.markdown);assert.equal(result.data.attached,true);assert.equal(readState().artifacts[phase].length,1);
  }
});
test('storyboard validates duration and resolves stage files',()=>{
  const path=join(temp,'story.json');writeFileSync(path,JSON.stringify({steps:[{file:'capture.html',duration:1},{file:'capture.html',duration:1}]}));
  assert.equal(readStoryboard(path).steps.length,2);writeFileSync(join(temp,'invalid.json'),JSON.stringify({steps:[{file:'capture.html',duration:-1},{file:'capture.html'}]}));
  assert.throws(()=>readStoryboard(join(temp,'invalid.json')),/时长/);
});
const ffmpeg=spawnSync(process.env.UI_DEAI_FFMPEG_PATH||'ffmpeg',['-version'],{windowsHide:true,stdio:'ignore'});
test('video rendering produces an MP4 from two stages',{skip:ffmpeg.status!==0?'ffmpeg is not installed':false},async()=>{
  const out=join(temp,'story.mp4');const result=await renderStory(join(temp,'story.json'),out);assert.equal(result.stages,2);assert.ok(statSync(out).size>1000);
});
