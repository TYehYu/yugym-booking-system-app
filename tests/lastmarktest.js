/* 「最後一堂」驚嘆號的判定（2026-07-30 使用者回報）
   ・蔡佳音 8/10 是這張票的最後一堂，卻沒標
   ・楊慧淳 8/11 還不是最後一堂，卻標了
   兩個都源自同一件事：原本用 sessions_remaining ≤ 2 當觸發，而那個數字有兩種口徑
   （匯入票有的把「已預約未上」預扣了、有的沒有）。改用口徑無關的
   「還沒排的堂數 = 總堂數 − 已核銷 − 已預約」＝0 才算最後一堂。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('程式碼');
ok('★ 不再用 sessions_remaining ≤ 2 當觸發',
   !/const remain = tk\.sessions_remaining!=null \? tk\.sessions_remaining : \(tk\.sessions_total\|\|0\);\s*\n\s*if\(remain>2\) return;/.test(src));
ok('★ 改算「還沒排的堂數」＝總 − 已核銷 − 已預約',
   /const _done=tkAll\.filter\(x=>x\.status==='checked_in'\|\|x\.status==='completed'\)\.length;/.test(src)
   && /const _ahead=tkAll\.length-_done;/.test(src)
   && /const _byLink=_total-_done-_ahead;/.test(src));
/* 2026-08-01 使用者回報：謝郁沁 8/01、周士賢 8/01 都是最後一堂卻沒標 ——
   連結法假設「用掉的每一堂都連上 ticket_id」，但舊系統匯入的票有一部分課從未匯入。 */
ok('★ 連結法之外再加「餘額法」，取兩者較小者',
   /const _byBal=Number\.isFinite\(_remRaw\) \? _remRaw : Infinity;/.test(src)
   && /if\(Math\.min\(_byLink,_byBal\) > 0\) return;/.test(src));
ok('★ 餘額用原始值，不再減已預約（減了會把楊慧淳案例又標錯）',
   /不可再減 _ahead/.test(src));
ok('★ sessions_remaining 為 null 不能當成 0（Number\(null\)===0 會全部誤標）',
   /const _remRaw=\(tk\.sessions_remaining==null\|\|tk\.sessions_remaining===''\) \? NaN : Number\(tk\.sessions_remaining\);/.test(src));
ok('　　兩個案例寫在程式裡', /謝郁沁 8 堂票，連得上的只有 7 堂/.test(src) && /周士賢 8 堂票，連得上的只有 1 堂/.test(src));
ok('　　沒有總堂數的票不判定（避免亂標）', /if\(!\(_total>0\)\) return;/.test(src));
ok('　　超約（負數）仍標最後那堂', /if\(Math\.min\(_byLink,_byBal\) > 0\) return;/.test(src));
ok('　　標的是「已排預約中時間最晚那堂」', /const lastBk = tkAll\[tkAll\.length-1\];/.test(src));
ok('　　已續約／不續約的分流沒被動到',
   /if\(done\)\{ window\._renewDoneBk\[lastBk\.id\]=true; return; \}/.test(src)
   && /if\(tk\.renew_status==='declined'\)\{ window\._renewNoBk\[lastBk\.id\]=true; return; \}/.test(src));
ok('　　自主訓練／體驗仍不做續約提醒', /if\(_isSelfOrTrial\) return;/.test(src));
ok('　　兩個案例都寫在程式裡', /蔡佳音 8 堂票已核銷 5、已排 3/.test(src) && /楊慧淳 4 堂票已核銷 0、只排了 2/.test(src));

// 實跑：把判定段抽出來跑兩個真實案例
console.log('\n實跑兩個案例');
{
  /* 與 index.html 同一套：連結法 A 與餘額法 B 取較小者（2026-08-01） */
  const decide=(total, bks, remaining)=>{
    const done=bks.filter(x=>x.status==='checked_in'||x.status==='completed').length;
    const ahead=bks.length-done;
    if(!(total>0)) return null;
    const byLink=total-done-ahead;
    const r=(remaining==null||remaining==='')?NaN:Number(remaining);
    const byBal=Number.isFinite(r)?r:Infinity;
    if(Math.min(byLink,byBal)>0) return null;
    return bks[bks.length-1] ? bks[bks.length-1].date : null;
  };
  const D=(date,status)=>({date,status});
  // 蔡佳音：8 堂，已核銷 5（7/08 7/13 7/17 7/27 7/29），已排 3（8/03 8/05 8/10）
  const chia=[D('2026-07-08','completed'),D('2026-07-13','checked_in'),D('2026-07-17','checked_in'),
              D('2026-07-27','checked_in'),D('2026-07-29','checked_in'),
              D('2026-08-03','booked'),D('2026-08-05','booked'),D('2026-08-10','booked')];
  eq('★ 蔡佳音（8 堂・已核銷 5・已排 3）→ 標 8/10', decide(8,chia), '2026-08-10');
  // 楊慧淳：4 堂，已核銷 0，只排 2（8/04 8/11）→ 還有 2 堂可約
  const hui=[D('2026-08-04','booked'),D('2026-08-11','booked')];
  eq('★ 楊慧淳（4 堂・已核銷 0・只排 2）→ 不標', decide(4,hui), null);
  eq('　　她再排滿 4 堂後才標最後那堂',
     decide(4,hui.concat([D('2026-08-18','booked'),D('2026-08-25','booked')])), '2026-08-25');
  eq('　　8/12 還在時（9 筆＝超約）也標最後那堂',
     decide(8,chia.concat([D('2026-08-12','booked')])), '2026-08-12');
  eq('　　完全沒排課的票不標', decide(4,[]), null);
  eq('　　總堂數為 0 的票不判定', decide(0,hui), null);
  eq('　　全部上完（沒有未來預約）→ 標最後上的那堂',
     decide(2,[D('2026-07-01','completed'),D('2026-07-08','completed')]), '2026-07-08');
  // 舊案例在「不知道餘額」時（第三個參數不給）行為必須不變
  eq('　　沒有餘額欄時 → 只看連結法（蔡佳音仍標）', decide(8,chia,null), '2026-08-10');
  eq('　　沒有餘額欄時 → 只看連結法（楊慧淳仍不標）', decide(4,hui,null), null);
}

/* 2026-08-01 使用者回報：「今天有兩課卡最後一堂沒有跳驚嘆號 謝郁沁跟周士賢」
   兩人的票都是舊系統匯入，用掉的課有一部分沒進正式庫 → 連結法虛胖、餘額法才對。 */
console.log('\n實跑 0801 兩個案例（連結有缺漏）');
{
  const D=(date,status)=>({date,status});
  const decide=(total, bks, remaining)=>{
    const done=bks.filter(x=>x.status==='checked_in'||x.status==='completed').length;
    const ahead=bks.length-done;
    if(!(total>0)) return null;
    const byLink=total-done-ahead;
    const r=(remaining==null||remaining==='')?NaN:Number(remaining);
    const byBal=Number.isFinite(r)?r:Infinity;
    if(Math.min(byLink,byBal)>0) return null;
    return bks[bks.length-1] ? bks[bks.length-1].date : null;
  };
  // 謝郁沁：8 堂票，連得上 7 堂（已上 6 + 已排 8/01），票上餘額 0
  const yu=[...Array(6)].map((_,i)=>D('2026-07-0'+(i+1),'checked_in')).concat([D('2026-08-01','booked')]);
  eq('★ 謝郁沁（連結法說剩 1、餘額 0）→ 標 8/01', decide(8,yu,0), '2026-08-01');
  eq('　　只看連結法會漏掉（這就是原本的 bug）', decide(8,yu,null), null);
  // 周士賢：8 堂票，連得上只有 1 堂，餘額 0
  const shi=[D('2026-08-01','booked')];
  eq('★ 周士賢（連結法說剩 7、餘額 0）→ 標 8/01', decide(8,shi,0), '2026-08-01');
  eq('　　只看連結法會漏掉', decide(8,shi,null), null);
  // 反向保護：餘額還有的不能因為連結法為 0 就漏標，也不能因為餘額而誤標
  eq('　　餘額還有 5、但連結法已排滿 → 仍標（連結法為準）',
     decide(3,[D('2026-08-02','booked'),D('2026-08-09','booked'),D('2026-08-16','booked')],5), '2026-08-16');
  eq('　　餘額 0 但完全沒排課 → 不標（沒有可標的那一堂）', decide(8,[],0), null);
}

/* 2026-08-01 使用者指示：「這繳費提醒的功能也要在首頁的課卡顯示」 */
console.log('\n首頁課卡也要有繳費／續約提醒（2026-08-01）');
ok('★ 首頁先算好標記（同一支 computeLastBkMarks，判準不漂移）',
   /try\{ computeLastBkMarks\(mtickets\|\|\[\], bookings\|\|\[\], typeMap\|\|\{\}\); \}catch\(_\)\{\}/.test(src));
ok('★ 首頁課卡（tcard）掛上 bkRenewBadge 角標',
   /const _mk = bkRenewBadge\(\{\s*\n\s*done:\(window\._renewDoneBk&&window\._renewDoneBk\[b\.id\]\),/.test(src)
   && /<span class="t3-top">\$\{_mk\}<span class="tcard-time">/.test(src));
/* ★★★ 2026-09-03 使用者附截圖：畫面上看到「10:0✓」「18:!」——
   .ev-payalert 是為行事曆課卡寫的（絕對定位在卡片右上角，那裡沒有別的東西），
   但首頁課卡的**時間就在右上角**，徽章正好蓋住最後一位數字。
   時間是課卡上最要緊的資訊之一，不能被遮。改成同一列並排。 */
ok('★★★ 首頁課卡的徽章不再絕對定位（會蓋住時間）',
   /\.tcard-3c \.ev-payalert\{position:static;top:auto;right:auto;width:14px;height:14px;/.test(src)
   && /\.tcard-3c \.t3-top\{display:inline-flex;align-items:center;gap:4px;min-width:0;\}/.test(src));
ok('★★ 行事曆那邊維持原樣（只覆寫首頁這一種）',
   /\.ev-payalert\{position:absolute;top:2px;right:3px;left:auto;z-index:4;/.test(src)
   && /行事曆那邊維持原樣（見 \.ev-payalert 本體），只覆寫首頁這一種/.test(src));
ok('　　四種狀態都吃：已續約✓／不續約✕／整張最後一堂!／分期本期最後一堂!',
   /no:\(window\._renewNoBk&&window\._renewNoBk\[b\.id\]\),/.test(src)
   && /renew:\(window\._renewLastBk&&window\._renewLastBk\[b\.id\]\),/.test(src)
   && /pay:\(window\._installLastBk&&window\._installLastBk\[b\.id\]\)\}\);/.test(src));
ok('　　行事曆與手機端週課表仍用同一支（三個畫面同源）',
   (src.match(/bkRenewBadge\(\{/g)||[]).length>=3);
ok('　　角標樣式沿用 ev-payalert（tcard 是 position:relative，右上角沒被佔）',
   /\.tcard\{position:relative;/.test(src) && /\.ev-payalert\{position:absolute;top:2px;right:3px;/.test(src));

console.log('\n桌機通知：時間與輪詢（2026-07-30 使用者回報）');
ok('★ 時間改成台灣時間（原本直接切 UTC 字串，19:11 顯示成 11:11）',
   /function deskFeedWhen\(iso\)\{/.test(src)
   && /const tw=new Date\(d\.getTime\(\)\+8\*3600000\);/.test(src)
   && !/String\(n\.created_at\)\.slice\(5,16\)\.replace\('T',' '\)/.test(src));
/* 2026-07-31：來源不再只有會員（教練從手機做的變更也會進來）→ 字樣改「手機操作」
   2026-08-01 使用者指示：「有一個『幾分鐘前』操作的這個資訊，幫我改成他們操作的時間」——
   相對時間要在腦中換算，而且卡片不會自己重畫，過一小時還是寫著「5 分鐘前」。 */
ok('★ 講明是「手機操作」時間，直接寫時刻（不再寫「幾分鐘前」）',
   /return `手機操作 \$\{date\}\$\{hh\}`;/.test(src) && !/const ago = mins</.test(src));
ok('　　原因寫在程式裡（相對時間不會自己更新）',
   /卡片不會自己重畫，過一小時還是寫著「5 分鐘前」/.test(src));
ok('　　今天不重複顯示日期，跨日才帶', /const date = sameDay\?'' : /.test(src));
ok('　　壞掉的時間字串不會爆', /if\(isNaN\(d\)\) return '';/.test(src));
ok('★ 輪詢從 45 秒縮到 15 秒（使用者：等了好久）', /const DESK_FEED_MS=15000;/.test(src));
ok('　　原因寫在程式裡', /從預約到跳出訊息等了好久/.test(src));

console.log('\n桌機通知：移除抬頭（2026-07-30 使用者指示：只要顯示卡片）');
ok('★ 抬頭與「全部確認」按鈕從 DOM 移除',
   /el\.innerHTML=`<div id="dfeed-list"><\/div>`;/.test(src)
   && !/<div class="dfeed-head" id="dfeed-head" hidden>/.test(src));
ok('★ deskFeedHead 只剩維護「另有 N 則」那一行',
   /\/\/ 抬頭已移除（2026-07-30 使用者指示：只要顯示卡片）；這裡只維護「另有 N 則」那一行/.test(src));
ok('　　超過單輪上限仍會講「另有 N 則」，不做無聲截斷',
   /more\.textContent=`另有 \$\{total-shown\} 則，確認後會接著顯示`;/.test(src));
/* 2026-08-03（使用者指示）：「移動 ›」跳行事曆整組移除，提醒只是知會 ——
   每張卡回到 ✓ 確認收掉。 */
ok('　　每張卡都有「✓ 確認」', /<button class="dfeed-ok" onclick="event\.stopPropagation\(\);deskFeedAck\('\$\{n\.id\}'\)">✓ 確認<\/button>/.test(src));
ok('　　「移動 ›」不再出現', !/移動 ›<\/span>/.test(src));
ok('　　deskFeedAckAll 保留（日後要恢復入口可直接用）', /async function deskFeedAckAll\(\)\{/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
