/** Source-based UI review. Findings are hypotheses, never a visual quality verdict. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join, extname } from 'node:path';

export const PASSES = [
  ['content', '内容与任务'], ['hierarchy', '信息层级'], ['consistency', '组件一致性'],
  ['interaction', '交互反馈'], ['accessibility', '可访问性'], ['decoration', '装饰与品牌'],
].map(([id, title], index) => ({ id, title, order: index + 1 }));
const rank = { high: 3, medium: 2, low: 1, info: 0 };
const extensions = new Set(['.html','.htm','.css','.scss','.less','.sass','.jsx','.tsx','.vue','.svelte','.astro','.mdx','.js','.ts','.mjs','.cjs']);
const excluded = new Set(['node_modules','dist','build','coverage','vendor','out','test-results','playwright-report']);
const markupFile = file => /\.(?:html?|[jt]sx|vue|svelte|astro|mdx)$/i.test(file);
const hasAttr = (tag, name) => new RegExp(`\\b${name}\\s*=`, 'i').test(tag);
const attr = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'is').exec(tag)?.[2];
const matches = (text, pattern) => [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))];
const define = (id, pass, severity, title, fix, find, markup = false) => ({ id, pass, severity, title, fix, find, markup });
const every = pattern => text => matches(text, pattern);

export const RULES = [
  define('generic-promise', 'content', 'medium', '文案使用泛化承诺', '替换为实际功能、使用对象或可核验的结果；已有品牌用语可保留并说明理由。',
    text => matches(text, />[^<>]*?(?:supercharge|game.changing|revolutionary|一站式赋能|颠覆体验|无限可能)[^<>]*</gi), true),
  define('placeholder-content', 'content', 'medium', '界面含占位内容', '补全真实内容；演示数据应明确标注，避免被误认为业务结果。', every(/(?:Lorem ipsum|\[(?:TODO|TBD)\]|待补充文案)/gi), true),
  define('missing-link-target', 'interaction', 'low', '链接没有有效目的地', '提供目标地址；执行操作时使用按钮，并提供操作后的状态反馈。',
    text => matches(text, /<a\b[^>]*>/gi).filter(m => ['', '#', 'javascript:void(0)'].includes(attr(m[0], 'href'))), true),
  define('missing-image-description', 'accessibility', 'high', '图片未声明替代文本', '内容图片描述其用途；纯装饰图片显式使用空 alt。',
    text => matches(text, /<img\b[^>]*>/gi).filter(m => !hasAttr(m[0], 'alt') && !/\{\.\.\./.test(m[0])), true),
  define('unlabelled-input', 'accessibility', 'medium', '输入框可能缺少名称', '为输入框关联 label，或补充 aria-label；placeholder 不能替代持久标签。',
    text => matches(text, /<input\b[^>]*>/gi).filter(m => {
      const tag = m[0];
      if (['hidden','submit','button','reset','image'].includes(attr(tag,'type')) || /\{\.\.\./.test(tag)) return false;
      if (['aria-label','aria-labelledby','title'].some(name => hasAttr(tag,name))) return false;
      const id = attr(tag,'id');
      if (id && matches(text, /<label\b[^>]*>/gi).some(label => (attr(label[0],'for') ?? attr(label[0],'htmlFor')) === id)) return false;
      const before = text.slice(0,m.index);
      return before.lastIndexOf('<label') <= before.lastIndexOf('</label');
    }), true),
  define('unnamed-icon-control', 'accessibility', 'high', '图标按钮可能没有可读名称', '添加表达操作目的的文本或 aria-label。',
    text => matches(text, /<button\b[^>]*>[\s\S]*?<\/button>/gi).filter(m => {
      const opening=m[0].slice(0,m[0].indexOf('>')+1);
      if (['aria-label','aria-labelledby','title'].some(name=>hasAttr(opening,name))) return false;
      const body=m[0].replace(/<svg\b[\s\S]*?<\/svg>/gi,'').replace(/<[^>]+>/g,'').trim();
      return !body && !/\{/.test(m[0]);
    }), true),
  define('focus-outline-removed', 'accessibility', 'high', '默认焦点轮廓被移除', '检查键盘操作时是否存在等效的可见焦点样式。', every(/\boutline\s*:\s*(?:none|0(?:px)?)(?=\s*[;}])|\bfocus:outline-none\b/gi)),
  define('very-small-text', 'hierarchy', 'medium', '存在低于 11px 的文字', '按真实缩放比例检查可读性，尤其是辅助说明和移动端。',
    text => matches(text, /font-size\s*:\s*(\d+(?:\.\d+)?)px|text-\[(\d+(?:\.\d+)?)px\]/gi).filter(m=>Number(m[1]??m[2])>0 && Number(m[1]??m[2])<11)),
  define('weight-fragmentation', 'consistency', 'low', '同一文件包含五种以上字重', '检查这些字重是否对应独立的信息角色，合并没有用途的差异。', text => {
    const found=matches(text,/font-weight\s*:\s*([1-9]00)|\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/gi);
    const weights={thin:100,extralight:200,light:300,normal:400,medium:500,semibold:600,bold:700,extrabold:800,black:900};
    return new Set(found.map(m=>Number(m[1])||weights[m[2].toLowerCase()])).size>=5 ? found.slice(0,1) : [];
  }),
  define('spacing-fragmentation', 'consistency', 'low', '出现多种零散的自定义间距', '比较相邻组件，优先复用项目已有间距变量；光学对齐可以例外。', text => {
    const found=matches(text,/\b(?:m[trblxy]?|p[trblxy]?|gap)-\[(\d+)px\]/g).filter(m=>Number(m[1])>6 && Number(m[1])%2!==0);
    return new Set(found.map(m=>m[1])).size>=3 ? found.slice(0,1) : [];
  }),
  define('important-overrides', 'consistency', 'low', '大量强制样式覆盖', '检查样式层级或重复组件规则，减少相互覆盖的补丁。', text => {
    const found=matches(text,/!important\b/gi); return found.length>=5 ? found.slice(0,1) : [];
  }),
  define('broad-transition', 'interaction', 'low', '过渡效果覆盖全部属性', '只为实际需要变化的属性设置过渡，检查布局变化时的跳动。', every(/\btransition-all\b|\btransition(?:-property)?\s*:\s*all\b/gi)),
  define('continuous-animation', 'interaction', 'medium', '持续动画需要用途与减弱模式', '确认动画表达实时状态；为非必要动画提供 prefers-reduced-motion 处理。', text =>
    /prefers-reduced-motion/.test(text) ? [] : matches(text,/\banimate-(?:pulse|bounce|ping)\b|animation\s*:[^;{}]*\binfinite\b/gi)),
  define('gradient-lettering', 'decoration', 'medium', '文字使用背景裁剪效果', '确认这是有意的品牌表达，并检查弱对比、打印与背景资源失败时的可读性。', every(/\bbg-clip-text\b|(?:-webkit-)?background-clip\s*:\s*text/gi)),
  define('decorative-stack', 'decoration', 'medium', '一个元素叠加多种装饰效果', '检查颜色、阴影和模糊是否共同传达信息，移除争夺注意力的重复效果。', text =>
    matches(text, /\bclass(?:Name)?\s*=\s*(["'])(.*?)\1/gs).filter(m => [/gradient|from-\w+-\d/,/shadow-/,/blur-|backdrop-/].every(re=>re.test(m[2]))), true),
];

// Preserve offsets while dropping comments, and scripts inside markup documents.
const neutralize = (text, file) => {
  let result=text.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, m=>m.replace(/[^\r\n]/g,' '));
  if (/\.(?:html?|vue|svelte|astro)$/i.test(file)) result=result.replace(/<script\b[\s\S]*?<\/script>/gi,m=>m.replace(/[^\r\n]/g,' '));
  return result;
};
export function auditText(text, file, options={}) {
  const source=neutralize(text,file);
  const result=new Map();
  for (const rule of RULES) {
    if (rule.markup && !markupFile(file)) continue;
    for (const match of rule.find(source)) {
      const prefix=text.slice(0,match.index);
      const line=prefix.split('\n').length;
      const key=`${rule.id}:${line}`;
      if (result.has(key)) { result.get(key).count++; continue; }
      result.set(key,{rule:rule.id,pass:rule.pass,severity:rule.severity,title:rule.title,fix:rule.fix,
        file:options.displayPath??file,line,column:match.index-prefix.lastIndexOf('\n'),
        snippet:text.split(/\r?\n/)[line-1].trim().slice(0,220),count:1});
    }
  }
  return [...result.values()];
}
export function readIgnore(root) {
  try {
    return readFileSync(join(root,'.ui-deai-ignore'),'utf8').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).map(s=>{
      const clean=s.replaceAll('\\','/').replace(/^\.\//,'');
      const escaped=clean.split('*').map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
      return new RegExp(`(?:^|/)${escaped}${clean.endsWith('/')?'':'(?:/|$)'}`,'i');
    });
  } catch { return []; }
}
export function collectFiles(target, options={}) {
  const absolute=resolve(target);
  const result={target:absolute,root:absolute,files:[],warnings:[],missing:false,truncated:false};
  const max=Math.max(1,Math.min(5000,Math.floor(Number(options.maxFiles)||400)));
  try {
    const info=statSync(absolute);
    if(info.isFile()) {result.root=dirname(absolute);result.files.push(absolute);return result;}
    if(!info.isDirectory()) throw new Error('不是目录或文件');
  } catch(error) {result.missing=true;result.warnings.push(error.message);return result;}
  const ignores=readIgnore(absolute);
  function walk(dir,depth=0) {
    if(depth>16) {result.truncated=true;return;}
    let entries;
    try {entries=readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name));}
    catch(error) {result.warnings.push(`无法读取 ${relative(absolute,dir)}: ${error.code}`);return;}
    for(const entry of entries) {
      if(entry.name.startsWith('.')||entry.isSymbolicLink()) continue;
      const full=join(dir,entry.name), rel=relative(absolute,full).replaceAll('\\','/');
      if(ignores.some(p=>p.test(rel+(entry.isDirectory()?'/':'')))) continue;
      if(entry.isDirectory()) {if(!excluded.has(entry.name)) walk(full,depth+1);continue;}
      if(!entry.isFile()||!extensions.has(extname(full).toLowerCase())||/\.min\.(js|css)$|\.d\.ts$/i.test(full)) continue;
      if(options.include&&!rel.toLowerCase().includes(String(options.include).toLowerCase())) continue;
      if(result.files.length>=max) {result.truncated=true;continue;}
      result.files.push(full);
    }
  }
  walk(absolute);return result;
}
export function detectStack(root) {
  const result={frameworks:[],styling:[],languages:[]};
  try {
    const p=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
    const d={...p.dependencies,...p.devDependencies,...p.peerDependencies};
    for(const [key,label] of [['react','React'],['next','Next.js'],['vue','Vue'],['svelte','Svelte'],['astro','Astro']]) if(d[key]) result.frameworks.push(label);
    if(d.tailwindcss) result.styling.push('Tailwind CSS');
    if(d.typescript) result.languages.push('TypeScript');
  } catch {}
  return result;
}
export function audit(target, options={}) {
  const collected=collectFiles(target,options);
  const all=[];
  let lines=0, files=0;
  for(const file of collected.files) {
    try {
      if(statSync(file).size>512*1024) {collected.warnings.push(`跳过大文件: ${relative(collected.root,file)}`);continue;}
      const source=readFileSync(file,'utf8');
      if(source.includes('\0')) {collected.warnings.push(`跳过二进制文件: ${relative(collected.root,file)}`);continue;}
      files++;lines+=source.split(/\r?\n/).length;
      all.push(...auditText(source,file,{displayPath:relative(collected.root,file).replaceAll('\\','/')}));
    } catch(error) {collected.warnings.push(`读取失败: ${file} (${error.code})`);}
  }
  all.sort((a,b)=>rank[b.severity]-rank[a.severity]||a.file.localeCompare(b.file)||a.line-b.line);
  const penalties=new Map();
  for(const f of all) penalties.set(f.rule,(penalties.get(f.rule)??0)+f.count);
  const penalty=[...penalties].reduce((sum,[id,n])=>sum+({high:13,medium:7,low:3,info:1}[RULES.find(r=>r.id===id).severity])*(1+Math.min(2,Math.log2(n))/2),0);
  const ok=!collected.missing && files>0;
  const score=ok ? Math.max(0,Math.round(100-penalty)) : 0;
  const grade=!ok?'unknown':score>=90?'clear':score>=65?'review':'attention';
  const passes=PASSES.map(p=>{const items=all.filter(f=>f.pass===p.id);return {...p,count:items.length,severity:items[0]?.severity??'info'};});
  return {ok,target:collected.target,root:collected.root,files,lines,score,grade,
    label:{unknown:'未完成扫描',clear:'少量或无静态提示',review:'建议复核',attention:'优先处理'}[grade],
    findings:all.slice(0,Math.max(1,Math.floor(Number(options.maxFindings)||400))),totalFindings:all.length,passes,
    stack:detectStack(collected.root),warnings:collected.warnings,truncated:collected.truncated,
    generatedAt:new Date().toISOString(),...(!ok?{error:collected.missing?'目标不存在或不可读':'没有可扫描的源码文件'}:{})};
}
export function renderMarkdown(report) {
  const rows=[`# dsh-ui-deai 审查`, '', `目标：${report.target}`, '', report.ok?`静态检查分数：**${report.score}/100** · ${report.label} · ${report.files} 个文件`:`扫描未完成：${report.error}`,
    '', '分数越高表示触发的规则越少，不代表视觉质量、品牌契合度或可访问性已经通过。'];
  if(report.truncated) rows.push('', '扫描达到数量或深度限制，结果不完整。');
  for(const warning of report.warnings??[]) rows.push(`- ${warning}`);
  for(const pass of report.passes) {
    if(!pass.count) continue;
    rows.push('',`## ${pass.title} (${pass.count})`);
    for(const item of report.findings.filter(f=>f.pass===pass.id)) rows.push(`- \`${item.file}:${item.line}\` **${item.title}** — ${item.fix}`);
  }
  if(report.totalFindings>report.findings.length) rows.push('',`仅展示 ${report.findings.length}/${report.totalFindings} 项。`);
  if(report.ok&&!report.totalFindings) rows.push('','未触发静态规则。仍需查看实际界面与交互。');
  return rows.join('\n')+'\n';
}

