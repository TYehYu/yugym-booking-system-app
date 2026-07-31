/* 合約列印版：簽名區格式與頁數（2026-07-31 使用者回報）

   「下面會員簽名跟教練簽名的格式跑掉了，然後不要讓他變成三頁。」

   格式跑掉的成因：原本三欄 flex，每一欄還塞 12 個全形底線（＿×12）。
   12 個全形字在 10pt 大約 42mm，加上標籤 → 每欄約 60mm，三欄＋兩道 16mm 間距 ≈ 212mm，
   已經超過 A4 可印寬度（210 − 左右邊界），於是擠成一團或換行把版面撐爛。
   改成兩欄 grid（會員／教練）＋日期獨佔一列，簽名線用 border-bottom 畫，
   線長自己跟著欄寬走，永遠不會溢出。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

const ctSignBlock=new Function(g('function ctSignBlock(o){','\n}\n')+'\nreturn ctSignBlock;')();

console.log('簽名區：三個入口共用同一支');
{
  ok('★ 空白版由它產生', /const CT_SIGN_BLANK=ctSignBlock\(\);/.test(src));
  ok('★ 已簽版與紙本版也走同一支',
     /\? ctSignBlock\(\{sigImg:c\.signature, dateText:\(c\.signed_at\|\|''\)\.slice\(0,10\)\.replace\(\/-\/g,' \/ '\)\}\)/.test(src)
     && /: ctSignBlock\(\{paperNote:true\}\)/.test(src));
  ok('★ 舊的「教練簽名：＿＿＿…」硬寫字串全部退場', !/教練簽名：＿/.test(src));
}

console.log('\n版面：兩欄＋日期獨佔一列');
{
  const h=ctSignBlock();
  eq('★ 三格：會員簽名／教練簽名／日期', (h.match(/<div/g)||[]).length, 4);   // 外層 1 ＋ 三格
  ok('★ 會員與教練各一欄', /<b>會員簽名<\/b>/.test(h) && /<b>教練簽名<\/b>/.test(h));
  ok('★ 日期獨佔一列', /<div class="sig-date"><b>日期<\/b>/.test(h)
     && /\.ct-sign \.sig-date\{grid-column:1 \/ -1;\}/.test(src));
  ok('★ 簽名線用 border-bottom 畫，不用全形底線',
     (h.match(/<span class="sig-line"><\/span>/g)||[]).length===2
     && !/＿＿＿＿＿＿/.test(h)
     && /\.ct-sign \.sig-line\{display:block;border-bottom:1px solid #333;height:10mm;margin-top:1mm;\}/.test(src));
  ok('★ 版面是兩欄 grid（原本三欄 flex 擠不下）',
     /\.ct-sign\{margin-top:8mm;display:grid;grid-template-columns:1fr 1fr;/.test(src)
     && !/\.ct-sign\{margin-top:10mm;display:flex;gap:16mm;/.test(src));
  ok('　　原因寫在程式裡', /合計寬度超過可印寬度就會擠成一團／換行/.test(src));
}

console.log('\n三種情境');
{
  const blank=ctSignBlock();
  ok('★ 空白版：兩條線＋手寫日期欄', /＿＿＿＿ 年 ＿＿ 月 ＿＿ 日/.test(blank)
     && (blank.match(/sig-line/g)||[]).length===2 && !/<img/.test(blank));

  const paper=ctSignBlock({paperNote:true});
  ok('★ 紙本簽約版：會員那欄標「（紙本另存）」，仍留簽名線',
     /<i class="sig-note">（紙本另存）<\/i><span class="sig-line">/.test(paper));

  const signed=ctSignBlock({sigImg:'data:image/png;base64,AAA', dateText:'2026 / 07 / 31'});
  ok('★ 已簽版：會員那欄放簽名圖，日期帶實際日期',
     /<img class="ct-sig" src="data:image\/png;base64,AAA">/.test(signed)
     && /<b>簽署日期<\/b>　2026 \/ 07 \/ 31/.test(signed));
  ok('★ 已簽版不再畫會員的空白線（已經有簽名圖了）',
     (signed.match(/sig-line/g)||[]).length===1);
  ok('　　簽名圖限高，不會把簽名區撐爆', /img\.ct-sig\{display:block;max-width:100%;max-height:22mm;/.test(src));
}

console.log('\n頁數：收到 2 頁（雙面正好 1 張）');
ok('★ 邊界收緊 18/16mm → 15/14mm',
   /@page\{size:A4;margin:15mm 14mm;\}/.test(src)
   && /@page :right\{margin-left:17mm;margin-right:12mm;\}/.test(src)
   && /@page :left\{margin-left:12mm;margin-right:17mm;\}/.test(src));
ok('★ 字級行高收緊 10.5pt/1.7 → 10pt/1.55', /font-size:10pt;line-height:1\.55;orphans:3;widows:3;/.test(src));
ok('★ 購買內容表的內距在列印時收一點（螢幕版不動）',
   /\.ct-fill table td\{padding:5pt 7pt !important;font-size:9\.5pt !important;\}/.test(src));
ok('　　標題也小一級', /h1\{font-size:14pt;/.test(src));
ok('　　簽名區與購買內容表仍不會被切在兩頁之間',
   (src.match(/break-inside:avoid;page-break-inside:avoid;/g)||[]).length>=2);
ok('　　原因寫在程式裡（為什麼又變 3 頁）',
   /購買內容表多了一列、簽名區三欄擠不下會換行撐高/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
