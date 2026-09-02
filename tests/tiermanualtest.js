/* 2026-08-05 使用者指示：「管理員帳號 幫我設定可以調整會員等級」
   同日二修（附截圖）：「這邊只是這個月升級 但升級降級制度還是要」——
   會員/主顧客的手動調整＝設定「起點」（tier_manual＋tier_manual_at）：
   從設定當月起以該等級照升降規則繼續重播；VIP 才是鎖定。
   會員本人改不了（fn_members_guard 白名單沒有 tier_manual/tier_manual_at）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

console.log('① effTier：VIP 鎖定、regular/loyal 是起點（實跑）');
{
  const env=new Function(`
    const isLegacyMember=m=>!!m.tier_epoch;
    const W={};
    const window=W;
    ${grabFn('effTier')}
    return {effTier,W};`)();
  const fn=env.effTier;
  eq('★ tier_manual=vip → 鎖定 VIP', fn({id:'M1',tier_manual:'vip'}), 'vip');
  eq('★ 快取備妥時 regular/loyal 起點交給重播（吃快取值）',
     (env.W._memberTierCache={__ready:true,M1:'regular'}, fn({id:'M1',tier_manual:'loyal'})), 'regular');
  eq('★ 快取未備妥退 tier_manual（顯示不閃跳）',
     (delete env.W._memberTierCache, fn({id:'M1',tier_manual:'loyal'})), 'loyal');
  eq('　　舊制 level=vip 沒鎖也還是 VIP（回溯相容）', fn({id:'M1',level:'vip'}), 'vip');
}

console.log('\n①b computeMemberTiers：起點接手重播（實跑，假時鐘 2026-08-05）');
{
  /* 2026-08-13 更新：2026-08-11 共享票等級歸屬改版後，computeMemberTiers 內部改查
     window._allTkCache（共享票記在持有人名下）—— 沙箱補 window stub，
     空快取＝退回舊行為（記在上課者名下），以下情境判定不變。 */
  const fn=new Function('window',`
    const TODAY=null; const ymd=()=>'2026-08-05';
    const isLegacyMember=m=>!!m.tier_epoch;
    ${grabFn('_tierBaseOf')}
    ${grabFn('_nextYm')}
    const TIER_EPOCH_YM='2026-07';
    ${grabFn('tierCountsOf')}
    ${grabFn('tierWalkOne')}
    ${grabFn('computeMemberTiers')}
    return computeMemberTiers;`)({});
  // 新客本來是 regular；6 月手動調成主顧客 → 6、7 月都 0 堂 → low=2 仍是主顧客（差 1 個月才降）
  const r1=fn([], [{id:'M1',tier_epoch:false,created_at:'2026-05-01',tier_manual:'loyal',tier_manual_at:'2026-06-03'}]);
  eq('★ 手動調主顧客後 2 個月未達標 → 還是主顧客（制度照走、尚未到 3 個月）', r1.M1, 'loyal');
  // 同上但 5 月調 → 5、6、7 三個完整月 0 堂 → 降回會員
  const r2=fn([], [{id:'M2',tier_epoch:false,created_at:'2026-04-01',tier_manual:'loyal',tier_manual_at:'2026-05-02'}]);
  eq('★ 連 3 個完整月未達標 → 自動降回會員（沒有鎖定）', r2.M2, 'regular');
  /* 2026-09-01：三支收斂成同一份重播 tierWalkOne，手動起點自然只剩一處 */
  ok('　　兩支觀察名單也吃同一個起點（改成共用 tierWalkOne）',
     /* 2026-09-02：兩支都多收一個 tickets（票券改用傳的，見 tierlottotest 最後一段） */
     /function tierDemotionWatchIds\(bookings, members, tickets\)\{/.test(src)
     && /function tierPromotionWatchIds\(bookings, members, tickets\)\{/.test(src)
     && (src.match(/const r=tierWalkOne\(m, byYm, nowYm, _hasM\);/g)||[]).length===2
     && (src.match(/const base=hasM \? _tierBaseOf\(m\) : null;/g)||[]).length===1);
}

console.log('\n② 等級視窗與寫入');
/* 2026-08-05 三修（使用者指示）：「會員等級的手動調整只有管理員帳號可以做」——
   非管理員全部反灰、無儲存鈕；儲存函式再守一層；DB 端 fn_members_guard 連櫃檯的
   等級欄位寫入都擋（實測：櫃檯改 tier_manual 被擋、其他欄位照常、管理員可調）。 */
ok('★ 僅管理員可調（四個選項非管理員全反灰、無儲存鈕）',
   /const isAdm=SESSION&&SESSION\.role==='admin';/.test(src)
   && /row\('regular',TIER_DEFS\.regular,'','手動調整為會員（本月起照升降級規則繼續計算）',!isAdm\)/.test(src)
   && /row\('vip',TIER_DEFS\.vip,'','鎖定 VIP（不受升降級規則影響）',!isAdm\)/.test(src)
   && /\$\{isAdm\?`<button class="btn btn-green" onclick="saveTier\('\$\{member_id\}'\)">儲存等級<\/button>`:''\}/.test(src));
ok('★ 儲存函式擋非管理員', /if\(!\(SESSION&&SESSION\.role==='admin'\)\)\{ showToast\('等級調整僅限管理員帳號'\); return; \}/.test(src));
{
  const f=grabFn('saveTier');
  ok('★ 寫 tier_manual＋tier_manual_at（空值＝恢復自動、一併清起點）',
     /m\.tier_manual=sel\.value\|\|null;/.test(f)
     && /m\.tier_manual_at=sel\.value\?ymd\(TODAY\):null;/.test(f));
  ok('★ 恢復自動時清掉舊制 level=vip（否則 effTier 仍回 VIP）',
     /if\(!sel\.value && m\.level==='vip'\) m\.level='regular';/.test(f));
}

console.log('\n②b 會員資料表頭的等級章可點（2026-08-05 使用者指示，附截圖）');
ok('★ 只有管理員可點開調整視窗（表頭等級章＋會員明細都是）',
   /pp-meta-i\$\{_canTier\?' pp-f-click':''\}[\s\S]{0,60}?openTierModal\('\$\{r\.id\}'\)/.test(src)
   && /const _canTier = !!\(SESSION&&SESSION\.role==='admin'\);/.test(src)
   && /md-title-tier \$\{\(SESSION&&SESSION\.role==='admin'\)\?'md-attr-click':''\}/.test(src));

console.log('\n③ 會員端等級卡跟著反映');
ok('★ VIP 鎖定才顯示「等級由門市設定」；手動起點照常顯示升降進度',
   /const man=\(me\.tier_manual==='vip'\)\?'vip':null;/.test(src)
   && /if\(ti\.manual\)\{\n\s*status=`<div class="mtc-status">等級由門市設定，不受自動升降級規則影響。<\/div>`;/.test(src));
/* 2026-09-01：等級卡改吃共用的 tierWalkOne，手動起點在那一支裡代入（只剩一處） */
ok('★ 等級卡的重播也代入手動起點（改吃共用的 tierWalkOne）',
   /const r=tierWalkOne\(me, byYm, nowYm, true\);/.test(src)
   && /const base=hasM \? _tierBaseOf\(m\) : null;\s*\n\s*if\(base\)\{ cur=base\.ym; state=base\.state; \}/.test(src));

console.log('\n④ migration 留檔');
ok('★ tier_manual／tier_manual_at migration 檔存在',
   fs.existsSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260805_members_tier_manual.sql')
   && /tier_manual_at/.test(fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260805_members_tier_manual.sql','utf8')));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
