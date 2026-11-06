/** DSH service adapter for dsh-ui-deai. */
import { existsSync, readFileSync, copyFileSync, statSync, createReadStream } from 'node:fs';
import { resolve, dirname, basename, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { audit, PASSES, renderMarkdown } from './engine/audit.js';
import { draftDirection, mergeDirection, renderDirection, DIRECTION_FIELDS } from './engine/direction.js';
import { artifactDir, readState, saveAudit, setPass, updateState, clearState } from './engine/state.js';
import { snapshot, story } from './engine/browser.js';

export const name='dsh-ui-deai';
export const inject=['webServer','commands','tools','skills'];
const root=fileURLToPath(new URL('../',import.meta.url));
const skillDir=join(root,'skills','dsh-ui-deai');
const api='/dsh-ui-deai/api';
const schema=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const string={type:'string'}, strings={type:'array',items:string};
const text=value=>({type:'text',text:String(value)});
const output=schema({ok:{type:'boolean'},markdown:string,data:{type:'object',additionalProperties:true}},['ok','markdown','data']);
const result=(ok,markdown,data={})=>({ok,markdown,data});
const escapePath=path=>resolve(path||process.cwd());

export function runAudit(path,options={}) {
  const report=audit(escapePath(path),options);
  const markdown=renderMarkdown(report);
  if(report.ok) saveAudit({...report,markdown},draftDirection({root:report.root,report}),options);
  return result(report.ok,markdown,report);
}
function keepArtifact(file) {
  const name=`${randomUUID()}-${basename(file).replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  copyFileSync(file,join(artifactDir(),name));return name;
}
function recordArtifact(target,phase,file) {
  const state=readState();
  // A long browser job must not attach its output to a screen selected later.
  if(state.target!==target) return false;
  if(phase==='story') updateState({artifacts:{...state.artifacts,story:file}});
  else updateState({artifacts:{...state.artifacts,[phase]:[...state.artifacts[phase],file].slice(-8)}});
  return true;
}
export function definitions() {
  return [
    {name:'ui_deai_audit',description:'审查指定源码中的模板化表达、一致性和交互问题，返回文件行号、建议及静态分数。分数不能代替视觉验收。路径需为绝对路径。',
      parameters:schema({path:string,include:string,maxFiles:{type:'integer',minimum:1,maximum:5000}},['path']),
      execute:async args=>runAudit(args.path,{include:args.include,maxFiles:args.maxFiles??400})},
    {name:'ui_deai_direction',description:'读取或记录页面的用途、使用者、主要任务、保留约束、调整计划和验收条件。',
      parameters:schema({product:string,audience:string,task:string,keep:strings,changes:strings,acceptance:strings}),
      execute:async args=>{
        const state=readState();
        let direction=state.direction??draftDirection({root:state.workspace||process.cwd(),report:state.audit});
        if(DIRECTION_FIELDS.some(k=>args[k]!==undefined)) direction=mergeDirection(direction,args);
        updateState({direction});return result(true,renderDirection(direction),direction);
      }},
    {name:'ui_deai_pass',description:'记录审查分类的处理状态：open、active 或 done。可附上修改或保留理由。',
      parameters:schema({pass:{type:'string',enum:PASSES.map(p=>p.id)},status:{type:'string',enum:['open','active','done']},note:string},['pass']),
      execute:async args=>{
        const passes=setPass(readState(),args.pass,args.status??'done',args.note);
        updateState({passes});return result(true,passes.map(p=>`- ${p.title}: ${p.status}${p.note?' — '+p.note:''}`).join('\n'),{passes});
      }},
    {name:'ui_deai_snapshot',description:'保存网页的静态 HTML 与 PNG。需要 Playwright 和 Chromium；phase 可区分 before 与 after。',
      parameters:schema({url:string,out:string,phase:{type:'string',enum:['before','after']},theme:{type:'string',enum:['dark','light','none']},width:{type:'integer',minimum:320,maximum:3840},height:{type:'integer',minimum:240,maximum:2160}},['url','out']),
      execute:async(args,exec)=>{
        const phase=args.phase??'before';
        if(!['before','after'].includes(phase)) throw new Error('phase 必须为 before 或 after');
        if(!/^https?:\/\//i.test(args.url)) throw new Error('只支持 HTTP 或 HTTPS 页面');
        if(!/\.html?$/i.test(args.out)) throw new Error('out 必须以 .html 或 .htm 结尾');
        const state=readState(),out=resolve(args.out);
        const job=await snapshot({...args,out,scriptPath:join(skillDir,'scripts','snapshot.mjs'),cwd:state.workspace||process.cwd(),logDir:artifactDir(),signal:exec?.signal});
        let screenshot='',attached=false;
        if(job.ok&&job.screenshot.bytes) {screenshot=keepArtifact(job.screenshot.path);attached=recordArtifact(state.target,phase,screenshot);}
        return result(job.ok,job.ok?`已保存 ${out} 与 PNG${attached?'，面板已更新':'，输出未关联当前审查'}`:`截图失败：${job.output}`,{html:out,screenshot,attached,exitCode:job.code??-1});
      }},
    {name:'ui_deai_story',description:'将阶段清单 JSON 中的本地页面制成 MP4 演示。需要 Playwright、Chromium 和 ffmpeg。',
      parameters:schema({file:string,out:string,wide:{type:'boolean'}},['file','out']),
      execute:async(args,exec)=>{
        if(!/\.mp4$/i.test(args.out)) throw new Error('out 必须以 .mp4 结尾');
        const state=readState(),file=resolve(args.file),out=resolve(args.out);
        const job=await story({file,out,wide:args.wide,scriptPath:join(skillDir,'scripts','story.mjs'),cwd:dirname(file),logDir:artifactDir(),signal:exec?.signal});
        let video='',attached=false;
        if(job.ok&&job.video.bytes) {video=keepArtifact(job.video.path);attached=recordArtifact(state.target,'story',video);}
        return result(job.ok,job.ok?`已生成 ${out}`:`视频生成失败：${job.output}`,{video,attached,exitCode:job.code??-1});
      }},
  ].map(tool=>({...tool,output:{schema:output,render:(_args,value)=>[text(value.markdown)]}}));
}

export function makeApiHandler() {
  return async(req,res)=>{
    const send=(status,value)=>{const body=JSON.stringify(value);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(body);};
    async function body() {
      const chunks=[];let size=0;
      for await(const chunk of req) {size+=chunk.length;if(size>65536) throw Object.assign(new Error('请求体过大'),{status:413});chunks.push(chunk);}
      try {const value=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!value||Array.isArray(value)||typeof value!=='object') throw new Error();return value;}
      catch {throw Object.assign(new Error('请求体必须为 JSON 对象'),{status:400});}
    }
    try {
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(!pathname.startsWith(api+'/')) return send(404,{ok:false,error:'unknown route'});
      const route=pathname.slice(api.length);
      if(req.method==='GET'&&route==='/state') return send(200,readState());
      if(req.method==='POST'&&route==='/audit') {
        const args=await body(),state=readState();
        const target=args.path??state.target;
        if(!target) return send(400,{ok:false,error:'请先提供要审查的源码路径'});
        const selection=args.path && resolve(args.path)!==state.target ? {} : state.selection;
        const report=runAudit(target,{...selection,...(args.maxFiles?{maxFiles:args.maxFiles}:{}),...(args.include!==undefined?{include:args.include}:{})});
        return send(report.ok?200:400,report);
      }
      if(req.method==='POST'&&route==='/pass') {
        const args=await body();
        try {updateState({passes:setPass(readState(),args.pass,args.status,args.note)});}catch(error){return send(400,{ok:false,error:error.message});}
        return send(200,{ok:true});
      }
      if(req.method==='POST'&&route==='/clear') {await body();clearState();return send(200,{ok:true});}
      if(req.method==='GET'&&route==='/report.md') {
        res.writeHead(200,{'content-type':'text/markdown; charset=utf-8','cache-control':'no-store'});
        return res.end(readState().audit?.markdown??'# dsh-ui-deai\n\n尚无审查报告。\n');
      }
      if(req.method==='GET'&&route.startsWith('/artifact/')) {
        const name=decodeURIComponent(route.slice('/artifact/'.length));
        if(!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(name)) return send(400,{ok:false,error:'无效文件名'});
        const file=join(artifactDir(),name);
        if(!existsSync(file)||!statSync(file).isFile()) return send(404,{ok:false,error:'文件不存在'});
        const size=statSync(file).size,range=req.headers.range;
        const headers={'content-type':{'.png':'image/png','.mp4':'video/mp4'}[extname(file)]??'application/octet-stream','accept-ranges':'bytes','cache-control':'no-store','x-content-type-options':'nosniff'};
        let start=0,end=size-1,status=200;
        if(range) {
          const match=/^bytes=(\d*)-(\d*)$/.exec(range);
          if(!match||(!match[1]&&!match[2])) {res.writeHead(416,{'content-range':`bytes */${size}`});return res.end();}
          if(!match[1]) start=Math.max(0,size-Number(match[2]));
          else {start=Number(match[1]);if(match[2]) end=Math.min(end,Number(match[2]));}
          if(start>end||start>=size) {res.writeHead(416,{'content-range':`bytes */${size}`});return res.end();}
          status=206;headers['content-range']=`bytes ${start}-${end}/${size}`;
        }
        headers['content-length']=size?end-start+1:0;res.writeHead(status,headers);
        if(!size) return res.end();
        createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);return;
      }
      return send(404,{ok:false,error:'unknown route'});
    } catch(error) {return send(error.status??500,{ok:false,error:error.message});}
  };
}
export function apply(ctx) {
  const skills=ctx.get('skills',false),tools=ctx.get('tools',false),commands=ctx.get('commands',false),server=ctx.get('webServer',false);
  if(skills) ctx.effect(()=>skills.register({name,source:name,description:'审查并改善界面的模板化表达，保留产品约束，记录改造方向与验收结果。',
    content:readFileSync(join(skillDir,'SKILL.md'),'utf8').replaceAll('{{SKILL_DIR}}',skillDir),invocation:{modelInvocable:true,userInvocable:true}}));
  if(tools) ctx.effect(()=>{
    const disposers=definitions().map(d=>tools.register(d)).filter(off=>typeof off==='function');
    return ()=>disposers.forEach(off=>off());
  });
  if(commands) ctx.effect(()=>commands.register({name,description:'扫描界面源码并更新 dsh-ui-deai 面板',input:{hint:'[源码路径]'},handler:({rawInput})=>{
    const path=String(rawInput??'').trim().replace(/^(["'])(.*)\1$/,'$2')||readState().target;
    if(!path) return {kind:'error',text:'请输入源码路径'};
    const report=runAudit(path);return {kind:report.ok?'success':'error',text:report.markdown};
  }}));
  if(server) ctx.effect(()=>server.register({kind:'prefix',path:api,handler:makeApiHandler()}));
}

