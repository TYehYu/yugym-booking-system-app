/* 作廢原因要出現在票券卡上（2026-09-09 使用者：「黃唐施#11補課券　作廢有備註說明
   但現在看不到　要寫在方案這邊」） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 原因從帳本撈，不另存一份');
{
  const F=new Function('return '+g('function tkVoidNote(t, logs){','\n}'))();
  const L=[
    {ticket_id:'T1',action:'grant',delta:1,note:'補發補課券',created_at:'2026-09-01'},
    {ticket_id:'T1',action:'refund',delta:1,note:'團體課取消預約退回（補課券，效期不變）',created_at:'2026-09-09T01:43'},
    {ticket_id:'T1',action:'adjust',delta:-1,note:'作廢・全額退款：單堂體驗請假·出國延長效期',created_at:'2026-09-09T02:08'},
    {ticket_id:'T2',action:'adjust',delta:-1,note:'作廢・轉儲值金：別人的票',created_at:'2026-09-09'},
  ];
  eq('★★★ 撈得到那一筆（黃唐施 #11 的真實資料）',
     F({id:'T1',status:'refunded'},L), '作廢・全額退款：單堂體驗請假·出國延長效期');
  eq('★★★ 只認自己那張票的紀錄（不會撈到別張的作廢原因）',
     F({id:'T3',status:'refunded'},L), '');
  eq('★★★ 沒作廢的票不畫（不能拿退回、扣課那些 note 來充數）',
     F({id:'T1',status:'usable'},L), '');
  eq('★★ 只認「作廢・」開頭的 adjust —— 校正、展延也寫 adjust',
     F({id:'T4',status:'refunded'},[{ticket_id:'T4',action:'adjust',note:'校正：餘額改成 3 堂'}]), '');
  eq('★★ 作廢但沒填理由時只顯示動作，不擠出一行空的',
     F({id:'T5',status:'refunded'},[{ticket_id:'T5',action:'adjust',note:'作廢・全額退款'}]), '作廢・全額退款');
  eq('★★ 沒有帳本也不會爆', [F({id:'T1',status:'refunded'},null), F(null,L)], ['','']);
  eq('★★ 理論上只會作廢一次，真的有兩筆就取最後那筆',
     F({id:'T6',status:'refunded'},[
       {ticket_id:'T6',action:'adjust',note:'作廢・全額退款：舊的',created_at:'2026-09-01'},
       {ticket_id:'T6',action:'adjust',note:'作廢・轉儲值金：新的',created_at:'2026-09-05'}]),
     '作廢・轉儲值金：新的');
}
ok('★★★ 寫入端的格式沒有變（撈的人靠這個字首認）',
   /note:`作廢・\$\{MODE_LB\[mode\]\}`\+\(reason\?`：\$\{reason\}`:''\)/.test(src));
ok('★★★ 不另外存一份到 member_tickets（一份資料兩個地方存遲早對不起來）',
   /從帳本撈回來畫，不另外存一份到 member_tickets/.test(src)
   && !/tk\.void_note=/.test(src));

console.log('\n② 畫在票券卡上');
ok('★★★ 歷史紀錄那張卡有（使用者截圖就是這一張）',
   /<div class="mck-dots2" style="margin:8px 0 2px;">\$\{ticketTokens\(t,bks,typeMap,used,null,PP\.id,WAL\.selfBk\)\}<\/div>\s*\n\s*\$\{tkVoidNoteHtml\(t, c\.myLogs\)\}/.test(src));
ok('★★★ 持有中那張卡也有（共享票等情況可能停在上面）',
   /<div class="mck-dots2" style="margin:10px 0 2px;">\$\{ticketTokens\(t,bks,typeMap,used,null,PP\.id,WAL\.selfBk\)\}<\/div>\s*\n\s*\$\{tkVoidNoteHtml\(t, c\.myLogs\)\}/.test(src));
ok('★★ 帳本本來就在這個渲染器的手上（c.myLogs），不必為了這件事多撈一次',
   /tkExtOrigExpire\(t,c\.myLogs\)/.test(src));
ok('★★ 原因會跳脫（那是人打的字）', /return n\?`<div class="tkc-void">\$\{escH\(n\)\}<\/div>`:'';/.test(src));
ok('★★ 沒有原因就整塊不畫，不留一個空盒子', /return n\?`<div class="tkc-void">/.test(src));
ok('★  用淡紅底細字：作廢是已成定局的說明，不是警示（紅>金>綠的最輕一階）',
   /\.tkc-void\{font-size:11\.5px;line-height:1\.7;color:var\(--danger,#b5372e\);/.test(src)
   && /background:rgba\(181,55,46,\.07\)/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
