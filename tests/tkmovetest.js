/* 2026-08-08 使用者定案：「票券管理這個導覽列要移除了嗎」→ 選了「把巡檢與票券列表
   搬進經營報表，導覽入口移除」。

   移除前先盤過那一頁剩什麼：
     ・購買申請 —— 別處已有入口（經營報表 → 待處理 → 購買審核；櫃檯在「會員」群組）
     ・會員票券（全店列表）—— 只有這裡 → 搬成經營報表的「票券」分頁
     ・票券對帳巡檢 —— 只有這裡，而且還在用 → 搬到經營報表的待處理那一排
     ・固化推算歸屬／關推算前比對 —— 一次性工具，8/06 跑完、8/07 推算關閉 → 收掉按鈕
     ・方案設定 —— 2026-07-25 起就在系統設定頁 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 導覽入口移除');
ok('★★ 管理員側邊導覽不再有「票券管理」',
   !/\{grp:'財務', label:'票券管理', page:'ticketing'\}/.test(src));
ok('★ 為什麼移除、東西搬去哪，寫在原地',
   /那一頁剩下的東西都搬進經營報表了（會員票券＝「票券」分頁、對帳巡檢＝待處理那一排）/.test(src));
ok('★★ 櫃檯的入口沒被動到（他們沒有經營報表）',
   /front_desk:\[[\s\S]{0,220}\{key:'ticketing',label:'票券管理'\}/.test(src));
ok('★ 中間尺寸的管理員改掛經營報表（原本那組沒有它）',
   /\{key:'finance',label:'經營報表'\},/.test(src));
ok('★ PAGES.ticketing 與路由保留（賣票流程與舊深連結仍會叫到）',
   /PAGES\.ticketing=async function\(\)\{/.test(src)
   && /PAGES\.ticketing 與路由保留/.test(src));

console.log('\n② 會員票券搬成經營報表的分頁');
ok('★ 分頁列多一個「票券」', /\{key:'tickets',    label:'票券'\},/.test(src));
ok('★ 路由接到 PAGES.tickets（不另寫一份列表）',
   /else if\(_finTab==='tickets'\)\{[\s\S]{0,400}await PAGES\.tickets\(\);/.test(src));
ok('★ 先備好 #tk-body 容器再叫子頁（子頁是寫進那個容器的）',
   /<div id="tk-body"><\/div>`;\n\s*await PAGES\.tickets\(\);/.test(src));
ok('　　巡檢按鈕也放在列表上方（維護入口跟著資料走）',
   /onclick="openGrpAudit\(\)">🔍 票券對帳巡檢<\/button><\/div><div id="tk-body">/.test(src));

console.log('\n③ 巡檢進到待處理那一排');
{
  const i=src.indexOf('function finQuickLinks()');
  const box=src.slice(i, src.indexOf('}',src.indexOf('</div>`);',i)));
  ok('★ 待收款／支出明細／購買審核／課程修改紀錄／票券對帳巡檢',
     /setFinTab\('receivable'\)/.test(box) && /setFinTab\('expenses'\)/.test(box)
     && /setFinTab\('review'\)/.test(box) && /setFinTab\('refunds'\)/.test(box)
     && /onclick="openGrpAudit\(\)">🔍 票券對帳巡檢<\/button>/.test(box));
}

console.log('\n④ 兩顆一次性工具的按鈕收掉');
ok('★★ 畫面上不再有「固化推算歸屬」「關推算前比對」按鈕',
   !/onclick="freezeInferredLinks\(\)"/.test(src)
   && !/onclick="compareInferOff\(\)"/.test(src));
ok('★ 函式本身保留（要重跑時從主控台還叫得到）',
   /async function freezeInferredLinks\(\)/.test(src) && /async function compareInferOff\(\)/.test(src));
ok('★ 為什麼收掉，寫在原地（8/06 固化完、8/07 推算關閉）',
   /8\/06 已固化 532 筆、8\/07 先進先出推算正式關閉（INFER_OFF），任務結束/.test(src));

console.log('\n⑤ 巡檢本身沒被改壞');
ok('　　仍是同一支 openGrpAudit', /async function openGrpAudit\(\)\{/.test(src));
ok('　　仍走 tkAuditFlags（規則只有一份，與票券卡的 ⚠ 一致）',
   /tkAuditFlags\(t,\{net:netTk\[t\.id\], cnt:_cnt\[t\.id\]\}\)\.forEach\(x=>\{/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
