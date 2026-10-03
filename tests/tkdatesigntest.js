/* 2026-10-03 四件（使用者連續三則訊息）

   ① 「票券右下角收費資訊補個日期」—— 分期每一期各是一次收款，日期本來就在
      purchases.created_at，只是沒畫出來。分期常常隔好幾個月才收下一期。
   ② 「［分期繳費］發送後要有提示訊息在票券卡上　不然都要點進去才看到是不是有發送」
      —— 送出時間要用輕量欄位（pending_sign_at）另存一份：
      installment_signs 在 LEAN_DROP 裡，票券卡走 dbGetAll 撈不到。
   ③ 「右上角的備註　這邊要顯示的應該是該堂課的備註而不是該票券的備註」
      —— 查過那其實是 members.note（會跟著人出現在每一堂課卡上）。
   ④ 「這邊新增［全部］並且可以自定義順序」＋「課表動作顯示的順序也要連動這邊的調整」 */
const fs=require('fs');
const root=process.env.HOME+'/Projects/yugym-booking-system-app/';
const src=fs.readFileSync(root+'index.html','utf8');
const sql=fs.readFileSync(root+'docs/migrations/20261003_contracts_pending_sign_at.sql','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});

console.log('① 收費資訊帶日期');
{
  ok('★★★ 收款日期跟著每一期存進 invs', /at:p\.created_at\|\|'',/.test(src));
  ok('★★★ 日期排最左（什麼時候 → 怎麼付 → 多少錢 → 發票）',
     /return `<span class="tk-payrow">\$\{_when\}\$\{_pt\}<span class="tk-amtcell">\$\{_amt\}<\/span>\$\{_iv\}<\/span>`;/.test(src));
  /* ⚠ 多期是 grid：每一列都要輸出這一格，少一格整列往左位移（0923 期數那一欄踩過） */
  ok('★★★ 沒有日期的那一期也要佔一格',
     /: \(_multi\?'<span class="tk-when-na"><\/span>':''\)/.test(src)
     && /\.tk-when-na\{display:block;\}/.test(src));
  ok('★★★ grid 跟著多一欄（三欄 → 四欄）',
     /\.tkc-money \.tk-paylist-multi\{display:inline-grid;grid-template-columns:auto auto auto auto;/.test(src));
  ok('★★ 只寫到「日」，完整時間進 title（這一格越窄，底列越慢折行）',
     /\$\{_wd\.slice\(5\)\.replace\('-','\/'\)\}<\/span>/.test(src)
     && /title="第 \$\{i\+1\} 期收款日　\$\{_wd\.replace\(\/-\/g,'\/'\)\}"/.test(src));
  ok('★★ 等寬數字（三期的日期要上下對齊）', /\.tk-when\{[^}]*font-variant-numeric:tabular-nums;/.test(src));
}

console.log('\n② 分期繳費送出後，票券卡上看得到');
{
  ok('★★★ 送出時一起寫 pending_sign_at', /c\.pending_sign_at=new Date\(\)\.toISOString\(\);/.test(src));
  ok('★★★ 欄位是新增的、預設空（不動舊資料）',
     /add column if not exists pending_sign_at timestamptz;/.test(sql));
  /* ⚠ 只清 n 而留著 at，畫面會變成「沒有待簽、卻有送出時間」 */
  ok('★★★ 簽回時兩欄一起清（RPC 也改了）',
     /pending_sign_at = case when pending_sign_n = p_n then null else pending_sign_at end/.test(sql));
  ok('★★★ 櫃檯端的票券卡撈得到（輕量欄位，不是從 LEAN_DROP 挖）',
     /c\.ctInstPend=Object\.fromEntries\(\(contractsAll\|\|\[\]\)/.test(src)
     && /\.filter\(x=>x && x\.ticket_id && x\.member_id===PP\.id && x\.pending_sign_n\)/.test(src)
     && /\.map\(x=>\[x\.ticket_id,\{n:Number\(x\.pending_sign_n\), at:x\.pending_sign_at\|\|''\}\]\)\);/.test(src));
  ok('★★★ 章只在「已送出、還沒簽回」時出現',
     /const _ip=\(c\.ctInstPend\|\|\{\}\)\[t\.id\];/.test(src)
     && /const _sign=_ip\?`<span class="tk-signwait"/.test(src));
  /* ⚠ 舊的待簽紀錄沒有這個值：只寫「待簽名」，不要印出空括號 */
  ok('★★★ 沒有日期就不寫日期', /\$\{_ipd\?`・\$\{_ipd\} 已發送`:''\}/.test(src));
  ok('★★ 做成章不是按鈕（入口還是旁邊那顆〔分期繳費〕）',
     /\.tk-signwait\{display:inline-block;/.test(src) && !/<button[^>]*class="tk-signwait"/.test(src));
  ok('★★ 〔分期繳費〕那顆沒被換掉', /onclick="openInstallNext\('\$\{t\.id\}'\)">分期繳費<\/button>/.test(src));
}

console.log('\n③ 課卡右上角＝這一堂的備註');
{
  ok('★★★ 讀的是 bookings.note 的使用者段，不是 members.note',
     /const _bkNote=String\(\(typeof bkNoteSplit==='function'\?bkNoteSplit\(b\.note\)\.user:''\)\|\|''\)\.trim\(\);/.test(src));
  ok('★★★ 與「預約明細」那個備註框同一個欄位、同一組 split／join',
     /const next=bkNoteJoin\(bkNoteSplit\(b\.note\)\.sys, el\.value\);/.test(src)
     && (src.match(/bkNoteJoin\(bkNoteSplit\(b\.note\)\.sys, el\.value\)/g)||[]).length===2);
  ok('★★★ 系統註記不會被洗掉（只動 user 段）', /\$\{p\.sys\?`<div style="margin-top:6px;font-size:11px;color:var\(--t3\);">系統註記：/.test(src));
  ok('★★ 會員備註沒有不見，縮成名字後面的小章（有寫才畫）',
     /const _memNoteTag=\(r\.mid&&_memNote\)/.test(src)
     && /class="ash-mmemo"/.test(src));
  ok('★★ 兩顆都擋冒泡（整張卡本身是「開啟會員資料」）',
     /onclick="event\.stopPropagation\(\);ashBkNoteAsk\('\$\{b\.id\}'\)"/.test(src)
     && /onclick="event\.stopPropagation\(\);ashMemNoteAsk\('\$\{b\.id\}','\$\{r\.mid\}'\)"/.test(src));
  ok('★★ 存完回課卡（與會員備註那支同一個收尾）',
     /async function ashBkNoteSave\(bid\)\{[\s\S]{0,700}ashBackArm\(bid\); openBookingDetail\(bid\);/.test(src));
  ok('★★★ 成因寫在原地（下次不要又改回會員備註）',
     /會員永久的備註，所以它會跟著這個人出現在\*\*每一堂\*\*課卡上/.test(src));
}

console.log('\n④ 常用動作「全部」與順序連動');
{
  ok('★★★ 多一個「全部」頁籤，排第一且是預設',
     /const cats=\[''\]\.concat\(CXE_CATS\.filter\(c=>cnt\[c\]\)\);/.test(src)
     && /cnt\[''\]=all\.length;/.test(src));
  /* ⚠ 這才是重點：分類頁籤之下 cxeSaveOrder 只在那一類佔據的全域位置裡重排，
       「把最常用的三個搬到最前面」在分類頁裡做不到（它們分屬不同類）。 */
  ok('★★★ 為什麼要有「全部」才排得動寫在原地',
     /「把最常用的三個搬到最前面」在分類頁裡做不到/.test(src));
  /* 「課表動作顯示的順序也要連動這邊的調整」——三個讀取端本來就吃同一支排序，
     真正缺的是「排得出跨分類的順序」，也就是上面那個「全部」。
     這一條守著三個讀取端不要有人自己另寫一套。 */
  eq('★★★ 課表挑選清單、方案挑動作、方案編輯都吃同一支 cxeSorted(cxeMine(…))',
     (src.match(/cxeSorted\(cxeMine\(/g)||[]).length, 6);
  ok('★★★ 課表的「＋ 新增動作」清單就是這一份', /window\._tlQuickEx=cxeSorted\(cxeMine\(pre\)\);/.test(src));
  ok('★★ 「全部」就是不過濾，沿用既有那一行', /const mine=cur \? all\.filter\(e=>cxeCatOf\(e\)===cur\) : all;/.test(src));
  ok('★★ 只在「全部」那一頁說明拖移排的是整份清單',
     /\$\{cur\?'':`<div class="wp-sub"[^`]*長按卡片可以拖移/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
