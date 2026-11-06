import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
export async function browserKit() {
  const locations=[process.env.UI_DEAI_PLAYWRIGHT_PATH,join(process.cwd(),'package.json'),import.meta.url].filter(Boolean);
  for(const location of locations) {
    try {
      const req=createRequire(location.startsWith('file:')?location:resolve(location));
      for(const module of ['playwright','playwright-core']) {try{return req(module);}catch{}}
    } catch {}
  }
  throw new Error('未找到 Playwright。请在工作项目中安装 playwright，并运行 npx playwright install chromium。');
}
export function viewport(width,height) {
  const w=Number(width),h=Number(height);
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<320||w>3840||h<240||h>2160) throw new Error('视口尺寸超出范围：宽 320–3840，高 240–2160');
  return {width:w,height:h};
}
export async function openBrowser() {
  const {chromium}=await browserKit();
  return chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
}

