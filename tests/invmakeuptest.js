/* 補開發票（2026-10-13 使用者：嚴晴分期第 2 期 $10,800 沒開到發票，
   想「退回重開」卻被「這張票已經排了 6 堂課，不能直接退回」擋住，
   問「修正可以退回的功能 還是補開發票？」）

   答案是**補開**：
     ・錢確實收了，退回會動到已經上過的 6 堂課（扣課、開通堂數），風險遠高於補開
     ・稅務上「漏開補開」本來就不該用「作廢重來」處理
   ⚠ 不能沿用 invRetry：那一支處理 invoices 裡 status='failed' 的列（開過但失敗），
     這裡是**連一列都沒有**（當初根本沒開）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 入口在營收明細那一列的小視窗');
ok('★★★ 多一顆「補開發票」', /btn\('inv','補開發票'/.test(src));
ok('★★★ 條件：櫃檯以上＋有金額＋還沒有號碼＋找得到收款紀錄＋不是抽獎',
   /!!\(desk && !r\.invNo && Number\(r\.amt\)>0 && r\.pur && !r\.lot\)/.test(src));
ok('★★★ 已經開過的不給按，而且把號碼寫在副標（不是只說「不能按」）',
   /r\.invNo\?\('已開立 '\+r\.invNo\)/.test(src)
   && /r\.invNo\?'這一筆已經開過了'/.test(src));
ok('★★ 接到 rvpAct', /if\(what==='inv'\)\{ openInvMakeup\(r\.pur\); return; \}/.test(src));

console.log('\n② 視窗：該問的要問、該講的要講');
ok('★★★ 沿用共用的發票欄位（載具／信箱／統編），不自己做一套',
   /async function openInvMakeup\(purId\)\{[\s\S]{0,2200}?\$\{invFieldsHTML\(\)\}/.test(src));
ok('★★★ 預設帶「開立」（這張就是要補開的）',
   /invSync\(\{paid:true, memberId:\(pur\.member_id\|\|''\), members:\(mem\?\[mem\]:\[\]\), defaultOn:true\}\)/.test(src));
ok('★★★ 講明開立日期是今天、不是原本的收款日（綠界不能回溯）',
   /開立日期是<b>今天<\/b>，不是原本的收款日/.test(src));
ok('★★ 講明開出去就不能改（只能作廢或折讓）', /開出去就不能改，要改只能作廢或開折讓/.test(src));
ok('★★ 視窗上寫出會員／項目／金額／原收款日（補開前要先核對是哪一筆）',
   /<span style="color:var\(--t2\);">項目<\/span>/.test(src)
   && /String\(pur\.created_at\|\|''\)\.slice\(0,10\)/.test(src));

console.log('\n③ 護欄');
ok('★★★ 權限：櫃檯以上', /if\(!isDeskLike\(\)\)\{ showToast\('需要櫃檯以上權限'\); return; \}/.test(src));
ok('★★★ 已經有號碼就擋（開窗時與送出時各擋一次 —— 中間可能別人剛開過）',
   (src.match(/if\(pur\.invoice_number\)\{ showToast\('這一筆已經開過發票：'\+pur\.invoice_number\); return; \}/g)||[]).length===2);
ok('★★★ 金額 0 不開', /if\(amt<=0\)\{ showToast\('金額是 0，不用開發票'\); return; \}/.test(src));
ok('★★ 發票服務沒啟用就說清楚，不要按了沒反應',
   /if\(!cfg\.on\)\{ showToast\('電子發票目前沒有啟用'/.test(src));
ok('★★ 選了「不開發票」就不要補開（那是矛盾的操作）',
   /if\(f && f\.mode==='none'\)\{ showToast\('選了不開發票，就不用補開了'\); return; \}/.test(src));
ok('★★★ 防連點＋按鈕還原', /onceAct\('invmk', _doInvMakeup\)/.test(src)
   && /finally\{ const b=document\.getElementById\('invmk-go'\); if\(b\)\{ b\.disabled=false; b\.textContent='確認開立'; \} \}/.test(src));

console.log('\n④ 開立走既有那一支，不另寫一條路');
ok('★★★ 用 invIssueForPurchase（它會寫 invoices、回寫 purchases 的號碼）',
   /const row=await invIssueForPurchase\(pur, mem, f,\s*\n?\s*\[\{name:\(pur\.plan_name\|\|'消費'\), amt\}\], \{category:'makeup'\}\);/.test(src));
ok('★★★ 回傳的是 invoices 那一列（status），不是 invCall 的 ok/msg —— 別判錯成功',
   /if\(row && row\.status==='issued'\)\{/.test(src)
   && /成功與失敗的提示 invIssueForPurchase 自己已經跳過了/.test(src));
ok('★★ 失敗時視窗留著可以改欄位再試，並說明那一列已經進 invoices',
   /失敗（status==='failed'）時視窗留著/.test(src));
ok('★★ 成功後清快取並重畫（營收明細上的「沒開發票」要跟著消失）',
   /dbCacheClear\(\['purchases','invoices'\]\);/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
