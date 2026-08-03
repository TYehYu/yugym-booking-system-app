/* 2026-08-01 使用者指示：「系統內的原生輸入框還有哪邊在使用？」→「可以改動的輸入框 都幫我改掉」
   起因是連續預約的時間欄：iOS 的原生時間滾輪沒有確定鈕，使用者不知道要按哪裡確認。
   原生下拉（select）在手機上自帶「完成」，所以一律改成下拉。
   ⚠ input[type=date] 不改 —— iOS 的日期是行事曆彈窗、點了就選到而且欄位即時更新，
     換成三個下拉反而更難用。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

console.log('全站清乾淨');
{
  // 註解裡也提到 <input type="time">，所以比對要求後面接一個空白（真正的元素一定有屬性）
  const times=(src.match(/<input type="time" /g)||[]).length;
  const months=(src.match(/<input type="month" /g)||[]).length;
  eq('★ 沒有任何 input[type=time] 了', times, 0);
  eq('★ 沒有任何 input[type=month] 了', months, 0);
  ok('　　input[type=date] 刻意保留（行事曆彈窗比三個下拉好用）', (src.match(/<input type="date"/g)||[]).length>0);
  ok('　　理由寫在程式裡', /iOS 的時間滾輪沒有確定鈕，原生下拉才有「完成」/.test(src));
}

console.log('\n① 課程明細的「調整時間」（四種版面共用同一個 id）');
ok('★ 四處都換成下拉', (src.match(/<select id="ed-time">\$\{bkTimeOptions\(b\.start_time,\{noEmpty:1\}\)\}<\/select>/g)||[]).length===4);
ok('★ saveBookingTime 的讀法不用改（select 也有 .value）',
   /const nt=document\.getElementById\('ed-time'\)\.value\.slice\(0,5\);/.test(src));
ok('★ 時間下拉要放得下 08:00（原本時長下拉的 78px 太窄）',
   /\.bkd-timeedit select#ed-time\{max-width:88px;\}/.test(src));

console.log('\n　　⚠ 非 30 分格線的舊資料不能被悄悄改掉');
{
  const fn=new Function(g('function bkTimeOptions(selected, opts){','\n}\n')+'\nreturn bkTimeOptions;')();
  const vals=h=>[...h.matchAll(/value="([^"]*)"/g)].map(m=>m[1]);
  const selOf=h=>{const m=h.match(/value="([^"]*)" selected/); return m?m[1]:null;};

  // 08:00–22:00 每 30 分＝29 格（22:30 不放），加開頭空白列＝30
  eq('★ 一般時間：08:00 起、22:00 止、30 分一格＋開頭的「請選擇時間…」',
     [vals(fn('')).length, vals(fn(''))[0], vals(fn(''))[1], vals(fn('')).slice(-1)[0]], [30,'','08:00','22:00']);
  eq('　　noEmpty 時不要空白列', vals(fn('09:00',{noEmpty:1})).length, 29);
  eq('★ 匯入資料的 20:20 會被保留成一個選項（否則按儲存就被改成 08:00）',
     vals(fn('20:20',{noEmpty:1})).includes('20:20'), true);
  eq('★ 而且是被選中的那個', selOf(fn('20:20',{noEmpty:1})), '20:20');
  eq('　　保留的那筆插在正確的排序位置',
     (()=>{const v=vals(fn('20:20',{noEmpty:1})); return [v[v.indexOf('20:20')-1], v[v.indexOf('20:20')+1]];})(),
     ['20:00','20:30']);
  eq('　　在格線上的就不重複插', vals(fn('20:30',{noEmpty:1})).filter(x=>x==='20:30').length, 1);
  eq('　　13:50、14:50、17:40 這幾筆同樣保得住',
     ['13:50','14:50','17:40'].every(t=>vals(fn(t,{noEmpty:1})).includes(t)), true);
}

console.log('\n② 補登下班時間／補打卡申請（要分鐘精度，改時：分兩個下拉）');
ok('★ 補登下班改用 hmPicker', /<label>下班時間<\/label>\$\{hmPicker\('fix-time',''\)\}/.test(src));
ok('★ 讀值改用 readHM', /const t=readHM\('fix-time'\);/.test(src));
ok('★ 補打卡的上下班都改', /\$\{hmPicker\('pr-in',''\)\}/.test(src) && /\$\{hmPicker\('pr-out',''\)\}/.test(src));
ok('★ 補打卡讀值也改', /const cin=readHM\('pr-in'\);\s*\n\s*const cout=readHM\('pr-out'\);/.test(src));
ok('　　為什麼不用 30 分一格的時段下拉，寫在程式裡', /打卡時間需要「分」的精度（工時要算得準）/.test(src));

{
  const pick=new Function(g('function hmPicker(id, value, opts){','\n}\n')+'\nreturn hmPicker;')();
  const h=pick('t','');
  const hs=h.slice(0,h.indexOf('</select>'));
  eq('★ 小時 00–23 ＋ 一列空白（＝這欄不填）',
     [(hs.match(/<option/g)||[]).length, /value=""/.test(hs), /value="23"/.test(hs)], [25,true,true]);
  eq('★ 分鐘 00–59 每 1 分（打卡不能只有半小時精度）',
     (h.slice(h.indexOf('</select>')).match(/<option/g)||[]).length, 60);
  ok('　　沒帶值時分鐘預設 00（只選小時就是整點）', /value="00" selected/.test(h));
  const h2=pick('t','09:37');
  ok('★ 帶值時兩邊都選好', /value="09" selected/.test(h2) && /value="37" selected/.test(h2));

  const read=new Function('document', g('function readHM(id){','\n}\n')+'\nreturn readHM;');
  const mk=(hv,mv)=>read({getElementById:id=>id.endsWith('-h')?{value:hv}:{value:mv}})('t');
  eq('★ 都選了 → HH:MM', mk('09','37'), '09:37');
  eq('★ 小時沒選 → 空字串（＝這一欄沒填，補打卡允許只填一邊）', mk('','37'), '');
  eq('　　只選小時 → 補 :00', mk('21',''), '21:00');
  eq('　　找不到元素也不會爆',
     read({getElementById:()=>null})('t'), '');
}

console.log('\n③ 月份選擇（薪資列表／出勤統計）');
ok('★ 兩處都改成下拉', (src.match(/<select class="ym-pick"/g)||[]).length===2);
ok('★ 薪資那支仍擋掉未來月份', /monthOptions\(ym, ymd\(TODAY\)\.slice\(0,7\)\)/.test(src));
{
  const fn=new Function('ymd','TODAY', g('function monthOptions(sel, maxYm){','\n}\n')+'\nreturn monthOptions;')(
    ()=> '2026-08-01', null);
  const vals=h=>[...h.matchAll(/value="([^"]*)"/g)].map(m=>m[1]);
  const v=vals(fn('2026-08'));
  eq('★ 由新到舊、含下個月，共 31 個月', [v[0], v[1], v.length], ['2026-09','2026-08',31]);
  eq('★ 跨年往回算得對（2026-08 往前 12 個月＝2025-09）', v[13], '2025-08');
  eq('★ 給了上限就不列未來', vals(fn('2026-08','2026-08'))[0], '2026-08');
  eq('★ 目前看的月份超出範圍時也要留著（不然選單會顯示錯的月份）',
     vals(fn('2023-01','2026-08'))[0], '2023-01');
  ok('　　顯示成「2026年08月」', /2026年08月/.test(fn('2026-08')));
}

/* 2026-08-01 使用者指示：「下拉式輸入框 都可以超過該視窗
   才不會導致該視窗被輸入框的內容放大又縮小」 */
console.log('\n④ 自訂下拉浮在視窗外，不撐大彈窗');
ok('★ 改成 position:fixed（0804 起搬到 body、z-index 10080）',
   /\.mpk-menu\{position:fixed;z-index:10080;display:none;/.test(src)
   && !/\.mpk-menu\{position:absolute;left:0;right:0;top:calc\(100% \+ 4px\);/.test(src));
ok('★ z-index 壓過彈窗（modal 是 300）', /z-index:9600/.test(src));
ok('★ 位置與寬度由 mpkFit 依輸入框座標算', /menu\.style\.left=Math\.round\(r\.left\)\+'px';/.test(src)
   && /menu\.style\.width=Math\.round\(r\.width\)\+'px';/.test(src));
ok('★ 往下開貼下緣、往上開貼上緣',
   /if\(up\)\{ menu\.style\.top='auto'; menu\.style\.bottom=Math\.round\(window\.innerHeight-r\.top\+4\)\+'px'; \}/.test(src)
   && /else  \{ menu\.style\.bottom='auto'; menu\.style\.top=Math\.round\(r\.bottom\+4\)\+'px'; \}/.test(src));
ok('★ bottom 用 window.innerHeight 不是 visualViewport（座標系要一致）',
   /bottom 要用 window\.innerHeight（版面視窗）而不是 vh（視覺視窗）/.test(src));
ok('★ 舊的 .mpk-up 定位規則已移除（改由 JS 設 top/bottom）',
   !/\.mem-pick-row\.mpk-up \.mpk-menu\{top:auto;bottom:calc\(100% \+ 4px\);\}/.test(src));
ok('★ 彈窗捲動時選單要跟著移動（capture 才收得到內層捲動）',
   /document\.addEventListener\('scroll', refit, true\);/.test(src));
ok('　　原因寫在程式裡', /選單一展開就撐高捲動範圍（捲軸忽有忽無、版面跟著跳）/.test(src));

{
  const g2=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  const mkFit=(rect, vh, innerH)=>{
    const menu={style:{},}; const cls=new Set();
    const row={querySelector:sel=>sel==='input'?{getBoundingClientRect:()=>rect,scrollIntoView(){}}:menu,
      classList:{toggle:(c,on)=>{ on?cls.add(c):cls.delete(c); }}};
    const fn=new Function('window','row',
      g2('function mpkFit(row){','\n}\n')+'\nreturn mpkFit;')({visualViewport:{height:vh},innerHeight:innerH});
    fn(row); return {menu, up:cls.has('mpk-up')};
  };
  console.log('\n  定位實跑');
  { const {menu,up}=mkFit({left:20,right:320,width:300,top:200,bottom:236}, 800, 800);
    eq('★ 下方夠寬 → 往下開，貼著輸入框下緣', [up, menu.style.top, menu.style.bottom], [false,'240px','auto']);
    eq('　　左邊與寬度對齊輸入框', [menu.style.left, menu.style.width], ['20px','300px']); }
  { const {menu,up}=mkFit({left:16,right:360,width:344,top:1050,bottom:1086}, 1150, 1990);
    eq('★ 鍵盤升起、下方只剩約 60px → 往上開，bottom 用版面高度算',
       [up, menu.style.bottom, menu.style.top], [true, (1990-1050+4)+'px', 'auto']); }
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
