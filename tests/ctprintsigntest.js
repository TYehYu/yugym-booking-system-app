/* 「點選下載紙本合約」印之前要照現在的樣板重生（2026-09-07 使用者回報）——
   「還是看得到付款方式　我這邊是用〔點選下載紙本合約〕看到的」。

   那顆原本直接印 contracts.body_snapshot，而快照是**建約當下**用當時的樣板產生的，
   樣板之後改了不會跟著動。偏偏按〔用紙本〕時系統又會照現在的樣板重生一次
   （grantReqSetSign）—— 印給客人簽的與系統最後存的會是兩個版本。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};
const F=g('async function ctPrintForSign(','\n}');

console.log('① 那顆連結改走新的入口');
ok('★★ 副標按鈕呼叫 ctPrintForSign（帶的是申請單 id，不是合約 id）',
   /onclick="ctPrintForSign\('\$\{r\.id\}'\)"/.test(src));
ok('★★ 舊的直接列印已經沒有殘留在那顆上',
   !/onclick="ctViewPrint\('\$\{r\.contract_id\}'\)"/.test(src));

console.log('\n② 已簽的不能重生');
ok('★★★ signed_at 有值就原樣印（那是客人簽過名的那一份）',
   /if\(!c \|\| c\.signed_at\) return ctViewPrint\(cid\);/.test(F));

console.log('\n③ 沒簽的照現在的樣板與現在的數字重生');
ok('★★ 用 ctRebuildSnapshot（它自己會去讀現在的樣板 loadContractTpl）',
   /await ctRebuildSnapshot\(P\|\|\{\}, _mem, c\.created_at\)/.test(F)
   && /const tpl=await loadContractTpl\(\);/.test(src));
ok('★★ 畫面上的收款欄位先收進來（櫃檯剛改過金額，客人要簽的就該是改過的）',
   /grFillApply\(r\.payload, true\) \|\| r\.payload/.test(F));
ok('★★ 只在記憶體改 payload，不寫回申請單（真正定案是按〔用紙本〕那一刻）',
   !/dbPut\('ticket_grant_requests'/.test(F));
ok('★★ 重生完要寫回合約 —— 印在紙上的與系統存的要是同一份',
   /c\.body_snapshot=_snap\.body; c\.fill_snapshot=_snap\.fill;/.test(F)
   && /await dbPut\('contracts',c\);/.test(F)
   && /dbCacheClear\(\['contracts'\]\)/.test(F));
ok('★  金額與堂數也跟著更新（合約記總價，不是這一期）',
   /c\.amount=grCtAmount\(P\)\|\|Number\(c\.amount\)\|\|0;/.test(F));

console.log('\n④ 壞掉也不能讓人印不出合約');
ok('★★ 重生失敗改印現有版本（錯誤留 console，不擋列印）',
   /catch\(e\)\{ console\.error\('列印前重生合約失敗（改印現有版本）', e\); \}/.test(F)
   && /return ctViewPrint\(cid\);/.test(F.slice(F.indexOf('catch(e)'))));
ok('★★ 權限仍然只給櫃檯以上', /if\(!isDeskLike\(\)\) return;/.test(F));
ok('★  找不到申請單或沒有合約就什麼都不做', /if\(!r\|\|!r\.contract_id\) return;/.test(F));

console.log('\n⑤ 為什麼要這樣做，寫在原地');
ok('★★ 「不能一邊一個」的理由寫下來了',
   /要嘛都用舊的、要嘛都用新的，不能一邊一個。/.test(src));
ok('★★ 已簽凍結是刻意的，也寫下來了',
   /已簽的合約就該凍結，那是對的/.test(src));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
