/* 2026-08-03 使用者指示（統一搜尋列提議的定案）：
   「方便的地方改成輸入名字下面就會做出篩選」＋「購買審核的發票按鈕收掉」

   盤點後全站的會員選擇器（銷售/發券/團課名單/快速預約/票券共享/會員列表/員工列表）
   本來就都有即時篩選；缺的是兩個會越長越長的名單 —— 抽獎登記（機會跨月保留）與
   待辦名單視窗（收款提醒/降級）。補上「就地隱藏」式篩選：不重繪視窗，輸入框不失焦。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 篩選（沙箱實跑 tdlFilter）');
{
  const cells=[
    {nm:'陳蘭馨', display:''}, {nm:'游晴雅', display:''},
  ].map(c=>({style:{display:''}, querySelector:sel=>sel==='.tdl-cell-nm'?{textContent:c.nm}:null, _nm:c.nm}));
  const grp={style:{display:''}, querySelectorAll:sel=>sel==='.tdl-cell'?cells:[]};
  const doc={querySelectorAll:sel=>sel==='.tdl-cell'?cells:(sel==='.tdl-tg'?[grp]:[])};
  const f=new Function('document','return '+grabFn('tdlFilter'))(doc);
  f('蘭');
  ok('★ 命中的留著、沒中的藏起來', cells[0].style.display==='' && cells[1].style.display==='none');
  ok('★ 組內還有人 → 時間組保留', grp.style.display==='');
  f('');
  ok('★ 清空 → 全部回來', cells.every(c=>c.style.display==='') && grp.style.display==='');
  f('查無此人');
  ok('★ 全滅 → 整組（含時間標）一起藏', cells.every(c=>c.style.display==='none') && grp.style.display==='none');
}

console.log('\n② 兩個名單都掛上（8 人以上才顯示，短名單不佔位）');
ok('★ 抽獎登記', /\$\{list\.length>=8\?`<input class="ms-search"[^`]*oninput="lotFilter\(this\.value\)"/.test(src)
   && /function lotFilter\(q\)\{/.test(src));
ok('★ 待辦名單視窗（收款提醒/降級共用）',
   /\$\{\(L\.items\|\|\[\]\)\.length>=8\?`<input class="ms-search"[^`]*oninput="tdlFilter\(this\.value\)"/.test(src));
ok('　　為什麼用隱藏不用重繪，寫在程式裡', /用隱藏而非重繪：重繪會讓輸入框失焦。/.test(src));

console.log('\n③ 購買審核發票按鈕收掉');
ok('★ 待審核只剩 核准發券／取消／查看合約',
   /onclick="appInvoice\('\$\{a\.id\}','none'\)">核准發券<\/button>/.test(src)
   && !/appInvoice\('\$\{a\.id\}','cloud'\)/.test(src)
   && !/appInvoice\('\$\{a\.id\}','paper'\)/.test(src));
ok('★ invoicing 歷史分支保留（卡住的舊申請仍能完成）', /appCompleteInvoice\('\$\{a\.id\}'\)/.test(src));
ok('　　理由寫在程式裡', /發票按鈕收掉（2026-08-03 使用者指示；發票尚未串聯/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
