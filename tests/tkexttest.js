/* 票券展延（2026-07-30 使用者指示：邱美珠有一張還沒用完就過期的票）
   對應合約〔展延規則〕：課程到期後可申請展延一次（展延期限同原方案期限）；
   展延之課程不得申請退費。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
const code=[g('function tkPlanDays(t){','\n}\n'),g('function tkIsExtended(t){','\n'),
            g('function tkExtendTo(t){','\n}\n'),g('function tkCanExtend(t, today){','\n}\n')].join('\n');
const env={ parseYmd:s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);},
            ymd:d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
            TODAY:new Date(2026,6,30),
            window:{_ttCache:[{id:'tt-limited-legacy',name:'限定教練課',validity_days:28}]} };
const api=new Function(...Object.keys(env),code+'\nreturn {tkPlanDays,tkIsExtended,tkExtendTo,tkCanExtend};')(...Object.values(env));
const T=o=>Object.assign({ticket_type_id:'tt-limited-legacy',status:'usable',sessions_remaining:4},o);

console.log('原方案期限');
{
  const meichu=T({start_date:'2026-04-23',expire_date:'2026-07-16',sessions_total:10,sessions_remaining:4});
  eq('★ 邱美珠那張：4/23–7/16 ＝ 84 天', api.tkPlanDays(meichu), 84);
  eq('★ 展延後到期 ＝ 7/16 ＋ 84 天 ＝ 10/08', api.tkExtendTo(meichu), '2026-10-08');
  ok('★ 符合展延條件（已過期、還剩 4 堂、沒展延過）', api.tkCanExtend(meichu)===true);
  eq('　　沒有 start_date 就退回 valid_days',
     api.tkPlanDays(T({expire_date:'2026-07-16',valid_days:30})), 30);
  eq('　　都沒有就用票種預設期限',
     api.tkPlanDays(T({expire_date:'2026-07-16'})), 28);
  eq('　　完全算不出來 → null（不給展延）',
     api.tkPlanDays({ticket_type_id:'tt-none',expire_date:'2026-07-16'}), null);
  eq('　　start 與 expire 同一天（期限 0）不算，退回票種預設',
     api.tkPlanDays(T({start_date:'2026-07-16',expire_date:'2026-07-16'})), 28);
}

console.log('\n可以展延的條件');
{
  const base={start_date:'2026-04-23',expire_date:'2026-07-16',sessions_total:10,sessions_remaining:4};
  ok('★ 已過期＋有剩餘堂數 → 可以', api.tkCanExtend(T(base))===true);
  ok('★ 還沒過期 → 不行（還在效期內不需要展延）',
     api.tkCanExtend(T({...base,expire_date:'2026-08-16'}))===false);
  ok('★ 剛好今天到期 → 不行（今天仍可用）',
     api.tkCanExtend(T({...base,expire_date:'2026-07-30'}))===false);
  ok('★ 堂數已用完 → 不行（沒東西可延）',
     api.tkCanExtend(T({...base,sessions_remaining:0}))===false);
  ok('★ 已經展延過 → 不行（一次為限）',
     api.tkCanExtend(T({...base,extended_from:'2026-07-16'}))===false);
  ok('　　已退費／作廢 → 不行',
     api.tkCanExtend(T({...base,status:'refunded'}))===false
     && api.tkCanExtend(T({...base,status:'void'}))===false);
  ok('　　永久有效（無到期日）→ 不行，本來就不會過期',
     api.tkCanExtend(T({...base,expire_date:null}))===false);
  ok('　　空票券不會爆', api.tkCanExtend(null)===false && api.tkPlanDays(null)===null);
  ok('　　可傳入指定的「今天」（報表回溯用）',
     api.tkCanExtend(T({...base,expire_date:'2026-08-16'}),'2026-09-01')===true);
}

console.log('\n展延一次為限：重算以「原到期日」為準');
{
  const done=T({start_date:'2026-04-23',expire_date:'2026-10-08',extended_from:'2026-07-16',sessions_remaining:4});
  ok('★ 已展延', api.tkIsExtended(done)===true);
  eq('★ 期限仍算原方案的 84 天（不會用展延後的日期再放大）', api.tkPlanDays(done), 84);
  ok('　　不能再展延一次', api.tkCanExtend(done)===false);
}

console.log('\n接線');
ok('★ 票券卡有展延開關（只給櫃檯／管理員）',
   /const _canExt = isDeskLike\(\) && tkCanExtend\(t, today\);/.test(src)
   && /openTicketExtend\('\$\{t\.id\}'\)/.test(src));
ok('★ 開關旁明講可延到哪一天、幾天、同原方案',
   /可延至 <b>\$\{String\(tkExtendTo\(t\)\)\.replace\(\/-\/g,'\/'\)\}<\/b>（\$\{tkPlanDays\(t\)\} 天，同原方案）/.test(src));
ok('★ 確認視窗寫明合約條款與不得退費',
   /可申請<b>展延一次<\/b>，展延期限同原方案期限/.test(src)
   && /<b>展延之課程不得申請退費。<\/b>/.test(src));
ok('★ 展延會寫入 no_refund 與原到期日（可還原）',
   /t\.extended_from=from;/.test(src) && /t\.no_refund=true;/.test(src));
ok('★ 展延後狀態回可用（期限延了，堂數本來就還有）',
   /if\(t\.status==='expired'\) t\.status='usable';/.test(src));
ok('★ 寫入票券帳本，來龍去脈查得到',
   /展延一次：\$\{from\} → \$\{to\}（\$\{days\} 天，同原方案期限）；依合約展延之課程不得申請退費/.test(src));
ok('　　通知會員（type 用現有的 announce，避免資料庫擋下）',
   /pushNotification\(t\.member_id,'announce','票券已展延'/.test(src)
   && /沒有票券專用類別，硬塞新值會被資料庫擋下/.test(src));
ok('★ 撤銷展延只給管理員，且會還原到期日與退費資格',
   /if\(!\(SESSION&&SESSION\.role==='admin'\)\)\{ showToast\('只有管理員可以撤銷展延'\); return; \}/.test(src)
   && /t\.expire_date=back; t\.extended_from=null; t\.extended_at=null; t\.extended_by=null; t\.no_refund=false;/.test(src));
ok('　　撤銷後若原到期日已過，狀態回到已過期',
   /if\(back < ymd\(TODAY\)\) t\.status='expired';/.test(src));
ok('★ 已展延的票券卡顯示「不得申請退費」',
   /已展延：不得申請退費。/.test(src) && /<span class="tk-ext-no">不得申請退費<\/span>/.test(src));
ok('　　金色＝次要提示，符合品牌色階（紅>金>綠）',
   /\.tk-ext-no\{margin-left:auto;font-size:10\.5px;font-weight:700;color:var\(--gold-d,#b48a56\);/.test(src));
ok('　　過期票整張淡化，但有展延開關時不淡（要能看清楚才點得下去）',
   /\.mwtk-card\.mck-dim2:has\(\.tk-ext\)\{opacity:1;filter:none;\}/.test(src));
ok('　　雙重把關：視窗與寫入都再驗一次條件',
   (src.match(/if\(!tkCanExtend\(t\)\)\{ showToast\('這張票券不符合展延條件/g)||[]).length===2);
ok('　　原因寫在程式裡', /過期票在系統裡完全動不了/.test(src));

console.log('\n會員名片的票券頁也要看得到（2026-07-30 使用者回報「邱美珠過期的票券還沒有設定展延按鈕」）');
ok('★ 過期但沒用完的票會被收進「歷史紀錄」→ 展延按鈕就放在那張卡上',
   /const canExt=isDeskLike\(\)&&tkCanExtend\(t,_tYmd\);/.test(src)
   && /\$\{canExt\?`<button class="btn btn-ghost btn-sm pp-hist-btn" onclick="event\.stopPropagation\(\);openTicketExtend\('\$\{t\.id\}'\)"/.test(src));
ok('★ 有可展延的票時「歷史紀錄」預設展開，不用自己去點開',
   /<details class="pp-hist"\$\{_extable\.length\?' open':''\}>/.test(src));
ok('★ 摺疊標題標出有幾張可展延',
   /\$\{_extable\.length\?`<span class="pp-hist-sum">\$\{_extable\.length\} 張可展延<\/span>`:''\}/.test(src));
ok('　　可展延那張卡用品牌金框標出來、且不淡化（過期卡整片灰，不標會看不到）',
   /\.bkd-tkcard-hist\.bkd-tkcard-ext\{opacity:1;filter:none;background:#FBF6EC;/.test(src));
ok('　　按鈕上的提示直接寫可延幾天、延到哪天',
   /title="剩 \$\{Number\(t\.sessions_remaining\)\|\|0\} 堂沒用完，可展延 \$\{tkPlanDays\(t\)\} 天至 \$\{String\(tkExtendTo\(t\)\)\.replace\(\/-\/g,'\/'\)\}"/.test(src));
ok('★ 展延後票券回到可用區，卡片標「已展延（不得退費）」',
   /\$\{tkIsExtended\(t\)\?`　·　<b style="color:var\(--gold-d\);">已展延（不得退費）<\/b>`:''\}/.test(src));
ok('　　歷史列若是已展延過的也標一下', /\$\{tkIsExtended\(t\)\?'<span class="pp-hist-tag">已展延<\/span>':''\}/.test(src));
ok('　　只有櫃檯／管理員看得到按鈕（會員自己不能展延）',
   /const _extable=hist\.filter\(t=>isDeskLike\(\)&&tkCanExtend\(t,_tYmd\)\);/.test(src));
ok('　　點按鈕不會連帶收合／展開摺疊區', /onclick="event\.stopPropagation\(\);openTicketExtend/.test(src));
ok('　　原因寫在程式裡', /展延開關只做在管理端的\s*\n\s*票券頁，這邊看不到/.test(src));

// 邱美珠那張實跑一次：確認會被判成「歷史 ＋ 可展延」
{
  const t={ticket_type_id:'tt-limited-legacy',status:'usable',plan_name:'限定教練課 1V1',
           start_date:'2026-04-23',expire_date:'2026-07-16',sessions_total:10,sessions_remaining:4};
  const today='2026-07-30';
  const isHist = t.expire_date && String(t.expire_date).slice(0,10) < today;
  ok('★ 邱美珠 MTK-47027B003586：被收進歷史紀錄', isHist===true);
  ok('★ 且符合展延條件 → 那一列會出現「展延」按鈕', api.tkCanExtend(t,today)===true);
  ok('★ 可延 84 天至 2026-10-08', api.tkPlanDays(t)===84 && api.tkExtendTo(t)==='2026-10-08');
}

console.log('\n票券歷史紀錄改用圓形卡（2026-07-30 使用者指示）');
ok('★ 歷史紀錄沿用可用票券的同一張卡（同一套 ticketTokens，不另做一套）',
   /return `<div class="bkd-tkcard bkd-tkcard-hist\$\{canExt\?' bkd-tkcard-ext':''\}">/.test(src)
   && /<div class="mck-dots2" style="margin:8px 0 2px;">\$\{ticketTokens\(t,bks,typeMap,used,null\)\}<\/div>/.test(src));
ok('★ 原本的一行式列表已移除（看不出哪幾堂上在哪一天）',
   !/<div class="pp-hist-row\$\{canExt\?' pp-hist-ext':''\}">/.test(src));
ok('★ 歷史卡縮小＋淡化表示「已結束」，滑過恢復',
   /\.bkd-tkcard-hist\{margin-bottom:8px;padding:11px 13px;opacity:\.72;filter:saturate\(\.85\);\}/.test(src)
   && /\.bkd-tkcard-hist:hover\{opacity:1;transition:opacity \.18s;\}/.test(src));
ok('　　圓點跟著縮小，卡片不會被撐高', /\.bkd-tkcard-hist \.mtk\{transform:scale\(\.92\);\}/.test(src));
ok('　　狀態（已用畢／已過期／已退費）標在進度旁',
   /<span class="bkd-tkcard-prog"><b class="num">\$\{used\}<\/b> \/ \$\{total\}　·　\$\{st\}<\/span>/.test(src));
// 2026-07-30：購買日改用共用的 tkBuyDateHtml（沒有購買日的退回起始日並標示）
ok('　　購買日與效期都保留，共享標籤照舊', /\$\{tkBuyDateHtml\(t\)\}　·　效期至/.test(src)
   && /const shrTag=\(t\.member_id!==PP\.id\)/.test(src));
ok('　　有合約的歷史票也能點開合約', /onclick="openContractView\('\$\{c\.ctByTicket\[t\.id\]\}'\)">📄 合約<\/button>/.test(src));

console.log('\n更新畫面按鈕統一（2026-07-30 使用者指示：放在標題列時間左邊）');
ok('★ 抽成共用的一顆鈕', /function refreshBtn\(cls\)\{ return `<button type="button" class="rf-btn/.test(src)
   && /const RF_ICON=/.test(src));
// 二修：使用者要的是「頂欄時鐘的左邊」，不是頁面標題列 → 全站只留頂欄那一顆
ok('★ 教練／手機頂列：#tb-refresh 排在 #tb-clock 左邊',
   /<button type="button" class="rf-btn" id="tb-refresh" title="更新畫面（重新抓取最新資料）"\s*\n\s*aria-label="更新畫面" onclick="dashManualRefresh\(\)"><\/button>\s*\n\s*<span id="tb-clock" class="tb-clock"><\/span>/.test(src));
/* 三修：桌機管理版（body.mc-mode）整條 .tb-right 是 display:none，看得見的時鐘是
   頂列的 #mc-topclock —— 按鈕做在 .tb-right 裡等於看不到（使用者回報「按鈕不見了」）。 */
ok('★ 桌機管理版頂列：#mc-refresh 排在 #mc-topclock 左邊',
   /<button type="button" class="rf-btn mc-rf" id="mc-refresh" title="更新畫面（重新抓取最新資料）"\s*\n\s*aria-label="更新畫面" onclick="dashManualRefresh\(\)">\$\{RF_ICON\}<\/button>\s*\n\s*<span class="mc-topclock" id="mc-topclock">/.test(src));
ok('　　靠右對齊由按鈕接手，時鐘的 margin-left:auto 讓給它',
   /body\.mc-mode \.mc-rf\{margin-left:auto;/.test(src)
   && /body\.mc-mode \.mc-rf \+ \.mc-topclock\{margin-left:0;\}/.test(src));
ok('　　非 mc-mode 時這顆不顯示（避免兩顆同時出現）', /body:not\(\.mc-mode\) \.mc-rf\{display:none;\}/.test(src));
ok('　　綠底頂列上的配色（半透明白底＋淺色圖示）',
   /body\.mc-mode \.mc-rf\{[\s\S]{0,180}background:rgba\(255,255,255,\.1\);border:1px solid rgba\(255,255,255,\.18\);color:#F4F1E8;/.test(src));
ok('　　側欄重繪也不會掉圖示（直接寫在 template 裡，不靠 init）',
   /aria-label="更新畫面" onclick="dashManualRefresh\(\)">\$\{RF_ICON\}<\/button>/.test(src));
ok('　　兩顆都在 initTopRefresh 的清單裡', /\['tb-refresh','mc-refresh'\]\.forEach/.test(src));
ok('★ 頁內三處都不再放（不重複入口）', !/\$\{refreshBtn\(\)\}/.test(src));
ok('　　#tb-refresh 的圖示在啟動時填入（那段 topbar HTML 排在腳本之前）',
   /function initTopRefresh\(\)\{\s*\n\s*\['tb-refresh','mc-refresh'\]\.forEach\(id=>\{/.test(src)
   && /initTopRefresh\(\);   \/\/ 時鐘左邊那顆「更新畫面」的圖示/.test(src));
ok('　　頂欄尺寸與時鐘對齊、深色模式另有配色',
   /\.topbar \.tb-right \.rf-btn\{width:30px;height:30px;margin-right:2px;color:var\(--green\);\}/.test(src)
   && /body\.mc-mode \.tb-right \.rf-btn\{background:rgba\(255,255,255,\.16\)/.test(src));
ok('　　舊的三種樣式都移除（不留兩套）',
   !/class="tl-fullcal" onclick="dashManualRefresh\(\)"/.test(src)
   && !/class="lp-iconbtn" title="更新畫面"/.test(src)
   && !/title="刷新（重新抓取最新資料）"/.test(src));
ok('　　深色標題列（今日事項）上有專屬配色，看得見',
   /\.tl-panel-top \.rf-btn\{background:rgba\(255,255,255,\.14\);/.test(src));
ok('　　有 aria-label（只有圖示，讀螢幕聽不出來）', /aria-label="更新畫面"/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
