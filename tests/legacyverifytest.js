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
    grabFn('legacyVerifyCell')+'\nreturn legacyVerifyCell;');
  const run=(m, tier, desk)=>f((x)=>tier, ()=>desk!==false, {_coachNameMap:{c1:'小曾'}}, n=>'#'+n)(m);

  ok('★ 主顧客未核對 → 出現「完成連動」', /完成連動/.test(run({id:'M1'},'loyal')));
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

console.log('\n② 列表上的欄位與進度');
ok('★ 沒有任何主顧客時不多長一欄（其他店別／篩選後）',
   /const _legacyCol = filtered\.some\(m=>effTier\(m\)==='loyal'\);/.test(src)
   && /\.\.\.\(_legacyCol\?\[\{label:'連動核對', width:'1fr', zone:true\}\]:\[\]\),/.test(src));
ok('★ 每一列的格子只在有那一欄時才產出（欄數要對得上）',
   /\.\.\.\(_legacyCol\?\[legacyVerifyCell\(m\)\]:\[\]\),/.test(src));
ok('★ 上方有進度條：已核對 N / 主顧客總數',
   /const _lvDone=_loyal\.filter\(m=>m\.legacy_verified_at\)\.length;/.test(src)
   && /<span class="lv-n"><b>\$\{_lvDone\}<\/b> \/ \$\{_loyal\.length\}<\/span>/.test(src));
ok('　　進度條講清楚主顧客是誰、要核什麼',
   /主顧客＝從舊系統匯入的既有會員；核對「還可以用的票券」新舊是否一致/.test(src));
ok('　　沒有主顧客就不顯示進度條', /const legacyBar=_loyal\.length/.test(src));

console.log('\n③ 核對視窗');
ok('★ 攤開「系統認為還可以用」的票券，讓櫃檯拿去跟舊系統對',
   /const W=buildWallet\(mid, ctx\);/.test(src) && /const act=W\.active\(\);/.test(src));
ok('★ 每一張列出方案、剩餘堂數、效期（那三項就是要對的東西）',
   /剩 <b>\$\{sl\.left\}<\/b> \/ \$\{sl\.total\} 堂\$\{t\.expire_date\?`　·　效期至/.test(src));
ok('★ 也給合計可約堂數（舊系統通常只看得到總數）',
   /可約堂數合計 <b>\$\{W\.sessionsLeft\(\)\}<\/b> 堂/.test(src));
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
