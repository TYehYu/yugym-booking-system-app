/* 2026-08-08 使用者指示兩則：

   ①「首頁的今日營收 KPI 卡把匯款跟現金分開顯示，方便櫃檯算當天的現金帳」
      —— 下班要點抽屜裡的現金，總額幫不上忙。付款方式記在 purchases.payment_method
      （票券本身不存），所以一律以「今天的收款紀錄」為準。
      對不到收款紀錄的（匯入的舊票）歸「其他」，不硬塞進現金 —— 櫃檯數現金時
      多算一筆比少算一筆更麻煩。

   ②「今天 16:00 林子娟是最後一堂課，課卡上沒有顯示驚嘆號」
      —— computeLastBkMarks 的狀態過濾把 used_up 也擋掉了，但「票已經用完」
      正是「最後一堂」的定義本身。她那張 5 堂票餘額 0、狀態 used_up，
      於是驚嘆號沒畫、連「已續約」的綠勾也沒畫（她其實當天就續了約）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 今日營收拆現金／匯款');
/* 2026-08-12 拆帳改版：_payOfTk 改存整個 purchase 物件（split 要看 pay_split 的金額） */
ok('★★ 付款方式一律從「今天的收款紀錄」回推（票券本身不存；存整筆 purchase）',
   /const _payOfTk=\{\};/.test(src)
   && /\(purchases\|\|\[\]\)\.forEach\(p=>\{ if\(p && p\.ticket_id && puLocalDate\(p\)===date\) _payOfTk\[p\.ticket_id\]=p; \}\);/.test(src));
ok('★★ 三桶：現金／匯款／其他',
   /let _revCash=0,_revBank=0,_revOther=0;/.test(src)
   && /const _bump=\(m,amt\)=>\{ if\(m==='cash'\) _revCash\+=amt; else if\(m==='transfer'\) _revBank\+=amt; else _revOther\+=amt; \};/.test(src));
/* 2026-08-12 拆帳改版：一律經 purPayParts 展開（split 拆成現金/匯款兩段，金額以 pay_split 為準）；
   票券非拆帳時金額仍用 amount_paid（與原本口徑一致） */
ok('★ 票券與純收款（場租／商品／重啟）都算進去（經 purPayParts 展開拆帳）',
   /_dayTk\.forEach\(t=>\{ const pu=_payOfTk\[t\.id\];\n\s*if\(pu&&pu\.payment_method==='split'\) purPayParts\(pu\)\.forEach\(\(\[m,a\]\)=>_bump\(m,a\)\);\n\s*else _bump\(pu\?\(pu\.payment_method\|\|''\):'', _tkDayAmt\(t\)\); \}\);/.test(src)
   && /_dayPur\.forEach\(p=>purPayParts\(p\)\.forEach\(\(\[m,a\]\)=>_bump\(m,a\)\)\);/.test(src));
ok('★★ 桌機 KPI 卡列出來，0 的那一種不列（版面不被稀釋）',
   /\$\{_revCash\?`<span class="kpay kpay-cash">現金 \$\$\{_fm\(_revCash\)\}<\/span>`:''\}/.test(src)
   && /\$\{_revBank\?`<span class="kpay kpay-bank">匯款 \$\$\{_fm\(_revBank\)\}<\/span>`:''\}/.test(src));
ok('★ 手機版那一列也換成現金／匯款',
   /_revCash\?`現金 \$\$\{_fm\(_revCash\)\}`:'', _revBank\?`匯款 \$\$\{_fm\(_revBank\)\}`:''/.test(src));
ok('★ 「其他」有說明它是什麼（不會被當成漏帳）',
   /title="沒有對應到今天的收款紀錄（多半是匯入的舊票）"/.test(src));
ok('★ 現金給實色標籤（下班要點的就是它）',
   /\.kpay-cash\{background:#eef5f1;color:#1f6f54;\}/.test(src)
   && /\.kpay-bank\{background:#eef1f7;color:#3f5f85;\}/.test(src));
ok('　　有發票／無發票那一列沒被拿掉', /_revInv>0\?`<div class="mc-kpi-rev-sub">有發票/.test(src));
ok('　　為什麼對不到的要另外一桶，寫在原地',
   /對不到收款紀錄的（舊資料、匯入票）歸「其他」，不硬塞進現金或匯款 —— 櫃檯數現金時\s*\n\s*多算一筆比少算一筆更麻煩。/.test(src));
// 三桶分流實跑一次
{
  /* 2026-08-12 拆帳改版：沙箱段落改抓到 purPayParts 版的 _dayPur 迴圈，
     並把 index.html 裡真的 purPayParts 抽進來（split 展開靠它） */
  const seg=/let _revCash=0,_revBank=0,_revOther=0;[\s\S]*?_dayPur\.forEach\(p=>purPayParts\(p\)\.forEach\(\(\[m,a\]\)=>_bump\(m,a\)\)\);/.exec(src)[0];
  const purPayParts=new Function('return '+grabFn('purPayParts'))();
  /* 2026-08-15 分期入帳改版：金額改經 _tkDayAmt（當日實收優先）——fixture 沒有當日收款金額表，
     給等價替身（退回 amount_paid） */
  const run=new Function('_dayTk','_dayPur','_payOfTk','purPayParts','_tkDayAmt',
    seg+'\nreturn {cash:_revCash,bank:_revBank,other:_revOther};');
  const _runWrap=(a,b,c,d)=>run(a,b,c,d,t=>Number(t.amount_paid)||0);
  const r=_runWrap(
    [{id:'T1',amount_paid:12000},{id:'T2',amount_paid:8000},{id:'T3',amount_paid:5000}],
    /* 2026-08-12 拆帳改版：fixture 的 _payOfTk 改放整筆 purchase；T2 改成拆帳票驗證 pay_split 金額口徑 */
    [{payment_method:'cash',deal_amount:300},{payment_method:'transfer',deal_amount:1200},
     {payment_method:'split',deal_amount:1000,pay_split:{cash:600,transfer:400}}],
    {T1:{payment_method:'cash'},T2:{payment_method:'split',pay_split:{cash:5000,transfer:3000}}},   // T3 對不到收款紀錄
    purPayParts);
  eq('★★ 現金 12,000+300+600+拆帳5,000、匯款 1,200+400+拆帳3,000、其他 5,000',
     r, {cash:17900,bank:4600,other:5000});
}

console.log('\n② 票用完了才是「最後一堂」');
ok('★★ 狀態過濾只擋已退費（原本把 used_up 一起擋掉了）',
   /if\(tk\.status==='refunded'\) return;/.test(src)
   && !/if\(tk\.status && tk\.status!=='usable'\) return;\n\s*\/\/ 自主訓練、體驗課不做續約提醒/.test(src));
ok('★ 使用者回報的案例寫在原地',
   /「今天 16:00 林子娟是最後一堂課，課卡上沒有顯示驚嘆號」/.test(src)
   && /她那張 5 堂票餘額 0、狀態 used_up，於是整個提醒消失 ——/.test(src));
ok('★ 連「已續約」的綠勾也一起救回來（同一條判斷分岔出去的）',
   /連「已續約」的綠勾也不會畫（她其實當天就續了約）。/.test(src));
ok('　　最後一堂的判定本身沒被動到（連結法與餘額法取小）',
   /const _byLink=_total-_done-_ahead;/.test(src)
   && /if\(Math\.min\(_byLink,_byBal\) > 0\) return;                \/\/ 兩種算法都還有剩 → 不是最後一堂/.test(src));
ok('★★ 教練收款推播那邊同步修（同一個坑）', (()=>{
  const fnPath=process.env.HOME+'/Projects/yugym-booking-system-app/docs/edge/line-push-daily.ts';
  if(!fs.existsSync(fnPath)) return false;
  const ts=fs.readFileSync(fnPath,'utf8');
  return /if \(tk\.status === 'refunded'\) continue/.test(ts)
      && /used_up 不能擋掉/.test(ts);
})());

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
