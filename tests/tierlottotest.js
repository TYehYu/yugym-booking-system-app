/* 會員等級與抽獎機制綁在一起（2026-07-30 使用者定案）

   兩者本來就在數同一件事：當月「已簽到的教練課（含友善，category=私人教練）」堂數。
   抽獎：floor(堂數 / 4) ＝ 該月可抽次數 → 滿 4 堂就算「完成當月抽獎目標」。
   等級：連續 3 個月完成 → 升主顧客；連續 3 個月未完成 → 降回會員（原本是 2 個月）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
const code=g('function isLegacyMember(m){','\n}\n')+'\n'+g('function _tierBaseOf(m){','\n}\n')+'\n'   // 2026-08-05 手動調整起點
  +g('function computeMemberTiers(','\n}\n')+'\n'
  +g('function _nextYm(ym)','\n')+'\n'+g('function tierDemotionWatchIds(','\n}\n')+'\n'
  +g('function tierPromotionWatchIds(','\n}\n');
// 假設「今天」是 2026-12-01 → 會走訪 2026-07 ~ 2026-11 這 5 個完整月
const api=new Function('ymd','TODAY',code+'\nreturn {computeMemberTiers,tierDemotionWatchIds,tierPromotionWatchIds};')
  (()=>'2026-12', new Date(2026,11,1));
const BK=(mid,ym,n)=>Array.from({length:n},(_,i)=>({member_id:mid,category:'私人教練',status:'checked_in',date:`${ym}-0${(i%9)+1}`}));
const mk=(id,plan)=>Object.entries(plan).flatMap(([ym,n])=>BK(id,ym,n));
const OLD={id:'O',created_at:'2025-01-01',tier_epoch:1};   // 舊系統既有會員 → 從主顧客起算
const NEW={id:'N',created_at:'2026-07-15',tier_epoch:0};   // 新客 → 從會員起算
const tier=(who,plan)=>api.computeMemberTiers(mk(who.id,plan),[who])[who.id];

console.log('抽獎目標與等級判定用同一個數字');
{
  /* 2026-08-03：抽獎機會改成跨月累積（見 lottocarrytest.js），
     earned 的計算搬到 lottoEarnedByMember —— 這裡把兩支一起帶進沙箱。 */
  const grab=n=>{const a=src.indexOf('function '+n+'(');let d=0;
    for(let k=src.indexOf('{',a);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(a,k+1);}}};
  const seg=grab('lottoEarnedByMember')+'\n'+grab('lottoUsedByMember')+'\n'+grab('lottoMapAll');
  const lotto=new Function('lottoVipSet','_lotPuDate',
    "const LOTTO_FROM='2026-07';\n"+seg+'\nreturn lottoMapAll;')(()=>new Set(),p=>p.date||'');
  const bks=BK('A','2026-08',9);
  const m=lotto(bks,[],'2026-08',[]);
  eq('★ 抽獎：9 堂 → 可抽 2 次（floor(9/4)）', m['A'].earned, 2);
  eq('★ 抽獎：3 堂 → 0 次（＝當月沒完成目標）', lotto(BK('A','2026-08',3),[],'2026-08',[])['A'].earned, 0);
  eq('★ 抽獎：剛好 4 堂 → 1 次（＝完成目標）', lotto(BK('A','2026-08',4),[],'2026-08',[])['A'].earned, 1);
  ok('★ 抽獎只算已簽到的教練課，與等級同一個條件',
     /b\.status==='cancelled' \|\| b\.category!=='私人教練'/.test(seg)
     && /b\.status==='checked_in'\|\|b\.status==='completed'/.test(seg));
}

console.log('\n升級：連續 3 個月完成抽獎目標');
eq('★ 新客 8/9/10 各 4 堂 → 升主顧客', tier(NEW,{'2026-08':4,'2026-09':4,'2026-10':4}), 'loyal');
eq('★ 第三個月只有 3 堂 → 不升級', tier(NEW,{'2026-08':4,'2026-09':4,'2026-10':3}), 'regular');
eq('　　中間斷一個月（4/0/4/4）→ 連續中斷，只剩 2 個月不夠',
   tier(NEW,{'2026-08':4,'2026-09':0,'2026-10':4,'2026-11':4}), 'regular');
eq('　　超過 4 堂也算完成（9 堂）', tier(NEW,{'2026-08':9,'2026-09':4,'2026-10':4}), 'loyal');

console.log('\n降級：連續 3 個月未完成（原本 2 個月）');
eq('★ 舊會員連 2 個月未完成 → 還不降（新規則的重點）',
   tier(OLD,{'2026-07':4,'2026-08':4,'2026-09':4}), 'loyal');
eq('★ 舊會員連 3 個月未完成 → 降回會員',
   tier(OLD,{'2026-07':4,'2026-08':4}), 'regular');
eq('　　中間有一個月達標就重新計算',
   tier(OLD,{'2026-07':4,'2026-09':4,'2026-11':4}), 'loyal');

console.log('\n觀察名單');
eq('★ 待降級＝已連 2 個月未完成、本月至今仍 <4',
   api.tierDemotionWatchIds(mk('O',{'2026-07':4,'2026-08':4,'2026-09':4,'2026-12':1})), ['O']);
eq('　　只連 1 個月未完成 → 還不進名單',
   api.tierDemotionWatchIds(mk('O',{'2026-07':4,'2026-08':4,'2026-09':4,'2026-10':4})), []);
eq('★ 待升級＝已連 2 個月完成', api.tierPromotionWatchIds(mk('N',{'2026-10':4,'2026-11':4})), ['N']);

console.log('\n程式碼與文案');
ok('★ 降級門檻四處狀態機都是 3（computeMemberTiers ＋ 兩支觀察名單 ＋ 會員端 memTierInfo），舊的 2 完全不留',
   (src.match(/[^z]low>=3\)/g)||[]).length===4     // 四支狀態機（排除 zlow；2026-08-05 會員端等級卡加入第四支）
   && /zlow>=3\)/.test(src)                        // 無紀錄者的預設值
   && !/low>=2\)/.test(src));
ok('　　完全沒有簽到紀錄的預設值也跟著改', /if\(zs==='loyal'&&zlow>=3\)/.test(src));
ok('★ 等級說明講明與抽獎目標綁在一起',
   /連續 3 個月完成抽獎目標（教練課 4 堂）自動升級；連續 3 個月未完成則降回會員/.test(src));
ok('　　手動設定視窗的說明同步更新',   // 2026-08-05 改寫為 tier_manual 鎖定版說明
   /當月教練課簽到滿 4 堂＝達標，連 3 個月達標升主顧客、連 3 個月未達標降回會員/.test(src));
ok('　　名單視窗標題寫清楚「已連 2 個月」',
   /已連 2 個月完成抽獎目標，本月再達 4 堂即升主顧客/.test(src)
   && /已連 2 個月未完成，本月再未達 4 堂將降回會員/.test(src));
ok('　　首頁待降級副標也標明已連 2 個月', /已連 2 個月未達・本月至今 \$\{n\} 堂/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
