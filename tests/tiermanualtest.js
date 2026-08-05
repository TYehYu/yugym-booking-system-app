/* 2026-08-05 使用者指示：「管理員帳號 幫我設定可以調整會員等級」

   members.tier_manual＝手動鎖定（'regular'|'loyal'|'vip'，null＝自動判定），凌駕自動制。
   管理員四個選項全開；其他員工維持原規則（僅 VIP 有效）。
   會員本人改不了（fn_members_guard 白名單沒有 tier_manual）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

console.log('① effTier：手動鎖定凌駕自動制（實跑）');
{
  const fn=new Function(`
    window={};
    const isLegacyMember=m=>!!m.tier_epoch;
    ${grabFn('effTier')}
    return effTier;`)();
  eq('★ tier_manual=loyal → 主顧客（不看自動）', fn({id:'M1',tier_manual:'loyal'}), 'loyal');
  eq('★ tier_manual=regular → 鎖會員', fn({id:'M1',tier_manual:'regular',level:'vip'}), 'regular');
  eq('★ 舊制 level=vip 沒鎖也還是 VIP（回溯相容）', fn({id:'M1',level:'vip'}), 'vip');
  eq('　　沒鎖 → 走自動（快取未備妥退 level）', fn({id:'M1',level:'loyal',tier_epoch:true}), 'loyal');
  eq('　　tier_manual 亂值不生效', fn({id:'M1',tier_manual:'boss',level:'vip'}), 'vip');
}

console.log('\n② 等級視窗與寫入');
ok('★ 管理員四選項全開、其他員工只有 VIP',
   /const isAdm=SESSION&&SESSION\.role==='admin';/.test(src)
   && /row\('regular',TIER_DEFS\.regular,'','手動鎖定為會員（不再自動升級）',!isAdm\)/.test(src)
   && /row\('loyal',TIER_DEFS\.loyal,'','手動鎖定為主顧客（不再自動降級）',!isAdm\)/.test(src)
   && /row\('vip',TIER_DEFS\.vip,'','手動鎖定為 VIP',false\)/.test(src));
{
  const f=grabFn('saveTier');
  ok('★ 寫 tier_manual（空值＝恢復自動）', /m\.tier_manual=sel\.value\|\|null;/.test(f));
  ok('★ 恢復自動時清掉舊制 level=vip（否則 effTier 仍回 VIP）',
     /if\(!sel\.value && m\.level==='vip'\) m\.level='regular';/.test(f));
}
ok('　　視窗顯示「自動判定會是什麼」（跳過鎖定）', /function effTierAuto\(m\)\{/.test(src));

console.log('\n②b 會員資料表頭的等級章可點（2026-08-05 使用者指示，附截圖）');
ok('★ 櫃檯以上可點開調整視窗、教練與會員本人唯讀',
   /pp-meta-i\$\{_canBase\?' pp-f-click':''\}[\s\S]{0,60}?openTierModal\('\$\{r\.id\}'\)/.test(src));

console.log('\n③ 會員端等級卡跟著反映');
ok('★ 鎖定時提醒改「等級由門市設定」',
   /if\(ti\.manual\)\{\n\s*status=`<div class="mtc-status">等級由門市設定，不受自動升降級規則影響。<\/div>`;/.test(src)
   && /manual:!!man/.test(src));

console.log('\n④ migration 留檔');
ok('★ tier_manual migration 檔存在',
   fs.existsSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260805_members_tier_manual.sql'));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
