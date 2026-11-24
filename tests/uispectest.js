'use strict';
/* UI 規格 v1 守門（統一介面第 1 批）：規格區塊只能「新增」，不得改到任何既有樣式。 */
const fs=require('fs'),assert=require('assert/strict');
const src=fs.readFileSync(process.env.INDEX_PATH||require('path').join(__dirname,'../index.html'),'utf8');
const a=src.indexOf('/*UI-SPEC:BEGIN*/'),b=src.indexOf('/*UI-SPEC:END*/');
let n=0;const test=(l,f)=>{f();n++;console.log('✓ '+l);};
test('規格區塊存在且各只出現一次',()=>{assert(a>0&&b>a);assert.equal(src.split('/*UI-SPEC:BEGIN*/').length,2);assert.equal(src.split('/*UI-SPEC:END*/').length,2);});
const css=src.slice(a,b).replace(/\/\*[\s\S]*?\*\//g,'');
// 展開 @media，取出所有選擇器
const sels=[];css.replace(/([^{}@]+)\{[^{}]*\}/g,(m,s)=>{s.split(',').forEach(x=>sels.push(x.trim()));return m;});
test('每個選擇器都只碰 ui- 開頭的名稱（或 :root、.modal:has(.ui-modal)）→ 不影響任何既有畫面',()=>{
  const bad=sels.filter(x=>x&&!(x===':root'||/^\.modal:has\(\.ui-modal\)$/.test(x)||/^\.ui-[a-z0-9_-]+([\s>+~.:\[][^,]*)?$/.test(x)||/^\.ui-/.test(x)));
  assert.deepEqual(bad,[],'非 ui- 選擇器：'+bad.join(' | '));});
test('變數只新增 --ui-*',()=>{const root=css.slice(css.indexOf(':root{'),css.indexOf('}',css.indexOf(':root{')));const vars=[...root.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m=>m[1]);assert(vars.length>30);assert.deepEqual(vars.filter(v=>!v.startsWith('--ui-')),[]);});
test('字級只用階梯（變數或階梯內的值）、圓角只用變數',()=>{
  const fs2=[...css.matchAll(/font-size:\s*([^;}]+)/g)].map(m=>m[1].trim());assert(fs2.every(v=>/^var\(--ui-fs-[1-7]\)$/.test(v)),fs2.filter(v=>!/^var\(--ui-fs/.test(v)).join());
  const rs=[...css.matchAll(/border-radius:\s*([^;}]+)/g)].map(m=>m[1].trim());assert(rs.every(v=>/^var\(--ui-r-/.test(v)),rs.filter(v=>!/^var\(--ui-r-/.test(v)).join());});
test('視窗底部按鈕列不用 .modal-foot（避免手機浮動底欄規則）',()=>assert(!/\.modal-foot/.test(css)));
console.log(n+' passed, 0 failed');
