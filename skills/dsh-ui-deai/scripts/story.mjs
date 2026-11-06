/** Render a JSON list of review stages into a labelled MP4 presentation. */
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { openBrowser, viewport } from './browser-kit.mjs';
export function readStoryboard(file,wide=false) {
  const full=resolve(file),base=dirname(full),data=JSON.parse(readFileSync(full,'utf8'));
  if(!Array.isArray(data.steps)||data.steps.length<2||data.steps.length>12) throw new Error('阶段清单需要 2 至 12 个 steps');
  const size=viewport(wide?1920:(data.width??1080),wide?1080:(data.height??1080));
  const steps=data.steps.map((step,index)=>{
    if(typeof step.file!=='string'||!step.file) throw new Error(`阶段 ${index+1} 缺少 HTML 文件`);
    const path=resolve(base,step.file),duration=Number(step.duration??2);
    if(!/\.html?$/i.test(path)||!statSync(path).isFile()) throw new Error('每个阶段必须引用本地 HTML 文件');
    if(!Number.isFinite(duration)||duration<0.5||duration>15) throw new Error('每个阶段时长应为 0.5 至 15 秒');
    return {file:path,label:String(step.label??`阶段 ${index+1}`).slice(0,100),duration};
  });
  return {...size,steps};
}
export function encoder(args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.UI_DEAI_FFMPEG_PATH||'ffmpeg',args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
    let errors='';child.stderr.on('data',data=>{errors=(errors+data).slice(-5000);});
    const timer=setTimeout(()=>{child.kill();reject(new Error('ffmpeg 编码超时'));},180000);
    child.once('error',error=>{clearTimeout(timer);reject(new Error(error.code==='ENOENT'?'未找到 ffmpeg，请安装后加入 PATH，或设置 UI_DEAI_FFMPEG_PATH。':error.message));});
    child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`ffmpeg 退出 ${code}: ${errors}`));});
  });
}
export async function renderStory(file,out,wide=false) {
  if(!/\.mp4$/i.test(out)) throw new Error('输出文件必须为 .mp4');
  const story=readStoryboard(file,wide);
  await encoder(['-version']);
  const output=resolve(out),parent=dirname(output);mkdirSync(parent,{recursive:true});
  const temporary=mkdtempSync(join(parent,'.ui-deai-render-'));
  let browser;
  try {
    browser=await openBrowser();const page=await browser.newPage({viewport:{width:story.width,height:story.height},deviceScaleFactor:1});
    const sequence=[];
    for(let index=0;index<story.steps.length;index++) {
      const step=story.steps[index];
      await page.goto(pathToFileURL(step.file).href,{waitUntil:'load',timeout:45000});
      await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,3000))]));
      await page.evaluate(label=>{
        const caption=document.createElement('div');caption.textContent=label;
        Object.assign(caption.style,{position:'fixed',left:'20px',bottom:'20px',padding:'10px 16px',background:'#182d29',color:'#fff',font:'16px system-ui',borderRadius:'6px',zIndex:'2147483647'});
        document.body.appendChild(caption);
      },step.label);
      const name=`stage-${index}.png`;
      await page.screenshot({path:join(temporary,name),animations:'disabled'});
      sequence.push(`file '${name}'`,`duration ${step.duration}`);
    }
    sequence.push(`file 'stage-${story.steps.length-1}.png'`);
    const manifest=join(temporary,'frames.txt');writeFileSync(manifest,sequence.join('\n')+'\n');
    await encoder(['-y','-loglevel','error','-f','concat','-safe','1','-i',manifest,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-r','30','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',output]);
    return {file:output,stages:story.steps.length,seconds:story.steps.reduce((sum,step)=>sum+step.duration,0)};
  } finally {
    await browser?.close();
    // Only remove the unique render directory created inside the chosen output directory.
    if(dirname(temporary)===parent && temporary.startsWith(parent+sep) && temporary!==parent) rmSync(temporary,{recursive:true,force:true});
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),pos=args.filter(x=>!x.startsWith('--'));
  try {if(pos.length!==2)throw new Error('用法：node story.mjs <stages.json> <out.mp4> [--wide]');console.log(JSON.stringify(await renderStory(pos[0],pos[1],args.includes('--wide'))));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
