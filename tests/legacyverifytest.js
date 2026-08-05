/* 2026-08-02 使用者指示：
   「在主顧客新增一個完成連動的按鈕」「讓櫃檯手動確認的，確認新舊資料還可以用的票券是否一樣」
   「A（會員列表每一列）就是目前有從舊資料匯入檔案的這些會員，目前被列成"主顧客"的這些人」

   匯入的餘額是照舊系統匯出檔設的，逐堂的扣課連結多半不存在，所以「帳面對不對」
   只能靠人看。這一欄就是那個人工核對的印章：誰、什麼時候按的「完成連動」。
   純記錄，不影響任何計算。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 只有主顧客那一列出現按鈕');
{
  const f=new Function('effTier','isDeskLike','window','tkNoTag',
    grabFn('needsLegacyVerify')+'\n'+grabFn('legacyVerifyCell')+'\nreturn legacyVerifyCell;');
  const run=(m, tier, desk)=>f((x)=>tier, ()=>desk!==false, {_coachNameMap:{c1:'小曾'}}, n=>'#'+n)(m);

  ok('★ 主顧客未核對 → 出現「完成連動」', /完成連動/.test(run({id:'M1'},'loyal')));
  /* 2026-08-02 使用者：「VIP 也要有連動確認按鈕」—— VIP 同樣是制度起點就在的既有會員，
     原本只列主顧客，VIP 整批漏掉。 */
  ok('★ VIP 也要有（同樣是從舊系統來的既有會員）', /完成連動/.test(run({id:'M3'},'vip')));
  eq('★ 一般會員 → 留白（新客沒有舊資料要核）', run({id:'M2'},'regular'), '');
  ok('★ 已核對 → 變成「✓ 已核對 MM/DD」的記號',
     /✓ 已核對 08\/02/.test(run({id:'M1',legacy_verified_at:'2026-08-02T03:00:00Z'},'loyal')));
  ok('★ 已核對的記號還能點（要取消核對時）',
     /lv-tap/.test(run({id:'M1',legacy_verified_at:'2026-08-02T03:00:00Z'},'loyal'))
     && /openLegacyVerify\('M1'\)/.test(run({id:'M1',legacy_verified_at:'2026-08-02T03:00:00Z'},'loyal')));
  ok('　　滑過去看得到是誰按的、幾點按的',
     /小曾/.test(run({id:'M1',legacy_verified_at:'2026-08-02T03:00:00Z',legacy_verified_by:'c1'},'loyal')));
  eq('★ 教練／會員看得到結果但按不動（未核對時什麼都不顯示）',
     run({id:'M1'},'loyal',false), '');
  ok('　　教練看已核對的仍看得到記號（唯讀）',
     /已核對/.test(run({id:'M1',legacy_verified_at:'2026-08-02T03:00:00Z'},'loyal',false))
     && !/onclick/.test(run({id:'M1',legacy_verified_at:'2026-08-02T03:00:00Z'},'loyal',false)));
  ok('　　點按鈕不會順便開啟會員明細（整列本來就可點）',
     /event\.stopPropagation\(\);openLegacyVerify/.test(run({id:'M1'},'loyal')));
}

console.log('\n①-2 會員資料視窗的右上角也有同一顆');
/* 2026-08-02 使用者指示：「完成連動的按鈕也放在會員資料的視窗上，個人資料的右上」
   —— 核對票券的時候本來就開著這位會員的資料在對，跑回列表按那一格很繞。 */
ok('★ 表頭右上放的是同一顆（共用 legacyVerifyCell，狀態與權限只有一份）',
   /const lvBtn = isM \? legacyVerifyCell\(r\) : '';/.test(src)
   && /: \(isM \? lvBtn : pwBtn\+`<button class="btn btn-ghost btn-sm" onclick="ppEdit\(\)">編輯<\/button>`\);/.test(src));
ok('　　員工的表頭不受影響（重設密碼與編輯照舊）',
   /const pwBtn = \(!isM && r\.phone && SESSION && SESSION\.role==='admin'\)/.test(src));
ok('　　編輯模式時讓位給取消／儲存（不會三顆擠在一起）',
   /const act = PP\.editing\n\s*\? `<button class="btn btn-ghost btn-sm" onclick="ppCancel\(\)">取消<\/button>/.test(src));
ok('★ 在視窗裡按完要就地更新表頭，不然看起來像沒反應',
   /if\(!\(await ppRefreshIfOpen\(mid\)\) && CUR_PAGE==='members'\) navTo\('members'\);/.test(src));
ok('　　ppRefreshIfOpen 會重畫表頭（不只是重載資料）',
   /async function ppRefreshIfOpen\(id\)\{[\s\S]*?ppRenderBody\(\);\n\s*return true;/.test(src));

console.log('\n② 列表上的欄位與進度');
ok('★ 沒有任何要核對的人時不多長一欄（其他店別／篩選後）',
   /const _legacyCol = filtered\.some\(needsLegacyVerify\);/.test(src)
   && /\.\.\.\(_legacyCol\?\[\{label:'連動核對', width:'1fr', zone:true\}\]:\[\]\),/.test(src));
ok('★ 每一列的格子只在有那一欄時才產出（欄數要對得上）',
   /\.\.\.\(_legacyCol\?\[legacyVerifyCell\(m\)\]:\[\]\),/.test(src));
ok('★ 上方有核對進度：已核對 N / 要核對的總數（2026-08-05 改統計卡）',
   /const _loyal=members\.filter\(needsLegacyVerify\);/.test(src)
   && /const _lvDone=_loyal\.filter\(m=>m\.legacy_verified_at\)\.length;/.test(src));
/* 2026-08-05 使用者指示（附截圖）：進度條改成統計卡第五格（上方四大格右邊），
   表格上方少一整列；分子分母同一套（已核對 / 主顧客+VIP 總數）。 */
ok('　　核對進度＝統計卡第五格（有主顧客才出現）',
   /\.\.\.\(_loyal\.length\?\[\{label:'新舊系統票券核對', value:_lvDone, unit:`\/ \$\{_loyal\.length\}`\}\]:\[\]\),/.test(src));
ok('　　判斷抽成一支，三個地方共用（欄位、格子、統計卡）',
   /function needsLegacyVerify\(m\)\{ const t=effTier\(m\); return t==='loyal'\|\|t==='vip'; \}/.test(src)
   && (src.match(/needsLegacyVerify/g)||[]).length>=4);

console.log('\n③ 核對視窗');
ok('★ 攤開「系統認為還可以用」的票券，讓櫃檯拿去跟舊系統對',
   /const W=buildWallet\(mid, ctx\);/.test(src) && /const act=W\.active\(\);/.test(src));
/* 2026-08-02 使用者回報（附截圖）：「連動資料的時候我發現票券這樣顯示會以為用完了，
   改成 1/9/10 已預約/已銷課/總堂數，紅色/金色/綠色」——
   原本只寫「剩 0 / 10 堂」，那個 0 是「還能再約幾堂」，不是「這張票沒了」。 */
/* 2026-08-02 三修（使用者附截圖）：「排列一下，這樣不好閱讀」——
   原本票號＋方案名擠一格、右邊接一長串數字＋圖例，方案名一長就換行，
   每列的數字位置都不一樣；「已預約／已銷課／總堂數」十個字還每列重複一次。 */
ok('★ 每一張列出票號、方案、三個數字、效期，各自一欄',
   /<span class="lv-r-no">\$\{tkNoTag\(sl\.no\)\}<\/span>/.test(src)
   && /<span class="lv-r-n">\$\{t\.plan_name\|\|'票券'\}<\/span>/.test(src)
   && /<span class="lv-r-m">\$\{tkCountTriple\(sl,true\)\}<\/span>/.test(src)
   && /<span class="lv-r-e">\$\{t\.expire_date\?String\(t\.expire_date\)\.slice\(0,10\)/.test(src));
ok('★ 逐列對齊（固定欄寬，不是 space-between）',
   /\.lv-head,\.lv-row\{display:grid;grid-template-columns:46px minmax\(0,1fr\) 104px 96px;/.test(src));
ok('★ 圖例只在表頭出現一次，不逐列重複',
   /<div class="lv-head">/.test(src)
   && /noLegend\?'':`<em>已預約／已銷課／總堂數<\/em>`/.test(src));
ok('　　表頭的圖例沿用同一組顏色（紅金綠），對得上下面的數字',
   /<i class="tk3-b">已預約<\/i>\/<i class="tk3-u">已銷課<\/i>\/<i class="tk3-t">總堂數<\/i>/.test(src));
ok('　　數字等寬，直向對得齊', /font-variant-numeric:tabular-nums;/.test(src));
ok('　　方案名可以換行，但不會推動其他欄位',
   /\.lv-r-n\{[^}]*word-break:break-word;\}/.test(src));
ok('　　窄螢幕收掉效期那欄（寧可少一欄，也不要擠成一團）',
   /\.lv-head>span:last-child,\.lv-r-e\{display:none;\}/.test(src));
ok('　　為什麼把圖例移到表頭，寫在程式裡',
   /逐列再寫十個字只是噪音/.test(src));
ok('★ 也給合計可約堂數（舊系統通常只看得到總數）',
   /可約堂數合計 <b>\$\{W\.sessionsLeft\(\)\}<\/b> 堂/.test(src));

console.log('\n③-2 三個數字：已預約／已銷課／總堂數');
{
  const f=new Function(grabFn('tkCountTriple')+'\nreturn tkCountTriple;')();
  const h=f({pending:1, used:9, total:10});
  const nums=[...h.matchAll(/<b class="tk3-(\w)">(\d+)<\/b>/g)].map(m=>[m[1],m[2]]);
  eq('★ 順序與數字：已預約 1 ／已銷課 9 ／總堂數 10', nums, [['b','1'],['u','9'],['t','10']]);
  ok('★ 顏色：已預約紅、已銷課金、總堂數綠（品牌強度 紅>金>綠）',
     /\.tk3-b\{color:var\(--danger,#b5372e\);\}/.test(src)
     && /\.tk3-u\{color:var\(--gold-d,#b48a56\);\}/.test(src)
     && /\.tk3-t\{color:var\(--green,#1f6f54\);\}/.test(src));
  ok('★ 數字旁邊寫明是哪三個（不然 1/9/10 看不懂）', /已預約／已銷課／總堂數/.test(h));
  ok('　　滑過去有完整說明', /已預約 1 堂（約了還沒上）/.test(h));
  eq('　　欄位缺值時當 0，不會印出 NaN',
     [...f({}).matchAll(/<b class="tk3-\w">(\d+)<\/b>/g)].map(m=>m[1]), ['0','0','0']);
  ok('　　為什麼要攤成三個數字，寫在程式裡',
     /只寫「剩 N」會被讀成「這張票沒了」——約走還沒上的那幾堂其實還在票上。/.test(src));
}
ok('★ 講明白這個記號的意思，避免變成「按過就算對」',
   /不一致的話先在票券頁修正，不要直接按 —— 這個記號只代表「有人看過而且對得上」。/.test(src));
ok('★ 核過的可以取消（按錯要收得回來）',
   /<button class="btn btn-ghost" style="color:var\(--danger\);" onclick="saveLegacyVerify\('\$\{mid\}',false\)">取消核對<\/button>/.test(src));
ok('　　沒有可用票券時給空狀態，不是空白視窗', /系統裡目前沒有還能用的票券/.test(src));
ok('　　只有管理員／櫃台能開', /if\(!isDeskLike\(\)\)\{ showToast\('只有管理員或櫃台可以核對'\); return; \}/.test(src));

console.log('\n④ 實跑：存檔');
{
  const i=src.indexOf('async function _saveLegacyVerify(mid, on){');
  const body=src.slice(i, src.indexOf('\n}\n', i)+3);
  const run=async(on, m0)=>{
    const put=[]; const toasts=[];
    const env={ dbGet:async()=>JSON.parse(JSON.stringify(m0)), dbPut:async(_t,o)=>{put.push(o);},
      closeModal:()=>{}, showToast:t=>toasts.push(t), navTo:()=>{}, CUR_PAGE:'members',
      SESSION:{id:'staff9'}, Date: class extends Date { constructor(){ super('2026-08-02T05:00:00Z'); } } };
    const f=new Function(...Object.keys(env), body+'\nreturn _saveLegacyVerify;')(...Object.values(env));
    await f('M1', on);
    return {put, toasts};
  };
  (async()=>{
    let r=await run(true,{id:'M1',name:'王小明'});
    ok('★ 按下完成連動 → 記下時間與經手人',
       !!r.put[0].legacy_verified_at && r.put[0].legacy_verified_by==='staff9', r.put[0]);
    ok('　　吐司帶會員名字（一次核很多人時知道剛按的是誰）', /王小明/.test(r.toasts.join('')));

    r=await run(false,{id:'M1',name:'王小明',legacy_verified_at:'2026-08-02T03:00:00Z',legacy_verified_by:'staff1'});
    eq('★ 取消核對 → 兩個欄位都清掉（不留半截）',
       [r.put[0].legacy_verified_at, r.put[0].legacy_verified_by], [null,null]);
    ok('　　存檔上了防連點鎖', /async function saveLegacyVerify\(mid, on\)\{ return onceAct\('lv:'\+mid, \(\)=>_saveLegacyVerify\(mid,on\)\); \}/.test(src));

    console.log(`\n${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  })();
}
