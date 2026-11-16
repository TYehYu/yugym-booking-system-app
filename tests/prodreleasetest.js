/* 正式庫部署檔（docs/prod-release/）靜態審查：只建檔、尚未執行。鎖住：守門、單一交易、不誤跑測試庫、唯讀檔真的唯讀、指紋、順序。 */
const fs=require('fs'), path=require('path');
const dir=process.env.HOME+'/Projects/yugym-booking-system-app/docs/prod-release/';
const rd=f=>fs.readFileSync(dir+f,'utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const strip=t=>t.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g,'$$BODY$$').replace(/--[^\n]*/g,'');
const applies=['01_p0c_apply_prod.sql','02_p0e_apply_prod.sql','03_tkwin_apply_prod.sql','04_comp_apply_prod.sql','06_quota_refund_apply_prod.sql','07_benefit_refund_lock_apply_prod.sql'];
const rolls=['01_p0c_rollback_prod.sql','02_p0e_rollback_prod.sql','03_tkwin_rollback_prod.sql','04_comp_rollback_prod.sql','06_quota_refund_rollback_prod.sql','07_benefit_refund_lock_rollback_prod.sql'];
const verifies=['00_prod_precheck_readonly.sql','01_p0c_verify_readonly.sql','02_p0e_verify_readonly.sql','03_tkwin_verify_readonly.sql','04_comp_verify_readonly.sql','06_quota_refund_verify_readonly.sql'];
console.log('套用／回復檔');
for(const f of applies.concat(rolls)){
  const t=rd(f), c=strip(t);
  ok(`${f}：單一交易、鎖逾時、守門在任何變更之前`, (c.match(/^begin;/gm)||[]).length===1&&(c.match(/^commit;/gm)||[]).length===1&&/set local lock_timeout/.test(t)&&t.indexOf('do $guard$')>0&&t.indexOf('do $guard$')<Math.min(...['create ','alter ','drop ','revoke '].map(k=>{const i=t.search(new RegExp('^'+k,'m'));return i<0?1e9:i;})));
  ok(`　 正式庫識別、無測試庫識別、不含破壞性資料操作`, /7637215626725903220/.test(t)&&!/7662742571317219726|kucvxpjatptfckhlxptj|TESTDB/.test(t)&&!/\b(truncate|drop table|delete from|drop column)\b/i.test(c)&&!/^\s*(insert into|update|delete from)\s/im.test(c));
}
console.log('\n唯讀檔');
for(const f of verifies){ const c=strip(rd(f)); ok(`${f}：只有 SELECT（沒有 insert／update／delete／alter／create／drop／grant／revoke）`, !/\b(insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/i.test(c.replace(/\bfor update\b/ig,'').replace(/'[^']*'/g,"''")), c.match(/\b(insert|update|delete|alter|create|drop|grant|revoke)\b/ig)); }
console.log('\n指紋與順序');
const p0c=rd('01_p0c_apply_prod.sql'); ok('★ P0-C 套用檔：函式本體指紋＝測試庫部署並驗證過的 411549f6…:13276', p0c.includes('411549f649f4858215e6e03429bb7ce7:13276'));
const tk=rd('03_tkwin_apply_prod.sql'); ok('★ TKWIN：前置同時要求 P0-C 原版指紋與 P0-E 已部署；後置指紋 1f78f026…:13628', tk.includes('411549f649f4858215e6e03429bb7ce7:13276')&&/P0-E 尚未部署/.test(tk)&&tk.includes('1f78f02623ce16484004b3cf4aec9934:13628'));
const cp=rd('04_comp_apply_prod.sql'); ok('★ 補償：前置要求兩支重算函式為 P0-E 原版指紋，後置為修補版指紋', cp.includes('a6fd429ea9de3e517d5ce761a543c99f:1321')&&cp.includes('42e3b72121a71692ff498f9ad763c724:1321')&&cp.includes('01bdaa33cbf4f91f51caa92fa66a2767:1535')&&cp.includes('d59b56f3816c23243f23618914bdc9d9:1526'));
const e2=rd('02_p0e_apply_prod.sql'); ok('★ P0-E：前置要求無既有 fn_tk_／trg_tk_、無 activation_mode、依賴齊全、notify_recipient 含 desk', /P0E\.ABORT: 正式庫已有 fn_tk_／trg_tk_ 物件/.test(e2)&&/activation_mode 欄位已存在/.test(e2)&&/notify_recipient 沒有 desk/.test(e2));
const r2=rd('02_p0e_rollback_prod.sql'); ok('★ P0-E 回復：預設不刪 activation_mode 欄位、後續階段還在就中止', !/alter table public\.member_tickets drop column/i.test(strip(r2))&&/後續階段（補償／退票／額度）還在/.test(r2));
const b7=rd('07_benefit_refund_lock_apply_prod.sql'); ok('★ benefit_refund 補鎖：前置要求現行指紋＝正式庫盤點值 dbe63afe…:736、ACL 不變', b7.includes('dbe63afeb1f95715cd8a02f454c06a70:736')&&/service_role=X\/postgres/.test(b7));
const rd2=fs.readFileSync(dir+'README_PROD_RUNBOOK.md','utf8'); ok('★ 手冊：前端排在 01、02、03、04、06 之後；歷史補正需另外授權；反向回復順序', /前端.*01、02、03、04、06 全部完成/.test(rd2)&&/另外取得你的正式庫寫入授權/.test(rd2)&&/反向回復順序：前端 → 06／07 → 04 → 03 → 02 → 01/.test(rd2));
ok('★ 歷史補正提案保持「未執行」（整段註解保護）', /PROPOSAL_NOT_EXECUTED/.test(fs.readdirSync(dir).join(' '))&&/第二段：補正（需授權；整段註解保護/.test(fs.readFileSync(dir+'05_backfill_checkedin_unopened_PROPOSAL_NOT_EXECUTED.sql','utf8')));
console.log(`\n✓ ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
