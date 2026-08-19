/* 取消預約的連線防半套（2026-08-19 黃柏桓案例）：
   斷線不可消除，但「取消成功、退課消失」的半套狀態可以。
   ① RPC 傳輸失敗重試一次、仍失敗整個不做（RPC 是 DB 單一交易，全成或全不成）
   ② 備援路徑先讀後寫：票券讀不到就中止，不先取消再說
   ③ refundTicket 讀不到票時留警示帳＋跳警告（不再無聲） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

ok('① RPC 傳輸失敗自動重試一次', /for\(let _try=0;_try<2;_try\+\+\)\{\s*\n\s*try\{ res=await sb\.rpc\('fn_cancel_booking'/.test(src));
ok('　　仍失敗 → 整個不做並提示重按', src.includes("if(!_silent) showToast('⚠ 連線不穩，取消未執行——請再按一次');"));
ok('② 備援先讀票券、讀不到就中止（不先取消）',
  /if\(b\.ticket_id && !bkIsGroup\(b\) && refundMode!=='none'\)\{\s*\n\s*const _preTk=await dbGet\('member_tickets',b\.ticket_id\)\.catch\(\(\)=>null\);/.test(src)
  && src.indexOf('const _preTk=await dbGet') < src.indexOf("b.status='cancelled';\n  b.cancelled_at=new Date().toISOString();"));
ok('③ refundTicket 讀不到票留警示帳＋警告',
  src.includes("'⚠ 退課失敗：讀不到票券資料，未退回（請人工補退）'")
  && src.includes("showToast('⚠ 退課沒有成功（讀不到票券），請到會員票券頁確認補退')"));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
