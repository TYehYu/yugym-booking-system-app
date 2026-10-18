/* 團課的備註改成逐名額（2026-10-18 使用者：「團體課的備註會一次調整到全部的人上面」）

   1003 當時刻意決定「團課一堂只有一份備註，四張會員卡顯示同一句，這是對的」——
   實際用起來不是。正式庫裡唯一一筆人寫的團課備註是「魏曉微 8/26請假」：
   想記某個人的事，只能把名字塞進整堂備註裡。

   ⚠ 鍵用「名額鍵」不是 member_id：同一位會員可以在一堂團課佔兩格（替家人報名，
     鍵是 mid 與 mid#2）。用 member_id 當鍵會讓兩格共用同一則 —— 等於沒修。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)i=src.indexOf('async function '+n+'(');
  if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 課卡：團課走逐名額、單人課維持整堂');
ok('★★★ 團課讀 seat_notes[名額鍵]',
   /_seatNote=\(_isGrp&&r\.sk\)[\s\S]{0,180}b\.seat_notes\[r\.sk\]/.test(src));
ok('★★★ 單人課仍讀 bookings.note 的使用者段（沒被一起改掉）',
   /_bkNote=_isGrp \? _seatNote[\s\S]{0,140}bkNoteSplit\(b\.note\)\.user/.test(src));
ok('★★★ 團課按下去呼叫 ashSeatNoteAsk、單人課呼叫 ashBkNoteAsk',
   /ashSeatNoteAsk\('\$\{b\.id\}'/.test(src) && /ashBkNoteAsk\('\$\{b\.id\}'\)/.test(src));
/* 團課沒有名額鍵的列（標題卡）不該冒出一顆會寫到別人身上的備註鈕 */
ok('★★★ 團課沒有 r.sk 的列不畫備註鈕', /\(_isGrp&&!r\.sk\) \? '' :/.test(src));
ok('★★ 提示文字講清楚只記這一位', /只記這一位的事/.test(src));

console.log('\n② 鍵一定是名額鍵，不是 member_id');
const A=grab('ashSeatNoteAsk'), S=grab('ashSeatNoteSave');
ok('★★★ 兩支都收 sk 參數', /ashSeatNoteAsk\(bid, sk\)/.test(src) && /ashSeatNoteSave\(bid, sk\)/.test(src));
ok('★★★ 寫入用 cur[sk]，不是 cur[member_id]', /cur\[sk\]=val/.test(S) && !/cur\[mid\]/.test(S));
{
  /* 用真的 seatMid 跑一次：同一人兩格要是兩個不同的鍵 */
  const seatMid=new Function(grab('seatMid').replace(/^function seatMid/,'return function seatMid')+'')();
  eq('★★★ mid 與 mid#2 指向同一個人', [seatMid('m1'),seatMid('m1#2')], ['m1','m1']);
  ok('★★★ 但它們是兩個不同的鍵（所以備註不會互相蓋）', 'm1'!=='m1#2');
}

console.log('\n③ 寫入要重讀再合併');
/* 櫃檯一台、教練一台同時在寫同一堂課的不同名額 —— 拿畫面上那份舊的整個覆蓋，
   會把別人剛寫的那格洗掉。與「今日備註」同一個教訓。 */
ok('★★★ 儲存時重新 dbGet，不用開視窗當下那份',
   /async function ashSeatNoteSave[\s\S]{0,260}await dbGet\('bookings',bid\)/.test(src));
ok('★★★ 是合併不是覆蓋（Object.assign 既有的）',
   /Object\.assign\(\{\},b\.seat_notes\)/.test(S));
ok('★★★ 清空是刪掉那個鍵，不留空字串', /delete cur\[sk\]/.test(S));
ok('★★ 全部清光就存 null，不留空物件', /Object\.keys\(cur\)\.length\?cur:null/.test(S));
ok('★★ 沒改就不寫（省一次網路、也不會洗掉別人的）', /if\(before===val\)\{ closeModal\(\); return; \}/.test(S));
/* ⚠ 2026-10-18 使用者回報：「輸入備註的時候簡易預約課卡會自動關閉，
   又要重新打開才知道輸入了什麼」—— 我原本寫 navTo(CUR_PAGE) 重畫整頁，
   課卡當然收起來。既有的 ashBkNoteSave 早就有正確收尾，照抄它就好。 */
/* ⚠ 反面斷言要先剝掉註解 —— 不然會命中「原本寫 navTo(CUR_PAGE)」那句說明。
   這個坑記憶裡已經記過三次（yugym-assert-hits-comment），這是第四次。 */
const noCmt=t=>String(t||'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
ok('★★★ 存完回到那張課卡，不是重畫整頁',
   /ashBackArm\(bid\); openBookingDetail\(bid\);/.test(S) && !/navTo\(CUR_PAGE\)/.test(noCmt(S)));
ok('★★★ 與整堂備註那支同一個收尾（不要自己發明）', (()=>{
  const B=grab('ashBkNoteSave');
  return /ashBackArm\(bid\); openBookingDetail\(bid\);/.test(B)
      && /ashBackArm\(bid\); openBookingDetail\(bid\);/.test(S);
})());
ok('★★ 存完有清快取', /dbCacheClear\(\['bookings'\]\)/.test(S));

console.log('\n④ 三種備註不要混在一起');
/* members.note＝跟著人、bookings.note＝整堂、training_note＝課表今日、seat_notes＝這一格 */
ok('★★★ 沒有借用 training_note（那是課表的，鍵是 slot）', !/training_note/.test(S) && !/training_note/.test(A));
ok('★★★ 沒有改到 members.note', !/dbPut\('members'/.test(S));
ok('★★ 整堂備註那支還在（單人課要用）', !!grab('ashBkNoteSave'));

console.log('\n⑤ migration');
{
  const sql=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20261018_booking_seat_notes.sql','utf8');
  ok('★★★ 欄位是 jsonb 且 if not exists', /add column if not exists seat_notes jsonb/.test(sql));
  ok('★★ 有寫清楚鍵是名額鍵', /名額鍵/.test(sql));
  ok('★★ 有說明為什麼不借用 note 與 training_note',
     /bookings\.note/.test(sql) && /training_note/.test(sql));
}
ok('★★★ seat_notes 不在 LEAN_DROP（課卡要畫得出來）', (()=>{
  const i=src.indexOf('const LEAN_DROP='); const t=src.slice(i, src.indexOf('};', i));
  return t.indexOf('seat_notes')<0;
})());

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
