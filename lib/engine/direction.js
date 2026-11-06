import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export const DIRECTION_FIELDS=['product','audience','task','keep','changes','acceptance'];
export function draftDirection({root,report}) {
  let product='';
  try {product=String(JSON.parse(readFileSync(join(root,'package.json'),'utf8')).description??'');} catch {}
  if(!product) {
    try {product=readFileSync(join(root,'README.md'),'utf8').split(/\r?\n\s*\r?\n/).find(p=>p.trim()&&!/^[#<!\[]/.test(p.trim()))?.trim().slice(0,300)??'';} catch {}
  }
  return {draft:true,product:product||'待明确产品用途',audience:'待明确主要使用者',task:'待明确当前页面的主要任务',
    keep:['保留现有功能与已确认的品牌约束'],
    changes:[...new Set((report?.findings??[]).slice(0,5).map(f=>f.title))],
    acceptance:['主要任务可以顺利完成','键盘焦点可见，窄屏内容可读','逐条复核扫描提示并记录保留理由']};
}
export function mergeDirection(base,input) {
  const result={...base,draft:false};
  for(const key of DIRECTION_FIELDS) {
    if(input[key]===undefined) continue;
    if(['keep','changes','acceptance'].includes(key)) {
      if(!Array.isArray(input[key])||input[key].some(s=>typeof s!=='string')) throw new Error(`${key} 必须是字符串数组`);
    } else if(typeof input[key]!=='string') throw new Error(`${key} 必须是字符串`);
    result[key]=input[key];
  }
  return result;
}
export function renderDirection(value) {
  if(!value) return '尚未记录设计方向。';
  const labels={product:'产品用途',audience:'使用者',task:'页面任务',keep:'保留约束',changes:'计划调整',acceptance:'验收条件'};
  return DIRECTION_FIELDS.map(k=>`- ${labels[k]}：${Array.isArray(value[k])?value[k].join('；'):value[k]??''}`).join('\n')+(value.draft?'\n\n这是待复核的草稿。':'');
}
