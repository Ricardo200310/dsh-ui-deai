import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):/\.[cm]?js$/.test(e.name)?[join(dir,e.name)]:[]);
const files=['lib','skills/dsh-ui-deai/scripts','test','tools'].flatMap(walk);
for(const file of files){const run=spawnSync(process.execPath,['--check',file],{stdio:'inherit',windowsHide:true});if(run.error)throw run.error;if(run.status!==0)process.exit(run.status??1);}
console.log(`语法检查通过：${files.length} 个脚本`);
