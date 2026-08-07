/* 2026-08-07 使用者回報：「許佳慈預約晚上的團課，她明明就沒票券，
   但是按新增還是可以預約一個名額上去。」

   原本的規則是「沒票＝教練負責，照加，事後跳⚠視窗」——名額已經寫進課卡了，
   櫃檯才在下一個畫面看到「有名額沒有扣到票」。實際結果就是 8/07 那堂 5 個名額只扣到 4 堂票。
   改成存檔前先擋：算這次要加的名額 vs 這位會員這堂課真正能扣的堂數，不夠就停下來，
   要按「仍以教練負責加入」才會寫入（教練招待／體驗名額仍走得通）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const save=grabFn('_saveGroupMembers');

console.log('① 存檔前先算「這次加的名額」夠不夠扣');
ok('★ 只看這次新增的名額（只改上限或移除名額不會被擋）',
   /if\(added\.length && !window\._grpNoTkOK\)\{/.test(save)
   && /const _need=\{\}; added\.forEach\(m=>\{ _need\[m\]=\(_need\[m\]\|\|0\)\+1; \}\);/.test(save));
ok('★ 可用堂數走 listUsableTickets（跟真正扣課同一套判斷：效期、時段、超約防線）',
   /await listUsableTickets\(mid,b\.ticket_type_id,b\.date,b\.start_time\)/.test(save));
ok('★ 堂數不足才列進來（剛好夠就放行）',
   /if\(left<_need\[mid\]\) short\.push\(\{mid, need:_need\[mid\], left\}\);/.test(save));
ok('★ 被擋下時「名單還沒有存」—— 直接 return，不會寫進課卡',
   /名單<b>還沒有存<\/b>/.test(save) && /return false;\n\s*\}\n\s*\}/.test(save));

console.log('\n② 視窗講清楚差在哪');
ok('★ 逐人列出「要加幾個名額・可用幾堂」',
   /要加 \$\{s\.need\} 個名額・可用 <b style="color:var\(--danger,#b5372e\);">\$\{s\.left\}<\/b> 堂/.test(save));
ok('★ 標題是紅的（重要警示用紅）', /⚠ 票不夠，這些名額扣不到票/.test(save)
   && /modal-title" style="color:var\(--danger,#b5372e\);"/.test(save));
ok('★ 兩條路都給：回名單修改／仍以教練負責加入',
   /onclick="closeModal\(\);openGroupMembers\('\$\{id\}',true\)">回名單修改/.test(save)
   && /onclick="closeModal\(\);grpSaveNoTk\('\$\{id\}'\)">仍以教練負責加入/.test(save));

console.log('\n③ 放行只算這一次');
ok('★ 放行旗標用完就清掉（不會留到下一堂課）', /window\._grpNoTkOK=0;   \/\/ 放行只對這一次有效/.test(save));
ok('★ 「仍以教練負責加入」用另一個防連點鍵（同鍵會在 400 毫秒內按了沒反應）',
   /async function grpSaveNoTk\(id\)\{ window\._grpNoTkOK=1; return onceAct\('grpmem-force:'\+id, \(\)=>_saveGroupMembers\(id\)\); \}/.test(src));

console.log('\n④ 回名單修改不要白挑一次');
{
  const open=grabFn('openGroupMembers');
  ok('★ keepSel 時保留剛剛挑的名額與指定的票券',
     /async function openGroupMembers\(id, keepSel\)\{/.test(open)
     && /if\(!keepSel\) window\._grpTkPick=\{\};/.test(open)
     && /if\(!keepSel \|\| !Array\.isArray\(window\._grpSel\)\) window\._grpSel=cur\.slice\(\);/.test(open));
  ok('　　一般開啟仍然重置（指定不要跨堂殘留）', /每次開名單重置，指定不要跨堂殘留/.test(open));
}

console.log('\n⑤ 事後的⚠視窗保留當第二道');
ok('★ 扣不到票仍會記錄並警告（護欄擋下的情況也算）',
   /if\(!_ded\) \(_noTk\[mid\]=\(_noTk\[mid\]\|\|0\)\+1\);/.test(save)
   && /⚠ 有名額沒有扣到票/.test(src));
ok('　　為什麼要事前擋，寫在程式裡',
   /「許佳慈明明就沒票券，但是按新增還是可以預約一個名額上去」/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
