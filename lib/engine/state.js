import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PASSES } from './audit.js';

export const STATE_VERSION=1;
export const projectHome=()=>join(process.env.DSH_HOME||join(homedir(),'.dsh'),'dsh-ui-deai');
export function artifactDir() {const dir=join(projectHome(),'artifacts');mkdirSync(dir,{recursive:true});return dir;}
export function emptyState() {
  return {version:STATE_VERSION,target:'',workspace:'',selection:{include:'',maxFiles:400},audit:null,direction:null,
    passes:PASSES.map(p=>({...p,status:'open',note:''})),artifacts:{before:[],after:[],story:null},updatedAt:null};
}
export function readState() {
  const initial=emptyState();
  try {
    const saved=JSON.parse(readFileSync(join(projectHome(),'state.json'),'utf8'));
    if(!saved||Array.isArray(saved)||typeof saved!=='object') return initial;
    return {...initial,...saved,version:STATE_VERSION,
      passes:initial.passes.map(p=>({...p,...(Array.isArray(saved.passes)?saved.passes.find(s=>s.id===p.id):{})})),
      artifacts:{...initial.artifacts,...saved.artifacts}};
  } catch {return initial;}
}
export function updateState(patch) {
  const state={...readState(),...patch,updatedAt:new Date().toISOString()};
  mkdirSync(projectHome(),{recursive:true});
  const file=join(projectHome(),'state.json'), temp=join(projectHome(),`${randomUUID()}.tmp`);
  writeFileSync(temp,JSON.stringify(state,null,2),'utf8');renameSync(temp,file);return state;
}
export const clearState=()=>updateState(emptyState());
export function setPass(state,id,status,note) {
  if(!PASSES.some(p=>p.id===id)||!['open','active','done'].includes(status)) throw new Error('无效的审查阶段或状态');
  return state.passes.map(p=>p.id===id?{...p,status,note:note??p.note}:p);
}
export function saveAudit(report,direction,options={}) {
  const previous=readState();
  if(!report.ok) return previous;
  const selection={include:options.include??'',maxFiles:options.maxFiles??400};
  const same=previous.target===report.target && previous.selection.include===selection.include;
  return updateState({...(same?{}:emptyState()),target:report.target,workspace:report.root,selection,audit:report,
    direction:same&&previous.direction?previous.direction:direction});
}
