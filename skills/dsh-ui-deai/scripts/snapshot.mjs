/** Capture a static, viewport-specific document with inline computed styles. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openBrowser, viewport } from './browser-kit.mjs';
export async function capture({url,out,width=1440,height=900,theme='none'}) {
  if(!/^https?:\/\//i.test(url)) throw new Error('页面地址必须使用 HTTP 或 HTTPS');
  if(!/\.html?$/i.test(out)) throw new Error('输出文件必须为 HTML');
  const size=viewport(width,height);
  const browser=await openBrowser();
  try {
    const page=await browser.newPage({viewport:size,colorScheme:['dark','light'].includes(theme)?theme:'no-preference'});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,5000))]));
    await page.waitForTimeout(300);
    const captured=await page.evaluate(async()=>{
      const copy=document.documentElement.cloneNode(true);
      const source=[document.documentElement,...document.documentElement.querySelectorAll('*')];
      const target=[copy,...copy.querySelectorAll('*')];
      if(source.length>10000) throw new Error('页面节点过多，请缩小要保存的页面');
      const cache=new Map(),warnings=new Set();
      async function embed(value) {
        if(!value||/^(data:|#)/.test(value)) return value;
        const address=new URL(value,location.href).href;
        if(!cache.has(address)) cache.set(address,(async()=>{
          try {
            const response=await fetch(address,{signal:AbortSignal.timeout(10000)});
            if(!response.ok) throw new Error();
            const blob=await response.blob();if(blob.size>4*1024*1024) throw new Error();
            return await new Promise((done,fail)=>{const reader=new FileReader();reader.onload=()=>done(reader.result);reader.onerror=fail;reader.readAsDataURL(blob);});
          } catch {warnings.add(address);return address;}
        })());
        return cache.get(address);
      }
      async function rewriteUrls(value) {
        const matches=[...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
        for(const [whole,url] of matches) value=value.replace(whole,`url("${await embed(url)}")`);
        return value;
      }
      for(let index=0;index<source.length;index++) {
        const from=source[index],to=target[index];
        if(['SCRIPT','STYLE','LINK','NOSCRIPT'].includes(from.tagName)) continue;
        const style=getComputedStyle(from);
        to.removeAttribute('style');
        for(const property of style) {
          if(property.startsWith('animation')||property.startsWith('transition')) continue;
          to.style.setProperty(property,await rewriteUrls(style.getPropertyValue(property)));
        }
        for(const attribute of [...to.attributes]) if(/^on/i.test(attribute.name)||['srcset','loading','integrity','nonce'].includes(attribute.name)) to.removeAttribute(attribute.name);
        if(from.tagName==='IMG') to.setAttribute('src',await embed(from.currentSrc||from.src));
        if(from.tagName==='A') to.setAttribute('href',from.href);
        if(from.tagName==='INPUT') {if(!['password','file'].includes(from.type))to.setAttribute('value',from.value);if(from.checked)to.setAttribute('checked','');}
        if(from.tagName==='TEXTAREA')to.textContent=from.value;
        if(from.tagName==='CANVAS') {try{const image=document.createElement('img');image.src=from.toDataURL();image.setAttribute('style',to.getAttribute('style'));to.replaceWith(image);}catch{warnings.add('无法导出画布');}}
      }
      copy.querySelectorAll('script,noscript,style,link,base,iframe,source,meta[http-equiv]').forEach(node=>node.remove());
      const metadata=document.createElement('meta');metadata.name='generator';metadata.content='dsh-ui-deai';copy.querySelector('head')?.appendChild(metadata);
      return {html:'<!doctype html>\n'+copy.outerHTML,warnings:[...warnings]};
    });
    const file=resolve(out);mkdirSync(dirname(file),{recursive:true});
    await page.screenshot({path:file.replace(/\.html?$/i,'')+'.png',animations:'disabled'});
    writeFileSync(file,captured.html,'utf8');
    return {html:file,screenshot:file.replace(/\.html?$/i,'')+'.png',warnings:captured.warnings};
  } finally {await browser.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),pos=args.filter(x=>!x.startsWith('--'));
  const option=(name,fallback)=>args.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
  try {
    if(pos.length!==2) throw new Error('用法：node snapshot.mjs <url> <out.html> [--theme=dark] [--width=1440] [--height=900]');
    console.log(JSON.stringify(await capture({url:pos[0],out:pos[1],width:option('width',1440),height:option('height',900),theme:option('theme','none')})));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
