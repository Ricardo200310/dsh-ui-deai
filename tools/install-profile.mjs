import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const name='dsh-ui-deai',root=fileURLToPath(new URL('../',import.meta.url));
const profile=process.argv[2]??'desktop';
if(!/^[a-zA-Z0-9_-]+$/.test(profile)) throw new Error('profile 名称只能包含字母、数字、下划线和短横线');
const dir=join(process.env.DSH_HOME||join(homedir(),'.dsh'),'profiles',profile),manifest=join(dir,'package.json');
if(!existsSync(manifest)) throw new Error(`找不到 profile: ${manifest}`);
const data=JSON.parse(readFileSync(manifest,'utf8'));
const target=join(dir,'node_modules',name);
// Junctions are reported as directories on Windows, so compare resolved paths.
const samePath=(a,b)=>{try{return realpathSync.native(a)===realpathSync.native(b);}catch{return false;}};
const existsAt=path=>{try{lstatSync(path);return true;}catch{return false;}};
// A moved project leaves a dangling link behind; remove it so the link can be recreated.
if(!existsSync(target)&&existsAt(target))rmdirSync(target);
if(existsSync(target)&&!samePath(target,root)) throw new Error(`目标已存在且不是当前项目的链接：${target}。请先通过宿主卸载该副本。`);
const backup=join(root,'.profile-backups',`${profile}-${new Date().toISOString().replace(/[:.]/g,'-')}`);
mkdirSync(backup,{recursive:true});copyFileSync(manifest,join(backup,'package.json'));
const patch=join(dir,'cordis.patch.yml');if(existsSync(patch))copyFileSync(patch,join(backup,'cordis.patch.yml'));
mkdirSync(join(dir,'node_modules'),{recursive:true});
if(!existsSync(target))symlinkSync(root,target,process.platform==='win32'?'junction':'dir');
data.dependencies??={};data.dependencies[name]=`link:${root}`;
data.dsh??={};data.dsh.profile??={};data.dsh.profile.bundles??=[];
if(!data.dsh.profile.bundles.includes(name))data.dsh.profile.bundles.push(name);
writeFileSync(manifest,JSON.stringify(data,null,2)+'\n');
console.log(`已安装 ${name}。备份：${backup}。请重启宿主或重新加载插件。`);
