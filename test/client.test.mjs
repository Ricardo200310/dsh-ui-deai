import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reactRuntime,loadClient} from './runtime.mjs';
const {React,ReactDOM}=reactRuntime();
const {client,components}=loadClient(React);
test('real React renders the floating launcher and nested dialog content',()=>{
  const html=ReactDOM.renderToStaticMarkup(React.createElement(components.get('shell.overlay')));
  assert.ok(html.includes('dsh-ui-deai'));assert.ok(html.includes('源码路径'));assert.ok(html.includes('打开报告'));assert.ok(html.includes('关闭审查面板'));assert.ok(html.includes('设计')||html.includes('方向'));
  assert.ok(html.includes('aria-modal="true"'));assert.ok(html.includes('aria-labelledby="dea-title"'));assert.ok(html.includes('aria-controls="dea-panel"'));
});
test('real React renders the settings page and form',()=>{
  const html=ReactDOM.renderToStaticMarkup(React.createElement(components.get('settings.section')));
  assert.ok(html.includes('设计方向'));assert.ok(html.includes('处理进度'));assert.ok(html.includes('审查提示'));assert.ok(html.includes('<input'));
});
test('browser plugin identity and injected service are consistent',()=>{assert.equal(client.name,'dsh-ui-deai');assert.deepEqual(Array.from(client.inject),['slots']);});
