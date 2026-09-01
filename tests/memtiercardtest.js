/* 2026-08-05 使用者指示：「會員等級顯示在會員端的我的票券上方，移除『我的票券』大字，
   列出升降級規則、目前升級進度跟降級提醒」

   等級卡取代頁首大標；memTierInfo 重播規則與 computeMemberTiers／tier*WatchIds 同源。
   同日追加（附截圖）：課卡彈窗五顆圓鈕一列不折行、新增/取消改實心底色。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

console.log('① 頁面結構');
ok('★ 大標「我的票券」退場、改等級卡開頭',
   /* 2026-08-22：V2 換成 memTierBlockV2（三條進度表），舊版仍是 memTierBlock */
   /C\.innerHTML=\n\s*\(mtkV2\?memTierBlockV2\(tier, usable\.length\):memTierBlock\(tier, usable\.length\)\)\+/.test(src)
   && !/<h1>我的票券<\/h1>/.test(src));
ok('★ 載入本人資料（算 tier_epoch 起點用）', /dbGet\('members',SESSION\.id\)\.catch\(\(\)=>null\)\]\);/.test(src));
/* 2026-08-05 二修（使用者附截圖）：規則不寫「與抽獎目標同一套」、VIP 條目不顯示 */
ok('★ 規則三條（抽獎那句與 VIP 條目退場）',
   /每月教練課簽到滿 <b>4 堂<\/b>＝當月達標<\/div>/.test(src)
   && /「會員」連續 <b>3 個月達標<\/b> → 升「主顧客」/.test(src)
   && /「主顧客」連續 <b>3 個月未達標<\/b> → 調回「會員」/.test(src)
   && !/・VIP 由門市認定/.test(src));
ok('★ 有上課才出現圓點（不畫固定四顆空圈）',
   /const dots=ti\.now>0\?Array\.from\(\{length:ti\.now\},\(\)=>'<i class="mtc-dot on"><\/i>'\)\.join\(''\):'';/.test(src));
ok('★ 升級進度用進度條', /const prog=n=>`<span class="mtc-prog">/.test(src)
   && /升級進度：\$\{prog\(ti\.ok\)\}<b>\$\{ti\.ok\} \/ 3<\/b> 個完整月/.test(src)
   && /\.mtc-prog i\{display:block;height:100%;background:var\(--green\);/.test(src));
ok('★ 警示色階照品牌規則（降級倒數紅、未達標金、良好綠）',
   /\.mtc-danger\{color:var\(--danger,#b5372e\);font-weight:600;\}/.test(src)
   && /\.mtc-warn\{color:var\(--gold-d,#b48a56\);\}/.test(src)
   && /\.mtc-good\{color:var\(--green\);\}/.test(src));

console.log('\n② memTierInfo 實跑（假時鐘 2026-08-05）');
{
  const body=grabFn('memTierInfo');
  /* 2026-09-01：memTierInfo 不再自己跑一台狀態機，改吃 tierCountsOf ＋ tierWalkOne
     （會員看到的等級與後台必然一致）。堂數記在「誰出席」，不再查票券持有人 ——
     所以沙箱也不需要 window._allTkCache 了。兩支都要注入真的那一份。 */
  const mk=new Function('window',`
    const TODAY=null; const ymd=()=>'2026-08-05';
    const isLegacyMember=m=>!!m.tier_epoch;
    const _nextYm=ym=>{let[y,m]=ym.split('-').map(Number);m++;if(m>12){m=1;y++;}return y+'-'+String(m).padStart(2,'0');};
    const TIER_EPOCH_YM='2026-07';
    const _tierBaseOf=()=>null;
    ${grabFn('tierCountsOf')}
    ${grabFn('tierWalkOne')}
    ${body}
    return memTierInfo;`)({});
  const bk=(mid,ym,n)=>Array.from({length:n},(_,i)=>({member_id:mid,status:'checked_in',category:'私人教練',date:ym+'-'+String(i+1).padStart(2,'0')}));
  eq('★ 新客 7 月達標 → 會員、連續 1 個月、本月 2 堂',
     mk({id:'M1',tier_epoch:false,created_at:'2026-06-01'},[...bk('M1','2026-07',4),...bk('M1','2026-08',2)]),
     {state:'regular',ok:1,low:0,now:2,manual:false});
  eq('★ 既有會員 7 月 0 堂 → 主顧客、未達標 1 個月',
     mk({id:'M2',tier_epoch:true},bk('M2','2026-08',1)),
     {state:'loyal',ok:0,low:1,now:1,manual:false});
  eq('★ VIP 凌駕自動制',
     mk({id:'M3',tier_epoch:true,level:'vip'},[]).state, 'vip');
  eq('　　別人的預約不計入（共享池）',
     mk({id:'M4',tier_epoch:false,created_at:'2026-07-01'},bk('OTHER','2026-07',4)),
     {state:'regular',ok:0,low:1,now:0,manual:false});
  eq('　　沒簽到的不算', mk({id:'M5',tier_epoch:true},[{member_id:'M5',status:'booked',category:'私人教練',date:'2026-08-01'}]).now, 0);
}

console.log('\n③ 課卡彈窗圓鈕（同日追加，附截圖）');
/* 2026-08-21 多了 flex:none（標題卡與按鈕列釘住、只捲名單） */
ok('★ 五顆一列不折行＋容器放寬', /#bk-card-pop \.mtp-orbs\{display:flex;justify-content:center;flex-wrap:nowrap;gap:12px;flex:none;\}/.test(src)
   && /max-width:min\(440px,96vw\)/.test(src));
ok('★ 取消／新增改實心底色（跟簽到一樣）',
   /#bk-card-pop \.evo-btn\.evo-danger\{background:var\(--danger,#b5372e\);border-color:var\(--danger,#b5372e\);color:#fff;/.test(src)
   && /#bk-card-pop \.evo-btn\.evo-gold\{background:var\(--gold-d,#b48a56\);border-color:var\(--gold-d,#b48a56\);color:#fff;/.test(src));
ok('　　窄機縮一號保住單列', /@media \(max-width:370px\)\{\n\s*#bk-card-pop \.mtp-orbs\{gap:8px;\}/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
