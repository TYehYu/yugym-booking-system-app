/* 會員管理：KPI 卡 ＋ 工具列改版（2026-08-27 使用者指示，附參考圖）
   「請盡量忠實按照此結構，不要自行重新發明另一套版型」

   ① KPI：左側淡色圓形 icon ／ 右側標題、大數字＋小「位」、下方「較上月 +23 ↑」
   ② 工具列：一條完整的白色 bar，左邊 segmented control（會員／主顧客／VIP＋人數） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 「較上月」的呈現：算不出來就寫破折號，不要填 0');
{
  const f=new Function(grabFn('lpDelta')+'\nreturn lpDelta;')();
  eq('★★ 正數＝綠色 ↑', f(23), '<i class="d-up">+23 ↑</i>');
  eq('★★ 負數＝磚紅 ↓', f(-7), '<i class="d-dn">-7 ↓</i>');
  eq('★★ null（沒有上月數字）＝破折號', f(null), '<i class="d-na">－</i>');
  eq('★★ 0（跟上月一樣）也是破折號 —— 但語意不同，註解有寫清楚', f(0), '<i class="d-na">－</i>');
  eq('　 undefined 不會印出 NaN', f(undefined), '<i class="d-na">－</i>');
  ok('★★ 「算不出來就寫破折號、不要填 0」寫在原地',
     /算不出來就寫「－」，不要填 0 —— 0 的意思是「跟上月一樣」，\s*\n\s*跟「我們沒有上月的數字」是兩件事/.test(src));
}

console.log('\n② lpStats 的新欄位都是選配（別的頁面不會被動到）');
{
  const f=new Function(grabFn('lpStats')+'\n'+grabFn('lpDelta')+'\nreturn lpStats;')();
  const plain=f([{label:'總數', value:10, unit:'筆'}]);
  ok('★★ 沒帶 icon／delta 的頁面：結構與舊版一致（沒有 has-ic、沒有 icon、沒有較上月）',
     !/has-ic/.test(plain) && !/lp-stat-ic/.test(plain) && !/較上月/.test(plain)
     && /<span class="lp-stat-l">總數<\/span>/.test(plain)
     && /<span class="lp-stat-v">10<small>筆<\/small><\/span>/.test(plain));
  const rich=f([{label:'總人數', value:482, unit:'位', icon:'<svg/>', delta:29}]);
  ok('★★ 帶了就長出：圓形 icon ／ 標題 ／ 大數字＋小「位」／ 較上月',
     /<div class="lp-stat has-ic"/.test(rich)
     && /<span class="lp-stat-ic"><svg\/><\/span>/.test(rich)
     && /<span class="lp-stat-l">總人數<\/span>/.test(rich)
     && /<span class="lp-stat-v">482<small>位<\/small><\/span>/.test(rich)
     && /<span class="lp-stat-d">較上月 <i class="d-up">\+29 ↑<\/i><\/span>/.test(rich));
  ok('　 delta 給 null 也會畫出那一行（顯示破折號），不是整行消失',
     /較上月 <i class="d-na">－<\/i>/.test(f([{label:'x',value:0,delta:null}])));
  ok('　 onclick 與 tone 照舊',
     /class="lp-stat ok has-ic" onclick="go\(\)"/.test(f([{label:'x',value:1,tone:'ok',icon:'<i/>',onclick:'go()'}])));
}

console.log('\n③ 會員頁的四張卡：只有總人數的「較上月」是真的算出來的');
{
  ok('★★ 總人數用 created_at 算本月新增（真實可得）',
     /const _newThisMonth=members\.filter\(m=>String\(m\.created_at\|\|''\)\.slice\(0,7\)===_thisYm\)\.length;/.test(src)
     && /\{label:'總人數',       value:members\.length,   unit:'位', icon:SIC\.people, delta:_newThisMonth\}/.test(src));
  ok('★★ 另外三張一律 delta:null —— 系統沒有留每月快照，上月是幾位無從得知',
     /icon:SIC\.up,    delta:null/.test(src)
     && /icon:SIC\.down,  delta:null/.test(src)
     && /icon:SIC\.renew, delta:null/.test(src));
  ok('★★ 為什麼算不出來、以及日後要怎麼做才算得出來，寫在原地',
     /系統沒有留每月快照，\s*\n\s*所以上個月是幾位無從得知 —— 一律顯示破折號，不要用 0 假裝「跟上月一樣」/.test(src)
     && /日後若要真的比，得先每月存一筆快照，不是在這裡湊/.test(src));
  ok('★ 四張卡的順序與標籤沒動（總人數／待升級／待降級／待續約）',
     /\{label:'總人數',[\s\S]{0,200}?\{label:'本月待升級名單'[\s\S]{0,200}?\{label:'本月待降級名單'[\s\S]{0,220}?\{label:'本月待續約名單'/.test(src));
  ok('　 第五張「新舊系統票券核對」照舊，只是也給了 icon',
     /\{label:'新舊系統票券核對', value:_lvDone, unit:`\/ \$\{_loyal\.length\}`, icon:SIC\.check\}/.test(src));
  ok('　 點卡看名單的行為沒動', (src.match(/memTierWatchList\('(up|down|renew)'\)/g)||[]).length>=3);
}

console.log('\n④ 等級色票 → segmented control（沒有新增行為）');
{
  ok('★★ 點下去走既有的 memSetTier（與右邊「全部等級」下拉同一支）',
     /onclick="memSetTier\('\$\{on\?'':k\}'\)"/.test(src)
     && /function memSetTier\(v\)\{ _memTier=v; _memPage=1; navTo\('members','g_member'\); \}/.test(src));
  ok('★★ 選中狀態讀同一個 _memTier（不會跟下拉打架）', /const on=_memTier===k;/.test(src));
  ok('★★ 點已選中的那一段＝取消，回到全部等級', /onclick="memSetTier\('\$\{on\?'':k\}'\)"/.test(src));
  ok('★ 三個等級與人數都在（會員／主顧客／VIP）',
     /Object\.entries\(TIER_DEFS\)\.map\(\(\[k,d\]\)=>\{/.test(src)
     && /const n=filtered\.filter\(m=>effTier\(m\)===k\)\.length;/.test(src)
     && /\$\{d\.label\} <i>\(\$\{n\}\)<\/i>/.test(src));
  ok('★★ 「不能點的 segmented control 會更難用」的理由寫在原地',
     /色票原本只是圖例（不能點）—— 做成 segmented control 卻不能點會更難用，\s*\n\s*所以接上既有的篩選/.test(src));
  ok('　 選中用該等級自己的顏色（TIER_DEFS 的 color，沒有另訂一套）',
     /style="--lc:\$\{d\.color\};"/.test(src) && /\.lp-seg-i\.on\{background:var\(--lc,#556B45\);/.test(src));
}

console.log('\n⑤ 工具列是一條完整的白色 bar');
{
  ok('★★ 有 segmented control 的工具列才變成白 bar（其他頁面不受影響）',
     /\.lp-toolbar:has\(\.lp-seg\)\{background:var\(--card\);border:1px solid var\(--bd\);border-radius:14px;/.test(src));
  ok('★ 搜尋／兩個篩選／排序／新增會員仍在同一列（原本就是同一列，沒重排）',
     /search:\{ value:_memSearch, placeholder:'搜尋姓名或電話'/.test(src)
     && /\{ value:_memTier,     options:tierOpts, onchange:'memSetTier\(this\.value\)' \}/.test(src)
     && /sort:\{ value:_memSort, options:sortOpts, onchange:'memSetSort\(this\.value\)' \}/.test(src)
     && /openBackofficeMember\(\)">＋ 新增會員/.test(src));
}

console.log('\n⑥ 配色與陰影');
{
  ok('★★ icon 圓底只用極淡 tint（color-mix 12%）',
     /background:color-mix\(in srgb, var\(--sic,#556B45\) 12%, transparent\);color:var\(--sic,#556B45\);/.test(src));
  ok('★★ 一般／正向橄欖綠、降級低飽和磚紅、續約燕麥金',
     /\.lp-stat\.has-ic\{--sic:#556B45;\}/.test(src)
     && /\.lp-stat\.has-ic\.warn\{--sic:#8C4A3E;\}/.test(src)
     && /\.lp-stat\.has-ic\.accent\{--sic:#8A6E42;\}/.test(src));
  ok('★ 卡片不要強陰影、圓角 15px',
     /\.lp-stat\{border-radius:15px;box-shadow:none;border:1px solid var\(--bd\);background:var\(--card\);\}/.test(src));
  ok('★★ 大數字維持墨色（一整排都上色會太吵）',
     /\.lp-stat\.has-ic\.ok \.lp-stat-v,\.lp-stat\.has-ic\.warn \.lp-stat-v,\s*\n\.lp-stat\.has-ic\.accent \.lp-stat-v\{color:var\(--text\);\}/.test(src));
  ok('　 數字等寬（四張卡的數字才對得齊）',
     /\.lp-stat\.has-ic \.lp-stat-v\{[^}]*font-variant-numeric:tabular-nums;\}/.test(src));
  /* 只看這一次新增的區塊 —— Ink 層早就有兩條 .lp-stat-v／.lp-stat-l 的字色規則
     （首頁那批），那不是這次加的。 */
  const NEW=(()=>{const m='/* ══ 會員管理：KPI 卡與工具列';const a=src.indexOf(m);
    const nxt=src.indexOf('\n/* ══', a+40), cap=src.indexOf('</style>');
    /* 去註解 —— 註解裡本來就會提到 body.ink（在說明「刻意不掛」） */
    return src.slice(a,(nxt>=0&&nxt<cap)?nxt:cap).replace(/\/\*[\s\S]*?\*\//g,'');})();
  ok('　 這組不掛 body.ink（櫃檯也在用會員管理）',
     /基礎樣式（不掛 body\.ink）—— 櫃檯也在用會員管理/.test(src) && !/body\.ink/.test(NEW));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
