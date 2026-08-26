/* 一刻鐘格線 ＋ 課卡第二列被切掉（2026-08-26 使用者兩則回報）

   ①「團體課時間可以再多安排一個15分跟45分　讓場地有中場休息的時間」
      挑時間原本只有整點與半點，兩堂團課接在一起場地沒有緩衝。
      ⚠ 為什麼不是只給團體課：0824 建立預約改版之後，視窗一只管「時段與場地」，
        課種要到視窗二才選 —— 挑時間的當下系統還不知道這會是團課。

   ②「桌機的課卡　待簽約下緣被切了一點」
      .evc-sub 是 9.5px、line-height:1.1（＝10.45px），中文字身裝不下，
      而那一列是 overflow:hidden（要靠它做橫向省略號）→ 直接把下緣切掉。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

console.log('① 一份格線，四個地方共用');
ok('★★ BK_MINS 是唯一的來源', /const BK_MINS=\['00','15','30','45'\];/.test(src));
{
  /* 逐一指名，不用次數 —— 註解裡也會提到 BK_MINS，數次數會跟著漂 */
  const sites=[['下拉 bkTimeOptions', /function bkTimeOptions[\s\S]{0,220}for\(const mm of BK_MINS\)/],
               ['連續預約 recurTimeOpts', /function recurTimeOpts[\s\S]{0,180}for\(const mm of BK_MINS\)/],
               ['九宮格 ashTimeList', /function ashTimeList[\s\S]{0,180}for\(const mm of BK_MINS\)/],
               ['滾輪 ashTimeOpen',   /const mins=BK_MINS\.map\(v=>\(\{v,label:v\}\)\);/]];
  eq('★★ 四個挑時間的地方都吃它', sites.filter(([,re])=>!re.test(src)).map(([n])=>n), []);
  ok('★★ 沒有人再自己寫一次 00／30',
     !/for\(const mm of \['00','30'\]\)/.test(src) && !/for\(const m of \['00','30'\]\)\{\s*\n\s*const t=/.test(src));
  ok('　 班表與營業時間仍然是 30 分一格（那是排班，不是排課）',
     /function shiftTimeOptions\(sel\)\{[\s\S]{0,200}for\(const m of \['00','30'\]\)/.test(src));
}

console.log('\n② 下拉：08:00 → 22:00，一刻鐘一格');
{
  const fn=new Function("const BK_MINS=['00','15','30','45'];\n"
    +g('function bkTimeOptions(selected, opts){','\n}\n')+'\nreturn bkTimeOptions;')();
  const vals=h=>[...h.matchAll(/value="([^"]*)"/g)].map(m=>m[1]);
  const L=vals(fn('',{noEmpty:1}));
  eq('★★ 57 格（08:00–21:45 共 14 小時 × 4，再加 22:00）', L.length, 57);
  eq('★ 頭尾對', [L[0], L[1], L[2], L[3], L[4], L[L.length-1]],
     ['08:00','08:15','08:30','08:45','09:00','22:00']);
  ok('★★ 團課接團課排得出「留 15 分鐘中場」的時段', L.includes('11:15') && L.includes('12:15'));
  ok('★ 22:00 之後不再往下（22:15／22:30 不放）', !L.some(t=>t>'22:00'));
  ok('★ 匯入資料那 19 筆非格線時間仍然保得住（進去看一眼不會被悄悄改掉）',
     ['13:50','20:20','17:40'].every(t=>vals(fn(t,{noEmpty:1})).includes(t)));
  eq('　 保留的那筆插在正確位置（現在鄰居是 20:15／20:30）',
     (()=>{const v=vals(fn('20:20',{noEmpty:1})); return [v[v.indexOf('20:20')-1], v[v.indexOf('20:20')+1]];})(),
     ['20:15','20:30']);
}

console.log('\n③ 滾輪（真正在用的那個挑時間視窗）');
{
  const open=g('function ashTimeOpen(id){','\n}\n');
  ok('★★ 分鐘欄直接由 BK_MINS 展開', /const mins=BK_MINS\.map\(v=>\(\{v,label:v\}\)\);/.test(open));
  ok('★★ 開啟時滾到現值那一格，用 indexOf 找（原本寫死 cm===\'30\'?1:0）',
     /const ii=BK_MINS\.indexOf\(cm\);/.test(open) && /ashWheelGo\('i', ii<0\?0:ii\);/.test(open));
  ok('★★ 現值不在格線上（13:50）不會滾到 -1 變空白', /ii<0\?0:ii/.test(open));
  ok('　 小時欄沒被動到（08–22）',
     /const hours=Array\.from\(\{length:15\},\(_,i\)=>\(\{v:i\+8,label:String\(i\+8\)\.padStart\(2,'0'\)\}\)\);/.test(open));
}

console.log('\n④ 連續預約每天的時間要跟第一堂同一套格線');
{
  const fn=new Function("const BK_MINS=['00','15','30','45'];\n"
    +g('function recurTimeOpts(){','\n}\n')+'\nreturn recurTimeOpts;')();
  const vals=[...fn().matchAll(/value="([^"]*)"/g)].map(m=>m[1]);
  eq('★ 空值（同第一堂）＋ 57 格', [vals[0], vals.length], ['',58]);
  ok('★ :15／:45 也在', vals.includes('08:15') && vals.includes('21:45'));
}

console.log('\n⑤ 為什麼不是只給團體課、以及會影響什麼');
ok('★★ 使用者原話寫在原地',
   /團體課時間可以再多安排一個 15 分跟 45 分\s*\n\s*讓場地有中場休息的時間/.test(src));
ok('★★ 「視窗一還不知道課種」寫在原地（下一個人才不會想去加 if 判課種）',
   /0824 建立預約改版之後，視窗一只管「時段與場地」，\s*\n\s*課種是到視窗二才選的/.test(src));
ok('★★ 「拖曳仍然吸附 30 分」的副作用先講清楚',
   /行事曆拖曳仍然吸附 30 分一格（格線是 30 分），\s*\n\s*把 10:15 的課拖走會變成 10:00 或 10:30/.test(src));

console.log('\n⑥ 課卡第二列（待簽約／體驗／待繳費）不要被切下緣');
ok('★★ line-height 放回 1.35（9.5px × 1.1 = 10.45px 裝不下中文字身）',
   /\.cal-ev\.cal-ev-std \.evc-sub\{font-size:9\.5px;font-weight:700;line-height:1\.35;/.test(src));
ok('★ 橫向省略號要留著（overflow:hidden ＋ text-overflow 沒被拿掉）',
   /\.cal-ev\.cal-ev-std \.evc-sub\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;\}/.test(src));
ok('★★ 為什麼不能「只裁橫向」寫在原地（下一個人會想改 overflow-x）',
   /CSS 沒有「只裁橫向」這種寫法\s*\n\s*（overflow 一邊 hidden 另一邊 visible 會被當成 auto）/.test(src));
ok('　 使用者原話寫在原地', /桌機的課卡　待簽約下緣被切了一點/.test(src));
ok('　 7 天檢視／窄卡的 9px 變體沒被動到（行高由上面那條帶下去）',
   /\.cal-ev\.cal-ev-std\.cal-ev-7d \.evc-sub,\.cal-ev\.cal-ev-std\.ev-w-tiny \.evc-sub\{font-size:9px;\}/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
