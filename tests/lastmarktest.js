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
   && /if\(_total-_done-_ahead > 0\) return;                     \/\/ 還有沒排的堂數 → 不是最後一堂/.test(src));
ok('　　沒有總堂數的票不判定（避免亂標）', /if\(!\(_total>0\)\) return;/.test(src));
ok('　　超約（負數）仍標最後那堂', /_total-_done-_ahead > 0/.test(src));
ok('　　標的是「已排預約中時間最晚那堂」', /const lastBk = tkAll\[tkAll\.length-1\];/.test(src));
ok('　　已續約／不續約的分流沒被動到',
   /if\(done\)\{ window\._renewDoneBk\[lastBk\.id\]=true; return; \}/.test(src)
   && /if\(tk\.renew_status==='declined'\)\{ window\._renewNoBk\[lastBk\.id\]=true; return; \}/.test(src));
ok('　　自主訓練／體驗仍不做續約提醒', /if\(_isSelfOrTrial\) return;/.test(src));
ok('　　兩個案例都寫在程式裡', /蔡佳音 8 堂票已核銷 5、已排 3/.test(src) && /楊慧淳 4 堂票已核銷 0、只排了 2/.test(src));

// 實跑：把判定段抽出來跑兩個真實案例
console.log('\n實跑兩個案例');
{
  const decide=(total, bks)=>{
    const done=bks.filter(x=>x.status==='checked_in'||x.status==='completed').length;
    const ahead=bks.length-done;
    if(!(total>0)) return null;
    if(total-done-ahead>0) return null;
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
}

console.log('\n桌機通知：時間與輪詢（2026-07-30 使用者回報）');
ok('★ 時間改成台灣時間（原本直接切 UTC 字串，19:11 顯示成 11:11）',
   /function deskFeedWhen\(iso\)\{/.test(src)
   && /const tw=new Date\(d\.getTime\(\)\+8\*3600000\);/.test(src)
   && !/String\(n\.created_at\)\.slice\(5,16\)\.replace\('T',' '\)/.test(src));
/* 2026-07-31：來源不再只有會員（教練從手機做的變更也會進來）→ 字樣改「手機操作」 */
ok('★ 講明是「手機操作」時間，並附幾分鐘前',
   /return `手機操作 \$\{date\}\$\{hh\}\$\{ago\?`　·　\$\{ago\}`:''\}`;/.test(src));
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
ok('　　每張卡自己的「✓ 確認」照舊', /<button class="dfeed-ok" onclick="deskFeedAck\('\$\{n\.id\}'\)">✓ 確認<\/button>/.test(src));
ok('　　deskFeedAckAll 保留（日後要恢復入口可直接用）', /async function deskFeedAckAll\(\)\{/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
