/* 連續預約減字（2026-09-30 使用者，定案頁確認後上線）：
   「這邊的文字也太多了」「票券標題放大 副標靠右」

   原本連續預約那一塊說明 5 行、比操作元件還多。
   砍法是「用顯示取代說明」：把最後一堂的日期直接算出來，
   就不必解釋「數的是堂數不是週數、一週勾兩天就是一週消耗 2 堂」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};
const bare=src.replace(/\/\*[\s\S]*?\*\//g,' ');

console.log('① 說明 5 行 → 1 行');
{
  const B=g('function recurBoxHtml(prefix, maxN, opts){','\n}');
  ok('★★★ 開頭那句整句刪（膠囊本身就看得懂要勾）',
     !/勾選要重複的星期（以所選日期為起點）/.test(bare));
  ok('★★★ 三句說明換成「排到哪天」', !/function recurCountHint\(/.test(src)
     && /<div id="\$\{prefix\}-count-hint" class="rc-when-box">\$\{recurWhenHint\(prefix\)\}<\/div>/.test(B));
  ok('★★★ 上限搬到標籤右邊', /<i id="\$\{prefix\}-count-cap">最多 \$\{_m\}<\/i>/.test(B));
  ok('★★ 標籤不再寫「（含第一堂）」（日期寫出來就知道）',
     /\(opts&&opts\.countLabel\)\|\|'預約堂數'\}/.test(B)
     && !/'預約堂數（含第一堂）'/.test(bare));
  ok('★★ 課卡那條仍然自己的標籤（它是往後補排，不含這一堂）',
     /\{countLabel:'往後再排幾堂（不含這一堂）'\}/.test(src));
}

console.log('\n② 排到哪天：算得對');
{
  /* ⚠ 與建立時同一支 buildRecurringDates —— 畫面寫的日期與真的會建立的那幾堂
     必須是同一個計算，不能另外算一份。 */
  const BD=new Function('return '+g('function buildRecurringDates(startDate,dows,maxN,until){','\n}'))
    .call(null);
  ok('★★★ 呼叫的就是 buildRecurringDates', /const list=buildRecurringDates\(start, dows, cnt, null\);/.test(src));

  /* ⚠ recurWhenHint 會呼叫 recurStartOf（起算日；課卡那條要 +1 天）——
     沙箱漏餵它就會被自己的 try/catch 吞成空字串，測試看起來「沒畫」而不是「壞了」。 */
  const F=new Function('document','RECUR_MAX','buildRecurringDates','parseYmd','ymd','addDays','_bkWizard','recurStartOf',
    'return '+g('function recurWhenHint(prefix){','\n}'));
  const mk=(dows,cnt,max,start,on)=>{
    const doc={getElementById:id=>({
      'bk-recurring':{checked:on!==false},
      'bk-count':{value:String(cnt), getAttribute:()=>String(max||0)},
      'bk-date':{value:start},
    })[id]||null,
      querySelectorAll:()=>dows.map(v=>({value:String(v)}))};
    return F(doc, 12,
      new Function('parseYmd','ymd','return '+g('function buildRecurringDates(startDate,dows,maxN,until){','\n}'))
        (s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m?new Date(+m[1],+m[2]-1,+m[3]):null;},
         d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`),
      s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m?new Date(+m[1],+m[2]-1,+m[3]):null;},
      d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      (d,n)=>{const x=new Date(d); x.setDate(x.getDate()+n); return x;}, {},
      p=>String(start||''))('bk');
  };
  /* 2026/10/06 是週二：每週二排 8 堂 → 最後一堂 11/24 */
  ok('★★★ 每週二 8 堂，從 10/06 起 → 排到 11/24',
     /排到<\/span><b>11\/24<\/b>/.test(mk([2],8,12,'2026-10-06')));
  /* 一週勾兩天（二、五）8 堂 → 4 週內排完，10/30 */
  ok('★★★ 一週勾兩天 8 堂 → 10/30（這正是「堂數不是週數」那句話想講的事）',
     /排到<\/span><b>10\/30<\/b>/.test(mk([2,5],8,12,'2026-10-06')));
  ok('★★ 帶星期幾（（一）（二）…）', /（二）/.test(mk([2],8,12,'2026-10-06')));
  ok('★★★ 票券上限會夾住（剩 3 堂就只排到第 3 堂 10/20）',
     /排到<\/span><b>10\/20<\/b>/.test(mk([2],8,3,'2026-10-06')));
  eq('★★★ 沒勾星期 → 提示去勾，不要留空白',
     /勾一個以上的星期/.test(mk([],8,12,'2026-10-06')), true);
  eq('★★ 開關關著就整格不畫', mk([2],8,12,'2026-10-06',false), '');
  eq('★★ 沒有日期也不會爆', mk([2],8,12,''), '');
}

console.log('\n③ 四個會改變結果的動作都重算');
{
  ok('★★★ 勾星期', /function recurDowToggle\(prefix,dow\)\{[\s\S]*?recurWhenSync\(prefix\);/.test(src));
  ok('★★★ 改堂數（＋－與直接輸入都走 recurClampCount）',
     /function recurClampCount\(prefix\)\{[\s\S]*?recurWhenSync\(prefix\);/.test(src));
  ok('★★★ 打開開關', /function toggleRecurBox\(prefix\)\{[\s\S]*?recurWhenSync\(prefix\);/.test(src));
  ok('★★★ 換票券（上限變了，能排到哪天也變了）',
     /function recurSetMax\(prefix, maxN\)\{[\s\S]*?recurWhenSync\(prefix\);/.test(src));
}

console.log('\n④ 課卡那條的起算日是隔天');
{
  const F=new Function('document','parseYmd','ymd','addDays','_bkWizard',
    'return '+g('function recurStartOf(prefix){','\n}'));
  const run=(prefix,val)=>F({getElementById:id=>(id==='amv-d'||id==='bk-date')?{value:val}:null},
    s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m?new Date(+m[1],+m[2]-1,+m[3]):null;},
    d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    (d,n)=>{const x=new Date(d); x.setDate(x.getDate()+n); return x;}, {})(prefix);
  /* ⚠ 課卡是替既有的課往後排，第一堂已經存在 —— 與 amvRunRecur 傳的 startDate 同一條規則。
     不一致的話畫面說「排到 11/24」、實際卻排到 12/01。 */
  eq('★★★ amv 從隔天算起', run('amv','2026-10-06'), '2026-10-07');
  eq('★★★ 建立預約從當天算起', run('bk','2026-10-06'), '2026-10-06');
  ok('★★ 與 amvRunRecur 的規則一致（那邊也是 +1 天）',
     /startDate: ymd\(addDays\(parseYmd\(d\), 1\)\),/.test(src));
}

console.log('\n⑤ 票券卡：標題放大在左、堂數與效期靠右');
{
  ok('★★★ 一列兩欄', /<span class="bk-tk-l">/.test(src) && /<span class="bk-tk-r">/.test(src));
  ok('★★★ 方案名放大', /\.bk-tk-name\{font-size:15\.5px;font-weight:800;/.test(src));
  ok('★★★ 可約堂數自己一行、用數字字體', /\.bk-tk-r b\{display:block;font-size:13px;font-weight:800;color:var\(--text\);font-family:var\(--num\);\}/.test(src));
  ok('★★ 選中時右欄也要變白（不然深底上看不到）',
     /\.bk-tk-card\.on \.bk-tk-r b,\.bk-tk-card\.on \.bk-tk-sub\{color:#fff;\}/.test(src));
  ok('★★ 「待確認」那段換到第二行，不要被擠成第三欄',
     /\.bk-tk-warn-note\{flex:0 0 100%;/.test(src));
  ok('★★ 窄螢幕改成上下排', /@media\(max-width:420px\)\{ \.bk-tk-card\{flex-direction:column;/.test(src));
  ok('★★ 舊的 .bk-tk-top／.bk-tk-meta 已收乾淨（不留死 class）',
     !/bk-tk-top|bk-tk-meta/.test(bare));
}

console.log('\n⑥ 視窗三的複述');
{
  const R=g('function bkRecurRecap(maxN){','\n}');
  ok('★★★ 刪掉「要改請按下方『← 上一步』」（按鈕就在下面三公分處）',
     !/要改請按下方/.test(bare));
  ok('★★★ 加上「排到哪天」，與視窗二同一支計算',
     /const l=buildRecurringDates\(st, rc\.dows, n, null\);/.test(R)
     && /排到 \$\{d\.getMonth\(\)\+1\}\/\$\{d\.getDate\(\)\}/.test(R));
  ok('★★★ 紅字那句留著（系統替你改了數字，不講會被當成算錯）',
     /可用堂數只有 \$\{m\} 堂，已從 \$\{want\} 堂調降。/.test(R));
  ok('★★ 算不出日期就整段不畫，不要寫半句', /return d\?`　<span/.test(R) && /:'';/.test(R));
}

console.log('\n⑦ 自主訓練那句砍半');
{
  ok('★★★ 只留結論', /bkFieldOff\('bk-recur-row', isSelf, '自主訓練不做連續預約'\);/.test(src)
     && !/自主訓練不做連續預約 —— 會員每次來再自己約時段/.test(bare));
  ok('★★ 仍然是淡化不是隱藏（看得見有這個功能，才不會一直找）',
     /bkFieldOff\('bk-recur-row', isSelf,/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
