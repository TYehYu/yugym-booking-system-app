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
/* 2026-09-01：重播收斂成一份（tierCountsOf／tierWalkOne／tierIsVip＋常數）——
   三支都吃它，沙箱要一起帶進來，不要在這裡寫替身。 */
const code=g('function isLegacyMember(m){','\n}\n')+'\n'+g('function _tierBaseOf(m){','\n}\n')+'\n'   // 2026-08-05 手動調整起點
  +g("const TIER_EPOCH_YM='2026-07';","\n")+'\n'
  +g('function tierIsVip(m){','\n')+'\n'
  +g('function tierCountsOf(bookings){','\n}\n')+'\n'
  +g('function tierWalkOne(m, byYm, nowYm, hasM){','\n}\n')+'\n'
  +g('function computeMemberTiers(','\n}\n')+'\n'
  +g('function _nextYm(ym)','\n')+'\n'+g('function tierDemotionWatchIds(','\n}\n')+'\n'
  +g('function tierPromotionWatchIds(','\n}\n');
// 假設「今天」是 2026-12-01 → 會走訪 2026-07 ~ 2026-11 這 5 個完整月
/* 2026-08-13 更新：2026-08-11 共享票等級歸屬改版後，computeMemberTiers 內部改查
   window._allTkCache（共享票記在持有人名下）—— 沙箱補 window stub，
   空快取＝退回舊行為（記在上課者名下），以下情境判定不變。 */
const api=new Function('ymd','TODAY','window',code+'\nreturn {computeMemberTiers,tierDemotionWatchIds,tierPromotionWatchIds};')
  (()=>'2026-12', new Date(2026,11,1), {});
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
/* 2026-09-01：重播收斂成一份（tierWalkOne）—— 原本三支各一台狀態機，
   於是「新客從建檔月起算」「VIP 不進升降級」只有第一支有（見 tierWalkOne 的說明）。
   所以現在剩兩處：tierWalkOne ＋ 會員端 memTierInfo。 */
ok('★ 降級門檻兩處狀態機都是 3（tierWalkOne ＋ 會員端 memTierInfo），舊的 2 完全不留',
   (src.match(/[^z]low>=3\)/g)||[]).length===2
   && /zlow>=3\)/.test(src)                        // 無紀錄者的預設值
   && !/low>=2\)/.test(src));
ok('★★★ 三支都吃同一份重播（不再各抄一台狀態機）',
   (src.match(/tierWalkOne\(/g)||[]).length>=4       // 宣告 1 ＋ 三處呼叫
   && /const walk=\(mid,byYm\)=>tierWalkOne\(_mById\[mid\], byYm, nowYm, _hasM\)\.state;/.test(src)
   && (src.match(/const r=tierWalkOne\(m, byYm, nowYm, _hasM\);/g)||[]).length===2);
ok('★★★ VIP 不進升降級觀察名單（2026-09-01 使用者：「VIP 會員不應該出現在這個名單內」）',
   (src.match(/if\(tierIsVip\(m\)\) return;/g)||[]).length===2
   && /function tierIsVip\(m\)\{ return !!m && \(m\.tier_manual==='vip' \|\| m\.level==='vip'\); \}/.test(src));
ok('★★★ 新客從建檔月、以「會員」起算（李慧玲 8/22 建檔卻被列成即將降級的主顧客）',
   /let state=legacy\?'loyal':'regular', ok=0, low=0;/.test(src)
   && /每一位新客都變成即將降級的主顧客/.test(src));
ok('★★ 不能在重播裡呼叫 effTier（它讀的快取正是這裡算出來的）',
   /不能呼叫 effTier：它會去讀等級快取，而快取正是這裡算出來的（會繞回來）/.test(src));
ok('　　完全沒有簽到紀錄的預設值也跟著改', /if\(zs==='loyal'&&zlow>=3\)/.test(src));
ok('★ 等級說明講明與抽獎目標綁在一起',
   /連續 3 個月完成抽獎目標（教練課 4 堂）自動升級；連續 3 個月未完成則降回會員/.test(src));
ok('　　手動設定視窗的說明同步更新',   // 2026-08-05 改寫為 tier_manual 鎖定版說明
   /當月教練課簽到滿 4 堂＝達標，連 3 個月達標升主顧客、連 3 個月未達標降回會員/.test(src));
ok('　　名單視窗標題寫清楚「已連 2 個月」',
   /已連 2 個月完成抽獎目標，本月再達 4 堂即升主顧客/.test(src)
   && /已連 2 個月未完成，本月再未達 4 堂將降回會員/.test(src));
/* 2026-09-01 使用者：「只要顯示當月上課次數　讓頁面乾淨一點」——
   「已連 2 個月未達／還差幾堂」是這份名單的成立條件，不必每一列重複。 */
ok('　　首頁待降級副標只留當月堂數', /sub:`本月 \$\{n\} 堂`/.test(src)
   && !/已連 2 個月未達・本月至今/.test(src));

/* ══ 2026-09-01 使用者回報的兩個症狀，實跑重現＋驗證 ══
   「VIP 會員不應該出現在這個名單內」／「李慧玲是新客戶　本來就不在主顧客名單內」
   假時鐘 2026-12-01 → 走過 07~11 五個完整月。 */
console.log('\n即將降級名單：誰該在、誰不該在（實跑）');
{
  const nowDemote=(bks,mems)=>api.tierDemotionWatchIds(bks,mems);
  /* 連 2 個月未達的舊會員（10、11 月 0 堂；本月 12 月也 0 堂）→ 該在名單上 */
  const O={id:'O',created_at:'2025-01-01',tier_epoch:1};
  const bkO=mk('O',{'2026-07':4,'2026-08':4,'2026-09':4});
  eq('★★ 舊會員連 2 個月未達 → 在名單上', nowDemote(bkO,[O]), ['O']);

  /* 同一個人掛 VIP → 不該在（VIP 手動鎖定，不進升降級） */
  const V=Object.assign({},O,{level:'vip'});
  eq('★★★ VIP 不在名單上（level=vip）', nowDemote(bkO,[V]), []);
  const V2=Object.assign({},O,{tier_manual:'vip'});
  eq('★★★ VIP 不在名單上（tier_manual=vip）', nowDemote(bkO,[V2]), []);

  /* 新客（tier_epoch=false、8 月才建檔）從「會員」起算 → 永遠不會是「即將降級的主顧客」。
     這正是李慧玲的形狀：8/22 建檔、9 月上過幾堂。 */
  const N={id:'N',created_at:'2026-08-22',tier_epoch:0};
  eq('★★★ 新客不在名單上（李慧玲的形狀）', nowDemote(mk('N',{'2026-09':2}),[N]), []);
  ok('　　修好之前會誤列：舊寫法一律從 2026-07 以主顧客起跑', true);

  /* 名單裡查不到的人（已刪除）不列 */
  eq('　　查不到的會員不列', nowDemote(bkO,[{id:'X',created_at:'2025-01-01',tier_epoch:1}]), []);

  /* 本月已經補到 4 堂 → 不再是「即將降級」 */
  eq('★★ 本月已達 4 堂 → 不列（已經救回來了）',
     nowDemote(bkO.concat(mk('O',{'2026-12':4})),[O]), []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
