import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
export function reactRuntime() {
  for(const file of [resolve('package.json'),resolve('.test-runtime/package.json')]) {
    try {const require=createRequire(file);return {React:require('react'),ReactDOM:require('react-dom/server'),require};}catch{}
  }
  throw new Error('缺少 React 测试依赖，请执行 npm install。');
}
export function loadClient(React) {
  let registration;const css=[],components=new Map();
  const window={location:{hash:'#dsh-ui-deai'},__ModuleLoader__:{load:value=>{registration=value;}},addEventListener(){},removeEventListener(){}};
  const document={querySelectorAll:()=>[],createElement:()=>({dataset:{},textContent:'',remove(){}}),head:{appendChild:node=>css.push(node.textContent)}};
  vm.runInNewContext(readFileSync('lib/client.js','utf8'),{window,document,fetch:()=>{throw new Error('SSR must not fetch');},setTimeout,clearTimeout,URLSearchParams});
  const client=registration.factory(spec=>{if(spec==='react')return React;throw new Error(`意外依赖: ${spec}`);});
  client.apply({effect:fn=>fn(),slots:{inject:(_name,generator)=>{for(const value of generator()){}},register:(slot,component)=>{components.set(slot.name,component);return()=>{};}}});
  return {client,css:css.join('\n'),components};
}
export function browserHarness(state,{settings=false}={}) {
  const {require}=reactRuntime();
  const react=readFileSync(resolve(require.resolve('react'),'../umd/react.development.js'),'utf8');
  const dom=readFileSync(resolve(require.resolve('react-dom'),'../umd/react-dom.development.js'),'utf8');
  const client=readFileSync('lib/client.js','utf8');
  const json=JSON.stringify(state).replace(/</g,'\\u003c');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>dsh-ui-deai</title><body style="margin:0;background:#f3f6f5"><div id="root"></div><script>${react}</script><script>${dom}</script><script>
  window.__previewState=${json};
  window.__ModuleLoader__={load({factory}){const module=factory(name=>{if(name==='react')return React;throw new Error(name);});module.apply({effect:fn=>fn(),slots:{inject:(name,fn)=>{for(const x of fn()){}},register:(slot,Component)=>{if(slot.name==='${settings?'settings.section':'shell.overlay'}')ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component));return()=>{};}}});}};
  if(location.protocol==='file:')window.fetch=async(url,init)=>{const route=String(url).split('/').pop();if(route==='pass'){const input=JSON.parse(init.body);window.__previewState.passes=window.__previewState.passes.map(p=>p.id===input.pass?{...p,status:input.status}:p);}return {ok:true,json:async()=>window.__previewState};};
  location.hash='dsh-ui-deai';
  </script><script>${client}</script></body></html>`;
}
