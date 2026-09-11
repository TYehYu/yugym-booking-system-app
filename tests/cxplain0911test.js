/* 取消視窗說「沒扣過」、執行時卻扣課不退（2026-09-11 江旻季 9/10 案例，使用者：「要修」）
   櫃檯：「他是按不扣課」。視窗讀快取判成沒扣過 →「票券不變」＋確定取消（送 'none'＝扣課不退），
   cancelBooking 問資料庫查到有扣 → 標扣課不退、記「櫃檯選擇」，客人少一堂。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const CFM=src.slice(src.indexOf('async function confirmCancelBooking(id){'), src.indexOf('/* 2026-07-29 使用者定案（取消政策三修）'));
const CB=src.slice(src.indexOf('async function cancelBooking(id, refundMode, opts){'), src.indexOf('/* 取消前的贈點提醒'));

console.log('① 視窗：扣過沒有直接問資料庫');
ok('★★★ 單堂、團課都走 bkNetDeductDB，不再 filter 整表快取決定堂數',
   /bkNetDeductDB\(b\.id, null\)/.test(CFM) && /bkNetDeductDB\(b\.id, b\.ticket_id\)/.test(CFM)
   && !/_selfNetDeduct=_lg\.filter/.test(CFM) && !/_grpNetDeduct=_lg\.filter/.test(CFM));
ok('★★★ 問不到（null）不准判成「沒扣過」', /const noTicket = \(\([^\n]*\) && !_netUnknown;/.test(CFM) && /&& !_netUnknown && _selfNetDeduct<=0/.test(CFM));

console.log('\n② 「票券不變」那顆確定取消不再是扣課不退');
ok('★★★ 送 plain，不送 none', /onclick="askSeriesCancel\('\$\{id\}','plain'\)">確定取消<\/button>/.test(CFM)
   && !/onclick="askSeriesCancel\('\$\{id\}','none'\)">確定取消<\/button>/.test(CFM));
ok('★★★ plain 不進 RPC（RPC 會套 24 小時規則扣課）', /refundMode!=='force' && refundMode!=='none' && refundMode!=='plain';/.test(CB));
ok('★★★ plain 是「有扣過就退」：doRefund 走 true，refund_waived 不會成立', /else doRefund = true;/.test(CB) && /b\.refund_waived = \(!doRefund\) && \(await bkWasDeducted\(b\)\);/.test(CB)
   && !/refundMode==='plain'\) doRefund=false/.test(CB));
ok('★★ plain 真的沒扣過：不寫警示帳、不再跳一次', /\}else if\(refundMode==='plain'\)\{\s*\n\s*refundedCount=0;/.test(CB));
ok('★★ plain 不會跳「24 小時內，扣課不退」', /refundMode!=='force' && refundMode!=='plain'\) showToast\('已取消預約（24 小時內，扣課不退）'/.test(CB));
ok('★ 連續取消視窗講得出 plain 是什麼', /mode==='plain'\?'有扣過的一律退回票券'/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
