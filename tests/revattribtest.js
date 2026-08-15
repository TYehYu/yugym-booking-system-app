/* 2026-08-03 使用者指示：「首頁的今日營收，會員名稱右邊新增教練 tag，
   這個 tag 顯示的是該筆資料的業績歸屬，可以後續修改，如果不小心選錯人」

   賣票當下點錯業績歸屬，續約獎金與營運分析就整筆算錯邊 —— 原本只能去資料庫改。
   tag 直接掛在今日營收名單（右欄卡與彈窗同一份），點一下換人。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① tag 的顯示');
{
  /* 2026-08-08 使用者指示：「教練 tag 要上教練的顏色」→ 多依賴 coachTagColor */
  const mk=(desk,map)=>new Function('window','isDeskLike','coachTagColor',
    grabFn('revAttribChip')+'\nreturn revAttribChip;')({_revCoachTag:map||{}},()=>desk,
    id=>({bg:'#CFE0EF',fg:'#35617F'}));
  const f=mk(true,{c1:'MANGO'});
  ok('★ 顯示歸屬教練的名字', /MANGO/.test(f({attKind:'tk',attRef:'T1',att:'c1'})));
  ok('★ 點一下開更改視窗（stopPropagation，不會連帶開會員票券）',
     /event\.stopPropagation\(\);openRevAttribPick\('tk','T1'\)/.test(f({attKind:'tk',attRef:'T1',att:'c1'})));
  ok('★ 沒歸屬的顯示「未歸屬」金色提醒（比留白更醒目，這筆的獎金正懸空）',
     /未歸屬/.test(f({attKind:'pur',attRef:'P1',att:null}))
     && /rev-att-none/.test(f({attKind:'pur',attRef:'P1',att:null})));
  const g=mk(false,{c1:'MANGO'});
  ok('★ 教練／會員看得到名字但點不動', /MANGO/.test(g({attKind:'tk',attRef:'T1',att:'c1'}))
     && !/onclick/.test(g({attKind:'tk',attRef:'T1',att:'c1'})));
  eq('　　非櫃檯且未歸屬 → 不顯示（不引導去點一個點不動的東西）', g({attKind:'tk',attRef:'T1',att:null}), '');
  eq('　　沒有歸屬資訊的列（舊資料）不畫 tag', f({}), '');
}

console.log('\n② 名單資料帶了歸屬');
/* 2026-08-07：歸屬只對教練課系有意義（使用者指示「團課不需要設定歸屬」）——
   票券列改成要標才給 attKind；純收款（場租／商品／重啟）一律不標。 */
ok('★ 票券列帶 sold_by（教練課系才給 attKind）',
   /att:t\.sold_by\|\|null, attKind:_attNeed\(t\)\?'tk':null, attRef:t\.id,/.test(src));
ok('★ 純收款列不標歸屬（2026-08-15 起分期收款例外：章與歸屬跟票券走）', /att:\(_t\?\( p\.coach_id\|\|_t\.sold_by\|\|null\):\(p\.coach_id\|\|null\)\), attKind:\(_t&&_attNeed\(_t\)\)\?'tk':null, attRef:_t\?_t\.id:p\.id,/.test(src));
ok('★ 同一筆銷售不重複列（票券與其收款紀錄只列票券那筆）',
   /_dayPur\.filter\(p=>!\(p\.ticket_id&&_dayTk\.some\(t=>t\.id===p\.ticket_id\)\)\)/.test(src));
ok('★ 右欄名單卡與彈窗都掛同一支 revAttribChip（2026-08-07 起放在姓名上方）',
   (src.match(/\$\{revAttribChip\(r\)\}/g)||[]).length===2
   && (src.match(/<div class="mc-rev-b">\$\{revAttribChip\(r\)\}<span class="mc-rev-nm">/g)||[]).length===2);

console.log('\n③ 更改流程');
ok('★ 只有櫃檯／管理員能開', /async function openRevAttribPick\(kind, ref\)\{\n\s*if\(!isDeskLike\(\)\) return;/.test(src));
ok('★ 視窗講清楚後果（續約獎金與營運分析跟著改）',
   /<b>續約獎金與營運分析都會跟著改<\/b>/.test(src));
ok('★ 票券：sold_by 與同筆收款的 purchases.coach_id 一起改（續約獎金優先看後者）',
   /t\.sold_by=cid\|\|null;/.test(src)
   && /const pur=\(await dbGetAll\('purchases'\)\)\.filter\(p=>p\.ticket_id===ref\);/.test(src)
   && /p\.coach_id=cid\|\|null; await dbPut\('purchases', p\);/.test(src));
ok('★ 純收款（場租／商品／重啟）只改 purchases.coach_id',
   /const p=await dbGet\('purchases', ref\); if\(!p\)\{ showToast\('找不到收款紀錄'\); return; \}/.test(src));
ok('★ 票券的改動留 ticket_logs（誰改的、從誰改到誰）',
   /logTicket\(ref,'adjust',0,null,SESSION&&SESSION\.id,`業績歸屬調整：\$\{before\} → \$\{who\}`\)/.test(src));
ok('★ 可改成「未歸屬」（真的不該算任何人時）',
   /onclick="setRevAttrib\('\$\{kind\}','\$\{ref\}',''\)">改為未歸屬<\/button>/.test(src));
ok('★ 防連點', /async function setRevAttrib\(kind, ref, cid\)\{ return onceAct\('revatt:'\+ref, \(\)=>_setRevAttrib\(kind,ref,cid\)\); \}/.test(src));
ok('　　為什麼要能改，寫在程式裡', /賣票當下選錯人，續約獎金與營運分析就整筆算錯邊，要能當場修。/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
