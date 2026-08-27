/* 共用元件的視覺對齊（2026-08-27 使用者：「現在把其他桌機的頁面也全部一起修改」）

   剩下的 30 幾頁不是各自長一套版面 —— 它們共用同一批基本元件
   （.card 183 處、.modal、.card-title、.lp-table＋.lp-row、.tag、表單欄位）。
   所以「全部一起改」最紮實的做法是改這一層，而不是逐頁去湊。

   這一支守兩件事：
     ① 這一層真的有把共用元件對齊（圓角、框線、陰影、字級）
     ② 它只動外觀 —— 沒有一條規則碰版面，也沒有掛 body.ink（櫃檯／教練同一批頁面） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const B=(()=>{const m='/* ══ 共用元件的視覺對齊';const a=src.indexOf(m);
  const nxt=src.indexOf('\n/* ══', a+40), cap=src.indexOf('</style>');
  return src.slice(a,(nxt>=0&&nxt<cap)?nxt:cap);})();
const R=B.replace(/\/\*[\s\S]*?\*\//g,'');

console.log('① 這一層存在，而且真的是共用層');
{
  ok('★★ 區塊存在', B.length>600);
  ok('★★ .card 真的是共用的（全檔用了上百次，改一次全站對齊）',
     (src.match(/class="card/g)||[]).length>150);
  ok('★★ 理由寫在原地（改共用層而不是逐頁湊）',
     /「全部一起改」最紮實的做法是改這一層，而不是逐頁去湊：\s*\n\s*一次改完、每一頁都對齊，日後新頁面也自動吃到/.test(src));
}

console.log('\n② 卡片／彈窗／列表：同一套語彙');
{
  ok('★★ 卡片 12px 圓角、細框、無陰影（原本 24px 大圓角）',
     /\.card\{border-radius:12px;border:1px solid rgba\(45,36,28,\.11\);padding:18px;margin-bottom:16px;\s*\n\s*box-shadow:none;\}/.test(src)
     && /\.card\{background:var\(--surface-2\);border:1px solid var\(--border-light\);border-radius:var\(--radius-2xl\);/.test(src));
  ok('★★ 彈窗與卡片同語彙（12px 圓角），陰影收成一層薄的',
     /\.modal\{border-radius:12px;padding:22px;box-shadow:0 10px 34px rgba\(45,36,28,\.16\);\}/.test(src));
  ok('★★ 卡片標題與彈窗標題都從「宋體金字」改成無襯線墨色',
     /\.card-title\{font-family:var\(--font-zh\);font-size:15px;font-weight:700;color:var\(--text\);/.test(src)
     && /\.modal-title\{font-family:var\(--font-zh\);font-size:16\.5px;font-weight:700;color:var\(--text\);/.test(src)
     && /\.card-title\{font-family:var\(--serif\)[^}]*color:var\(--gold-d\);/.test(src));
  ok('　 金色留給真正要提醒的地方 —— 理由寫在原地',
     /無襯線墨色（金色留給真正要提醒的地方）/.test(src));
  ok('★ 列表外框與列高對齊（.lp-table 12px、.lp-row 13\\/16）',
     /\.lp-table\{border-radius:12px;border-color:rgba\(45,36,28,\.11\);\}/.test(src)
     && /\.lp-row\{padding:13px 16px;\}/.test(src));
}

console.log('\n③ 標籤與表單');
{
  ok('★★ 標籤從膠囊改方角小標（badge 是輔助不是主角）',
     /\.tag\{border-radius:4px;padding:2px 7px;font-size:10\.5px;font-weight:600;/.test(src)
     && /\.tag\{display:inline-block;padding:2px 9px;border-radius:var\(--radius-pill\);/.test(src));
  ok('★★ 表單、下拉、搜尋框的 focus 統一成橄欖綠（與全站「目前／選取」同一個語彙）',
     ['\\.form-row input:focus','\\.form-row select:focus','\\.lp-sel:focus','\\.lp-search input:focus']
       .every(k=>new RegExp(k+'\\{border-color:#556B45;box-shadow:0 0 0 2px rgba\\(85,107,69,\\.16\\);\\}').test(src)));
  ok('　 原本三種 focus 各走各的（金色／深綠／不同陰影）',
     /\.form-row input:focus\{outline:none;border-color:var\(--gold\);/.test(src)
     && /\.lp-sel:focus\{outline:none;border-color:var\(--green\);box-shadow:0 0 0 2px rgba\(0,61,50,0\.13\);\}/.test(src));
  ok('★ 欄位圓角一律 7px、框線降到 14%',
     /\.form-row input,\.form-row select\{border-radius:7px;border-color:rgba\(45,36,28,\.14\);\}/.test(src)
     && /\.lp-sel\{border-radius:7px;border-color:rgba\(45,36,28,\.14\);\}/.test(src));
}

console.log('\n④ 只動外觀（這一層碰到全站，最不能出錯的地方）');
{
  const bad=[];
  R.split('}').forEach(blk=>{
    const i=blk.indexOf('{'); if(i<0) return;
    if(/(^|[;{\s])(display|position|top|left|right|bottom|width|height|flex-direction|overflow|grid-template)\s*:/.test(blk.slice(i+1)))
      bad.push(blk.slice(0,i).trim().replace(/\s+/g,' ').slice(0,50));
  });
  eq('★★ 沒有一條規則碰版面（display／position／寬高／flex／grid／overflow）', bad, []);
  ok('★★ 沒有 display:none —— 不會有任何東西被藏起來', !/display\s*:\s*none/.test(R));
  ok('★★ 不掛 body.ink（櫃檯與教練用的是同一批頁面）',
     !/body\.ink/.test(R)
     && /基礎樣式（不掛 body\.ink）—— 櫃檯與教練用的是同一批頁面/.test(src));
  ok('★ 原本的定義全部留著（只是被後面這層蓋掉，要退回很容易）',
     /\.modal\{background:var\(--surface-3\);border-radius:var\(--radius-2xl\);padding:26px;/.test(src)
     && /\.lp-table\{background:var\(--surface-2\);border:1px solid var\(--border-normal\);/.test(src)
     && /\.empty\{text-align:center;padding:40px 20px;color:var\(--t3\);\}/.test(src));
}

console.log('\n⑤ 涵蓋面：這一層一改，哪些頁面會跟著對齊');
{
  const pages=[...src.matchAll(/^PAGES\.([a-z_0-9]+)=/gm)].map(m=>m[1]);
  ok('★★ 全站 40 頁以上共用這批元件', pages.length>=40, pages.length);
  /* 逐頁確認「有沒有用到共用元件」—— 沒用到的頁面才需要另外處理 */
  const noCard=pages.filter(p=>{
    const i=src.indexOf('PAGES.'+p+'=');
    const seg=src.slice(i, i+14000);
    return !/class="card|lpTable\(|showModal\(|class="tag/.test(seg);
  });
  ok('★ 絕大多數頁面都吃得到（沒吃到的很少）', noCard.length<=8, noCard);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
