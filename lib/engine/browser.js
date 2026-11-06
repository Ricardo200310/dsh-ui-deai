import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export const nodeBinary=()=>process.env.DSH_NODE_PATH||'node';
export function runScript(script,args,options={}) {
  const logDir=options.logDir??options.cwd??process.cwd();
  mkdirSync(logDir,{recursive:true});
  const log=join(logDir,`ui-deai-${randomUUID()}.log`);
  const fd=openSync(log,'w');
  return new Promise(resolve=>{
    let child,timer,closed=false,timedOut=false,cancelled=false;
    const abort=()=>{cancelled=true;child?.kill();};
    const finish=(code,error)=>{
      if(closed) return;closed=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);closeSync(fd);
      let output='';try{output=readFileSync(log,'utf8').slice(-16000).trim();}catch{}
      resolve({ok:code===0&&!cancelled&&!timedOut,code,output:error?String(error.message):output,timedOut,cancelled});
    };
    if(options.signal?.aborted) {cancelled=true;finish(null,new Error('已取消'));return;}
    try {child=spawn(nodeBinary(),[script,...args],{cwd:options.cwd??process.cwd(),windowsHide:true,stdio:['ignore',fd,fd],env:process.env});}
    catch(error){finish(null,error);return;}
    child.once('error',error=>finish(null,error));child.once('close',code=>finish(code));
    timer=setTimeout(()=>{timedOut=true;child.kill();},options.timeoutMs??180000);
    options.signal?.addEventListener('abort',abort,{once:true});
  });
}
const fileInfo=path=>{try{return {path,bytes:statSync(path).size};}catch{return {path,bytes:0};}};
export async function snapshot(input) {
  mkdirSync(dirname(input.out),{recursive:true});
  const args=[input.url,input.out,`--theme=${input.theme??'none'}`,`--width=${input.width??1440}`,`--height=${input.height??900}`];
  const result=await runScript(input.scriptPath,args,{cwd:input.cwd,logDir:input.logDir,signal:input.signal});
  return {...result,html:fileInfo(input.out),screenshot:fileInfo(input.out.replace(/\.html?$/i,'')+'.png')};
}
export async function story(input) {
  mkdirSync(dirname(input.out),{recursive:true});
  const result=await runScript(input.scriptPath,[input.file,input.out,...(input.wide?['--wide']:[])],{
    cwd:input.cwd,logDir:input.logDir,signal:input.signal,timeoutMs:600000});
  return {...result,video:fileInfo(input.out)};
}
