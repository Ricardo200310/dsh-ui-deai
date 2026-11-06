/* The DSH loader provides React and the UI slot service. */
(() => {
  const ID='dsh-ui-deai',API='/dsh-ui-deai/api';
  const CSS=`
.dea{--dea-bg:var(--dsw-alias-bg-layer-1,#fff);--dea-text:var(--dsw-alias-label-primary,#20252d);--dea-muted:var(--dsw-alias-label-secondary,#606975);--dea-line:var(--dsw-alias-border-l2,#dce1e7);color:var(--dea-text);font:13px/1.6 system-ui,sans-serif;box-sizing:border-box}
.dea *{box-sizing:border-box}.dea button,.dea input{font:inherit;color:inherit}.dea button,.dea a.dea-button{cursor:pointer;border:1px solid var(--dea-line);border-radius:7px;padding:6px 10px;background:var(--dea-bg);text-decoration:none;color:inherit}.dea button:disabled{opacity:.5;cursor:wait}.dea :focus-visible{outline:2px solid #297968;outline-offset:3px}.dea button:hover{border-color:#297968}.dea h2,.dea h3,.dea p{margin:0}.dea h2{font-size:17px}.dea h3{font-size:14px}.dea-muted{color:var(--dea-muted);font-size:12px}.dea-overlay{position:fixed;right:20px;bottom:20px;z-index:2147482000;pointer-events:none}.dea-launch{pointer-events:auto;float:right;box-shadow:0 4px 18px #0002}.dea-dialog{pointer-events:auto;width:min(440px,calc(100vw - 32px));max-height:calc(100dvh - 100px);overflow:auto;margin-bottom:12px;background:var(--dea-bg);border:1px solid var(--dea-line);border-radius:12px;box-shadow:0 14px 48px #0003;padding:18px}.dea-row{display:flex;align-items:center;gap:10px}.dea-row h2{flex:1}.dea-score{font-size:24px;font-variant-numeric:tabular-nums}.dea-space{margin-top:16px}.dea-form{display:flex;gap:6px;margin:12px 0}.dea-form input{min-width:0;flex:1;padding:7px 9px;border:1px solid var(--dea-line);border-radius:7px;background:var(--dea-bg)}.dea-nav{display:flex;gap:6px;border-bottom:1px solid var(--dea-line);padding-bottom:10px}.dea-nav button[aria-selected=true]{background:#297968;color:#fff;border-color:#297968}.dea-list{list-style:none;padding:0;margin:0}.dea-item{padding:12px 0;border-bottom:1px solid var(--dea-line)}.dea-location{word-break:break-all;font:12px/1.5 ui-monospace,monospace}.dea-fix{color:var(--dea-muted);margin-top:4px!important}.dea-status{margin-left:auto;min-width:65px}.dea-error{padding:9px;border-left:3px solid #ba4d38;background:#ba4d3810;margin:10px 0!important}.dea-note{padding:9px;border-left:3px solid #297968;background:#2979680c}.dea dl{margin:0}.dea dt{color:var(--dea-muted);margin-top:10px}.dea dd{margin:2px 0;white-space:pre-wrap}.dea-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.dea-artifacts{display:grid;gap:12px;margin-top:16px}.dea figure{margin:0}.dea img,.dea video{width:100%;border-radius:6px;border:1px solid var(--dea-line)}.dea-page{max-width:920px;padding:16px}.dea-page .dea-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px}.dea-card{border:1px solid var(--dea-line);border-radius:10px;padding:16px}.dea-badge{font-size:11px;padding:1px 5px;border-radius:4px;background:#29796812;color:var(--dea-text)}
`;
  window.__ModuleLoader__.load({id:ID,factory(require){
    const React=require('react');
    const h=React.createElement;
    const {useState,useEffect,useCallback,useRef}=React;
    async function request(route,body) {
      const response=await fetch(API+route,{credentials:'same-origin',...(body!==undefined?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
      const value=await response.json();
      if(!response.ok) throw new Error(value.error??value.markdown??`请求失败 (${response.status})`);
      return value;
    }
    function useReview(open=true) {
      const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
      const last=useRef('');
      // Polling returns the whole review; skip identical payloads to avoid re-rendering every tick.
      const apply=useCallback(next=>{const raw=JSON.stringify(next);if(raw!==last.current){last.current=raw;setState(next);}},[]);
      const refresh=useCallback(async()=>{apply(await request('/state'));},[apply]);
      useEffect(()=>{
        let alive=true,timer;
        async function tick(){try{const next=await request('/state');if(alive)apply(next);}catch(e){if(alive)setError(e.message);}finally{if(alive)timer=setTimeout(tick,open?2000:8000);}}
        tick();return()=>{alive=false;clearTimeout(timer);};
      },[open,apply]);
      const mutate=async(route,body)=>{setBusy(true);setError('');try{await request(route,body);await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}};
      return {state,error,busy,audit:path=>mutate('/audit',path?{path}:{}),toggle:p=>mutate('/pass',{pass:p.id,status:p.status==='done'?'open':'done'}),clear:()=>mutate('/clear',{})};
    }
    function TargetForm({review}) {
      const [path,setPath]=useState('');
      return h('form',{className:'dea-form',onSubmit:event=>{event.preventDefault();review.audit(path.trim());}},
        h('input',{value:path,onChange:e=>setPath(e.target.value),placeholder:review.state?.target||'输入源码文件或目录的绝对路径','aria-label':'要审查的源码路径'}),
        h('button',{type:'submit',disabled:review.busy||(!path.trim()&&!review.state?.target)},review.busy?'扫描中…':'扫描'));
    }
    function Findings({audit}) {
      if(!audit) return h('p',{className:'dea-muted'},'填写源码路径，开始一次审查。');
      return h('div',null,
        h('p',{className:'dea-note'},'分数越高，触发的静态规则越少。实际设计与交互仍需人工复核。'),
        audit.truncated?h('p',{className:'dea-error'},'已达到扫描限制，结果不完整。'):null,
        (audit.warnings??[]).map((warning,i)=>h('p',{key:i,className:'dea-muted'},warning)),
        !audit.findings.length?h('p',{className:'dea-space'},'未触发规则。请继续检查实际界面。'):null,
        h('ul',{className:'dea-list'},audit.findings.map((f,i)=>h('li',{key:`${f.rule}-${f.file}-${f.line}-${i}`,className:'dea-item'},
          h('div',{className:'dea-row'},h('strong',null,f.title),h('span',{className:'dea-badge'},{high:'优先',medium:'复核',low:'建议',info:'提示'}[f.severity])),
          h('div',{className:'dea-location'},`${f.file}:${f.line}${f.count>1?` · ${f.count} 处`:''}`),h('p',{className:'dea-fix'},f.fix)))),
        audit.totalFindings>audit.findings.length?h('p',{className:'dea-muted'},`显示 ${audit.findings.length}/${audit.totalFindings} 项，请缩小扫描范围。`):null);
    }
    function Direction({direction}) {
      if(!direction)return h('p',{className:'dea-muted'},'扫描后会生成待完善的方向草稿。');
      const labels={product:'产品用途',audience:'使用者',task:'页面任务',keep:'保留约束',changes:'计划调整',acceptance:'验收条件'};
      return h('div',null,direction.draft?h('p',{className:'dea-note'},'草稿：请让助手根据产品和你的要求补全。'):null,
        h('dl',null,Object.entries(labels).map(([key,label])=>h(React.Fragment,{key},h('dt',null,label),h('dd',null,Array.isArray(direction[key])?direction[key].join('\n'):direction[key]||'尚未填写')))));
    }
    function Progress({review}) {
      return h('ul',{className:'dea-list'},(review.state?.passes??[]).map(p=>h('li',{key:p.id,className:'dea-item'},
        h('div',{className:'dea-row'},h('span',null,p.title),h('button',{className:'dea-status',disabled:review.busy,'aria-pressed':p.status==='done',onClick:()=>review.toggle(p)},p.status==='done'?'已完成':p.status==='active'?'进行中':'待处理')),
        p.note?h('p',{className:'dea-muted'},p.note):null)));
    }
    function Artifacts({artifacts}) {
      if(!artifacts)return null;
      return h('div',{className:'dea-artifacts'},['before','after'].flatMap(phase=>(artifacts[phase]??[]).slice(-2).map(file=>h('figure',{key:file},h('img',{src:`${API}/artifact/${encodeURIComponent(file)}`,alt:phase==='before'?'调整前的界面':'调整后的界面',loading:'lazy'}),h('figcaption',{className:'dea-muted'},phase==='before'?'调整前':'调整后')))),
        artifacts.story?h('figure',null,h('video',{src:`${API}/artifact/${encodeURIComponent(artifacts.story)}`,controls:true,playsInline:true}),h('figcaption',{className:'dea-muted'},'阶段演示')):null);
    }
    const Actions=({review})=>h('div',{className:'dea-actions'},h('a',{className:'dea-button',href:API+'/report.md',target:'_blank',rel:'noreferrer'},'打开报告'),h('button',{disabled:review.busy,onClick:review.clear},'清空当前审查'));
    function Panel(){
      const [open,setOpen]=useState(()=>window.location.hash==='#dsh-ui-deai'),[tab,setTab]=useState('findings');
      const review=useReview(open),state=review.state;
      const closeRef=useRef(null),launchRef=useRef(null),wasOpen=useRef(open);
      useEffect(()=>{
        if(wasOpen.current===open) return;
        wasOpen.current=open;
        (open?closeRef.current:launchRef.current)?.focus();
      },[open]);
      useEffect(()=>{const onKey=e=>{if(e.key==='Escape')setOpen(false);};const onHash=()=>{if(window.location.hash==='#dsh-ui-deai')setOpen(true);};window.addEventListener('keydown',onKey);window.addEventListener('hashchange',onHash);return()=>{window.removeEventListener('keydown',onKey);window.removeEventListener('hashchange',onHash);};},[]);
      const trapFocus=event=>{
        if(event.key!=='Tab'||!event.currentTarget) return;
        const nodes=[...event.currentTarget.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')];
        if(!nodes.length) return;
        const first=nodes[0],last=nodes[nodes.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      };
      return h('div',{className:'dea dea-overlay'},open?h('section',{id:'dea-panel',className:'dea-dialog',role:'dialog','aria-modal':'true','aria-labelledby':'dea-title',onKeyDown:trapFocus},
        h('header',{className:'dea-row'},h('h2',{id:'dea-title'},ID),h('span',{className:'dea-score'},state?.audit?`${state.audit.score}`:'—'),h('button',{ref:closeRef,'aria-label':'关闭审查面板',onClick:()=>setOpen(false)},'×')),
        h('p',{className:'dea-muted'},state?.audit?.label??'源码审查与界面改进'),h(TargetForm,{review}),review.error?h('p',{role:'alert',className:'dea-error'},review.error):null,
        h('nav',{className:'dea-nav','aria-label':'审查内容'},[['findings','问题'],['direction','方向'],['progress','进度']].map(([id,label])=>h('button',{key:id,'aria-selected':tab===id,onClick:()=>setTab(id)},label))),
        h('div',{className:'dea-space'},tab==='findings'?h(Findings,{audit:state?.audit}):tab==='direction'?h(Direction,{direction:state?.direction}):h(Progress,{review})),h(Artifacts,{artifacts:state?.artifacts}),h(Actions,{review})):null,
        h('button',{ref:launchRef,className:'dea-launch','aria-expanded':open,'aria-controls':'dea-panel',onClick:()=>setOpen(!open)},ID,state?.audit?` · ${state.audit.score}`:''));
    }
    function SettingsPage(){
      const review=useReview(),state=review.state;
      return h('main',{className:'dea dea-page'},h('h2',null,ID),h('p',{className:'dea-muted'},'定位界面中的模板化表达，记录调整依据与验收结果。'),h(TargetForm,{review}),
        review.error?h('p',{role:'alert',className:'dea-error'},review.error):null,
        h('div',{className:'dea-grid dea-space'},h('section',{className:'dea-card'},h('h3',null,'设计方向'),h(Direction,{direction:state?.direction})),h('section',{className:'dea-card'},h('h3',null,'处理进度'),h(Progress,{review}))),
        h('section',{className:'dea-card dea-space'},h('h3',null,`审查提示${state?.audit?` · ${state.audit.score}/100 · ${state.audit.totalFindings} 项`:''}`),h(Findings,{audit:state?.audit})),h(Artifacts,{artifacts:state?.artifacts}),h(Actions,{review}));
    }
    function apply(ctx){
      document.querySelectorAll(`style[data-plugin="${ID}"]`).forEach(node=>node.remove());
      const style=document.createElement('style');style.dataset.plugin=ID;style.textContent=CSS;document.head.appendChild(style);
      if(ctx.effect)ctx.effect(()=>()=>style.remove());
      ctx.slots.inject('shell.overlay',function*(){yield ctx.slots.register({name:'shell.overlay',id:ID,order:900},Panel);});
      ctx.slots.inject('settings.section',function*(){yield ctx.slots.register({name:'settings.section',id:ID,order:45,label:()=>ID,inject:()=>({})},SettingsPage);});
    }
    return {name:ID,inject:['slots'],apply};
  }});
})();
