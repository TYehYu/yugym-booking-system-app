/* 2026-08-01 使用者回報：
   「剛剛用重複預約 選擇的課程只有10堂 但是下方預設的堂數還是12
     這邊預設的堂數要跟著選的票券最大數去調整 除非是待簽約的才預設12」

   成因：步驟 2 畫連續預約框時，帶進去的是「這位會員這類課總共還剩幾堂」（多張票加總），
   真正要扣的是哪一張，要等 refreshBkTicket／使用者點票券卡之後才確定。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

console.log('修法');
ok('★ 有 recurSetMax 這支（換票券時校正上限與預設值）', /function recurSetMax\(prefix, maxN\)\{/.test(src));
ok('★ 只有一張票時就用那張的可約堂數', /recurSetMax\('bk', tkUnlockedLeft\(tk\)\);/.test(src));
ok('★ 多張票時用「目前選中那張」的可約堂數', /recurSetMax\('bk', window\._bkTkCap\[window\._bkTkSel\]\);/.test(src));
ok('★ 點別張票券卡也要跟著換', /recurSetMax\('bk', \(window\._bkTkCap\|\|\{\}\)\[tid\]\);/.test(src));
ok('★ 每張票的可約堂數先建索引', /window\._bkTkCap=Object\.fromEntries\(list\.map\(tk=>\[tk\.id, tkUnlockedLeft\(tk\)\]\)\);/.test(src));
ok('★ 待簽約卡位沒有票可扣 → 維持 12（不帶 maxN）', /\$\{recurBoxHtml\('ph'\)\}/.test(src));
ok('　　團課也不帶（一次排多人、各人餘額不同）', /\$\{recurBoxHtml\('grp'\)\}/.test(src));
ok('★ 標籤不再寫死「最多 12 堂」（會與下面的說明打架）',
   /<label>預約堂數（含第一堂）<\/label>/.test(src) && !/預約堂數（含第一堂，最多 \$\{RECUR_MAX\} 堂）/.test(src));
ok('★ 說明文字抽成共用（兩處才不會漂移）', /function recurCountHint\(prefix, cap\)\{/.test(src));
ok('★ 手動改過的數字不覆蓋，只夾上限',
   /el\.setAttribute\('data-touched','1'\);   \/\/ 手動改過/.test(src)
   && /if\(!touched \|\| cur>cap \|\| cur<1\) el\.value=cap;/.test(src));
ok('　　成因寫在程式裡', /真正要扣的是哪一張要等 refreshBkTicket／使用者點選票券卡之後才確定/.test(src));

console.log('\n實跑 recurSetMax');
{
  const RECUR_MAX=12;
  const mk=()=>{
    const el={_a:{}, value:'12', max:'12',
      getAttribute(k){return this._a[k];}, setAttribute(k,v){this._a[k]=String(v);}};
    el.setAttribute('data-max','12');
    const hint={innerHTML:''};
    const doc={getElementById:id=>id==='bk-count'?el:(id==='bk-count-hint'?hint:null)};
    const fn=new Function('document','RECUR_MAX','recurCountHint',
      g('function recurSetMax(prefix, maxN){','\n}\n')+'\nreturn recurSetMax;')(
      doc, RECUR_MAX, (p,c)=>`cap=${c}`);
    return {el,hint,fn};
  };

  { const {el,hint,fn}=mk(); fn('bk',10);
    eq('★ 票券只剩 10 堂 → 預設與上限都變 10', [el.value, el.max, el.getAttribute('data-max')], [10,10,'10']);
    eq('　　說明也跟著換', hint.innerHTML, 'cap=10'); }

  { const {el,fn}=mk(); fn('bk',20);
    eq('★ 票券剩 20 堂 → 仍以方案上限 12 為準', [el.value, el.max], [12,12]); }

  { const {el,fn}=mk(); fn('bk',0);
    eq('　　沒有票券資訊（待簽約）→ 12', [el.value, el.max], [12,12]); }

  { const {el,fn}=mk();
    el.value='4'; el.setAttribute('data-touched','1');   // 使用者自己打了 4
    fn('bk',10);
    eq('★ 使用者打過的數字不被覆蓋（4 仍是 4，上限變 10）', [el.value, el.max], ['4',10]); }

  { const {el,fn}=mk();
    el.value='12'; el.setAttribute('data-touched','1');  // 打了 12，但換到只剩 3 堂的票
    fn('bk',3);
    eq('★ 手打的數字超過新上限 → 往下夾', [el.value, el.max], [3,3]); }

  { const {el,fn}=mk();
    el.value='0'; el.setAttribute('data-touched','1');
    fn('bk',10);
    eq('　　0 或空值 → 補回上限', [el.value], [10]); }
}

console.log('\n實跑 recurClampCount（送出前的最後防線沒被動壞）');
{
  const RECUR_MAX=12;
  let toast='';
  const mk=(val,dataMax)=>{
    const el={_a:{'data-max':String(dataMax)}, value:String(val),
      getAttribute(k){return this._a[k];}, setAttribute(k,v){this._a[k]=String(v);}};
    const fn=new Function('document','RECUR_MAX','showToast',
      g('function recurClampCount(prefix){','\n}\n')+'\nreturn recurClampCount;')(
      {getElementById:()=>el}, RECUR_MAX, m=>{toast=m;});
    fn('bk'); return el;
  };
  eq('★ 打 20、票剩 10 → 夾成 10', Number(mk(20,10).value), 10);
  ok('　　並告訴他為什麼', /最多只能排 10 堂（可約堂數上限）/.test(toast));
  eq('★ 打 20、沒有票券上限 → 夾成 12', Number(mk(20,0).value), 12);
  eq('　　打 0 → 夾成 1', Number(mk(0,10).value), 1);
  eq('★ 一經手動輸入就標記 touched', mk(5,10).getAttribute('data-touched'), '1');
}

/* 2026-08-01 使用者回報（同一輪）：
   「我剛剛在8/26 20:00選了鄭雅芳的限定票券 連續預約10堂 但系統還是用一般教練課幫我預約」
   查證：那張「限定教練課 1V2」掛在葉隆震名下、鄭雅芳是 shared_with 的共享者。 */
console.log('\n指定的票券要真的被用到（共享票也算）');
ok('★ 改用 tkUsableBy（持有人或共享者皆可用），不再比 member_id',
   /if\(sel && tkUsableBy\(sel,mid\) && sel\.status==='usable' && tkUnlockedLeft\(sel\)>0/.test(src)
   && !/if\(sel && sel\.member_id===mid && sel\.status==='usable' && sel\.sessions_remaining>0/.test(src));
ok('★ 堂數改用 tkUnlockedLeft（分期未開通的不能先約走）', /&& tkUnlockedLeft\(sel\)>0/.test(src));
ok('　　效期與限時段的判斷保留', /\(!sel\.expire_date\|\|sel\.expire_date>=d\) && tkTimeOk\(sel,d,tsv\|\|time\)/.test(src));
ok('　　真實案例寫在程式裡', /票掛在葉隆震名下、鄭雅芳是共享者/.test(src));
ok('★ 每一堂實際扣哪張票要記下來', /results\.push\(\{date:ds,ok:true,held:holdOnly,bkId:bk\.id,tkId:tk\?tk\.id:null,tkName:tk\?\(tk\.plan_name\|\|'票券'\):''\}\);/   /* 2026-08-18 起多帶 bkId（扣課順序挪移用） */.test(src));
ok('　　走 RPC 那條也記', /results\.push\(\{date:ds,ok:true,bkId:rr\.booking_id\|\|null,tkId:tk\?tk\.id:null,tkName:tk\?\(tk\.plan_name\|\|'票券'\):''\}\); \}/.test(src));
ok('★ 換到別張票時在結果視窗明講（不能默默換票）',
   /const _swap=results\.filter\(x=>x\.ok&&!x\.held&&x\.tkId&&selTicketId&&x\.tkId!==selTicketId\);/.test(src)
   && /其中 <b>\$\{_swap\.length\}<\/b> 堂不是扣您指定的那張票/.test(src));

console.log('\n實跑：指定票券的採用判斷');
{
  const decide=(sel, mid, d, opts)=>{
    const o=opts||{};
    const usableBy=(t,m)=>String(t.member_id)===String(m)||(t.shared_with||[]).indexOf(m)>=0;
    const unlocked=t=>{ const r=Number(t.sessions_remaining)||0; if(!t.installment) return r;
      const total=Number(t.sessions_total)||0, un=t.unlocked_sessions!=null?Number(t.unlocked_sessions):total;
      return Math.max(0,Math.min(r,un-Math.max(0,total-r))); };
    const timeOk=o.timeOk!==false;
    return !!(sel && usableBy(sel,mid) && sel.status==='usable' && unlocked(sel)>0
      && (!sel.expire_date||sel.expire_date>=d) && timeOk);
  };
  const YA='MEM-3FAE7833D7F6';
  const 限定={member_id:'MEM-YE', shared_with:[YA], status:'usable', sessions_total:10, sessions_remaining:10, expire_date:null};
  eq('★ 共享票：票掛在別人名下、我是共享者 → 用得到（原本這裡是 false，就是這個 bug）',
     decide(限定, YA, '2026-08-26'), true);
  eq('　　完全無關的人 → 用不到', decide(限定, 'MEM-XX', '2026-08-26'), false);
  eq('　　自己的票當然用得到',
     decide({member_id:YA,status:'usable',sessions_remaining:5,sessions_total:5}, YA, '2026-08-26'), true);
  eq('　　票已用完 → 退回找別張', decide({member_id:YA,status:'usable',sessions_remaining:0}, YA, '2026-08-26'), false);
  eq('　　票已過期（那一天）→ 退回找別張',
     decide({member_id:YA,status:'usable',sessions_remaining:5,expire_date:'2026-08-20'}, YA, '2026-08-26'), false);
  eq('　　分期票未開通的期數不能先約走',
     decide({member_id:YA,status:'usable',sessions_total:12,sessions_remaining:12,unlocked_sessions:4,installment:{count:3,current:1}}, YA, '2026-08-26'), true);
  eq('　　分期票已把開通的堂數排光 → 退回',
     decide({member_id:YA,status:'usable',sessions_total:12,sessions_remaining:8,unlocked_sessions:4,installment:{count:3,current:1}}, YA, '2026-08-26'), false);
  eq('　　限時段票在不符時段的那一天 → 退回', decide(限定, YA, '2026-08-26', {timeOk:false}), false);
}

/* 2026-08-01 使用者回報：「重複預約 右邊選完時間沒有確定的按鈕可以點」 */
console.log('\n每天的時間欄改成下拉（原生時間滾輪沒有確定鈕）');
/* 2026-08-21：逐日時間改用自家挑選器（ashTimeField 產生「按鈕＋隱藏 input」），
   原本的 <select>／input[type=time] 都退場；沿革見 tests/cardstyletest.js。 */
ok('★ 不再用原生 input[type=time] 或 select',
   /ashTimeField\(`\$\{prefix\}-dowt-\$\{v\}`, '', '', `class="\$\{prefix\}-dowt" data-dow="\$\{v\}"`\)/.test(src)
   && !/<input type="time" class="\$\{prefix\}-dowt"/.test(src)
   && !/<select class="\$\{prefix\}-dowt"/.test(src));
ok('　　停用狀態的樣式一併補上', /\.rc-dow input\[type=time\]:disabled,\.rc-dow select:disabled\{/.test(src));
/* 2026-08-21：那段 iOS 說明隨著 <select> 一起退場（現在是自家挑選器，
   本來就有明確的「取消」與點格即選）。改查新的排法說明。 */
ok('　　原因寫在程式裡', /勾了誰、誰的時間才出現在下面那一區/.test(src));
{
  const g3=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  const fn=new Function(g3('function recurTimeOpts(){','\n}\n')+'\nreturn recurTimeOpts;')();
  const vals=[...fn().matchAll(/value="([^"]*)"/g)].map(m=>m[1]);
  eq('★ 第一個是空值（＝同第一堂）', vals[0], '');
  eq('★ 08:00 起、22:00 止、30 分一格', [vals[1], vals[vals.length-1], vals.length], ['08:00','22:00',30]);
  ok('　　讀取端的格式檢查吃得下（HH:MM）', vals.slice(1).every(v=>/^\d{2}:\d{2}$/.test(v)));
}

/* 2026-08-01 使用者回報：「不能只約 4 堂，因為旁邊沒有＋－的按鈕」——
   手機的數字輸入框沒有加減鈕（那是桌機才有），要改數字得叫鍵盤、鍵盤又蓋住半個視窗。 */
console.log('\n堂數欄加上＋－微調');
ok('★ 改成「－ 數字 ＋」三件式', /<div class="rc-count">/.test(src)
   && /<button type="button" class="rc-cbtn" onclick="recurStep\('\$\{prefix\}',-1\)" aria-label="減少一堂">−<\/button>/.test(src)
   && /<button type="button" class="rc-cbtn" onclick="recurStep\('\$\{prefix\}',1\)" aria-label="增加一堂">＋<\/button>/.test(src));
ok('★ 中間仍可直接打字（沒有變成唯讀）', /<input type="number" id="\$\{prefix\}-count" min="1" max="\$\{_m\}" step="1" inputmode="numeric"/.test(src));
ok('★ ＋－ 走同一條夾值邏輯（兩種操作結果一致）',
   /function recurStep\(prefix, d\)\{[\s\S]{0,220}recurClampCount\(prefix\);/.test(src));
ok('　　按了也會標記 touched（之後換票券不覆蓋他調好的數字）',
   /recurClampCount\(prefix\);          \/\/ 內含上限夾值與 data-touched 標記/.test(src));
ok('　　有觸覺回饋，且失敗不影響功能', /try\{ hapticFeedback\(6\); \}catch\(_\)\{\}/.test(src));
ok('★ 隱藏瀏覽器原生的上下箭頭（跟自訂鈕重複）',
   /\.rc-count input::-webkit-outer-spin-button,\.rc-count input::-webkit-inner-spin-button\{-webkit-appearance:none;margin:0;\}/.test(src));
ok('　　按鈕夠大好按（44×44，符合觸控最小尺寸）', /\.rc-cbtn\{flex:0 0 auto;width:44px;height:44px;/.test(src));
ok('　　原因寫在程式裡', /手機上的數字輸入框沒有加減鈕（那是桌機才有）/.test(src));

{
  const g2=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  const mk=(val,dataMax)=>{
    const el={_a:{'data-max':String(dataMax)}, value:String(val),
      getAttribute(k){return this._a[k];}, setAttribute(k,v){this._a[k]=String(v);}};
    const clamp=new Function('document','RECUR_MAX','showToast',
      g2('function recurClampCount(prefix){','\n}\n')+'\nreturn recurClampCount;')(
      {getElementById:()=>el}, 12, ()=>{});
    const step=new Function('document','recurClampCount','hapticFeedback',
      g2('function recurStep(prefix, d){','\n}\n')+'\nreturn recurStep;')(
      {getElementById:()=>el}, clamp, ()=>{});
    return {el, step};
  };
  console.log('\n  ＋－ 實跑');
  { const {el,step}=mk(12,12); step('bk',-1); step('bk',-1);
    eq('★ 從 12 按兩下減 → 10', Number(el.value), 10); }
  { const {el,step}=mk(12,12); for(let i=0;i<8;i++) step('bk',-1);
    eq('★ 一路減到 4（使用者的情境）', Number(el.value), 4); }
  { const {el,step}=mk(1,12); step('bk',-1);
    eq('★ 減到 1 就停（不會變 0 或負數）', Number(el.value), 1); }
  { const {el,step}=mk(10,10); step('bk',1); step('bk',1);
    eq('★ 加不過票券上限', Number(el.value), 10); }
  { const {el,step}=mk(3,12); step('bk',1);
    eq('　　沒有票券上限時最多加到方案上限 12', Number(el.value), 4); }
  { const {el,step}=mk(3,12); step('bk',1);
    eq('★ 按過之後標記 touched（換票券不會覆蓋）', el.getAttribute('data-touched'), '1'); }
  { const {el,step}=mk('',12); step('bk',1);
    eq('　　空值按加 → 變 1', Number(el.value), 1); }
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
