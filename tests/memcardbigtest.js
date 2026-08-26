/* 會員「我的預約」的課卡放大（2026-08-26 使用者指示）
   「會員手機端-我的預約-這個頁面的課卡 可以改大一點　因為客戶頁面同一天可能頂多2～3堂課
     如果用現階段的大小會有很大一段的空白　再來是有些客人是長輩　課卡太小張可能不夠友善
     所以可以改成一頁最多顯示三張課卡」

   ⚠ 這一頁的課卡 class 是 .admh2-card —— 管理員手機首頁、教練手機首頁與會員頁**共用**，
     那條共用樣式的原註解就寫著「改壞會四處一起壞」。所以每一條都必須掛在 .memh2 底下。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 高度：一頁最多三張');
{
  /* admh2Mount 的 fit() 那一段實跑：假的 DOM，只要量得到高度就算得出來 */
  const seg=src.slice(src.indexOf("    const _cards=body.querySelector('.admh2-cards');"),
                      src.indexOf("  };", src.indexOf("    const _cards=body.querySelector('.admh2-cards');")));
  ok('★ 有取到那一段', /_cards\.style\.setProperty\('--mh2-cardh'/.test(seg), seg.slice(0,80));
  const run=(cardsH, isMem)=>{
    const set={};
    const cards={clientHeight:cardsH, style:{setProperty:(k,v)=>{set[k]=v;}}};
    const body={querySelector:s=>s==='.admh2-cards'?cards:null, closest:s=>isMem?{}:null};
    new Function('body', seg)(body);
    return set['--mh2-cardh'];
  };
  eq('★★ 右欄 500px → 每張 156px（500 − 14 padding − 18 gap = 468，÷3）', run(500,true), '156px');
  eq('★★ 三張加起來塞得進去', (()=>{const p=parseInt(run(500,true));return p*3+18+14<=500;})(), true);
  eq('★ 高螢幕（700px）也照比例長大', run(700,true), '222px');
  eq('★★ 矮螢幕有下限 74px（原本的自然高度）—— 寧可讓它捲，也不要壓得比現在小',
     run(200,true), '74px');
  eq('★★ 不是 .memh2 的（管理員／教練手機首頁）完全不設', run(500,false), undefined);
  ok('★ 判斷用 body.closest(\'.memh2\')，不是全頁 querySelector',
     /if\(_cards && body\.closest\('\.memh2'\)\)\{/.test(src));
  ok('　 扣掉的是上下 padding（2+12）與兩個 gap（9×2）',
     /const inner=_cards\.clientHeight - 14 - 9\*2;   \/\/ 扣掉上下 padding（2\+12）與兩個 gap/.test(src));
}

console.log('\n② 每一條都掛在 .memh2 底下（不可以動到共用的那條）');
{
  const rules=['\\.memh2 \\.admh2-card\\{min-height:var\\(--mh2-cardh,0px\\);align-content:center;',
               '\\.memh2 \\.admh2-card::before\\{width:6px;\\}',
               '\\.memh2 \\.admh2-card \\.a2-main\\{gap:3px;\\}',
               '\\.memh2 \\.admh2-card \\.a2-l1\\{font-size:13\\.5px;\\}',
               '\\.memh2 \\.admh2-card \\.a2-l2\\{font-size:19px;line-height:1\\.3;\\}',
               '\\.memh2 \\.admh2-card \\.a2-l3\\{font-size:12\\.5px;\\}',
               '\\.memh2 \\.admh2-card \\.a2-time\\{font-size:17px;\\}',
               '\\.memh2 \\.admh2-card \\.a2-coach\\{font-size:12\\.5px;max-width:104px;\\}'];
  eq('★★ 八條新樣式全部有 .memh2 前綴', rules.filter(r=>!new RegExp(r).test(src)), []);
  ok('★★ 共用的那條課卡樣式一個字都沒動（管理員／教練手機首頁不受影響）',
     /\.admh2-card\{position:relative;overflow:hidden;background:#fff;border-radius:14px;\s*\n\s*padding:10px 9px 10px 13px;/.test(src));
  ok('★★ 共用的字級也沒動',
     /\.admh2-card \.a2-l1\{font-size:11\.5px;/.test(src)
     && /\.admh2-card \.a2-l2\{font-size:15px;font-weight:800;line-height:1\.25;/.test(src)
     && /\.admh2-card \.a2-l3\{font-size:10\.5px;color:var\(--t3\);font-family:var\(--num\);\}/.test(src)
     && /\.admh2-card \.a2-time\{font-family:var\(--num\);font-size:13\.5px;font-weight:700;\}/.test(src)
     && /\.admh2-card \.a2-coach\{font-size:10\.5px;color:var\(--t2\);max-width:96px;/.test(src));
}

console.log('\n③ 放大之後不能弄壞既有的三件事');
ok('★ 卡片仍是三欄 grid（章／內容／時間教練），只是加了垂直置中',
   /\.admh2-card\{[^}]*display:grid;grid-template-columns:auto minmax\(0,1fr\) auto;/.test(src)
   && /\.memh2 \.admh2-card\{min-height:var\(--mh2-cardh,0px\);align-content:center;/.test(src));
ok('★★ 教練欄的封頂仍是固定 px（0822 踩過：改百分比整欄會塌）',
   /max-width:104px;\}/.test(src)
   && /仍然是固定 px，不可以改成百分比 —— 它是 grid item，百分比會對自己的欄寬算/.test(src));
ok('★ 課卡仍然 flex:0 0 auto（0822 踩過：會被壓扁重疊）',
   /\.admh2-cards>\*\{flex:0 0 auto;\}/.test(src));
ok('　 ［＋］新增鈕不會被一起撐大（min-height 只掛在 .admh2-card）',
   !/\.memh2 \.admh2-cards>\*\{[^}]*min-height/.test(src));
ok('　 已簽到／過期卡的手勢提示照舊收起來',
   /\.memh2 \.admh2-card\.admh-done \.a2-hint,\.memh2 \.admh2-card\.mh2-past \.a2-hint\{display:none;\}/.test(src));

console.log('\n④ 理由寫在原地');
ok('★★ 使用者原話（空白太多＋長輩看不清）寫在原地',
   /如果用現階段的大小會有很大一段的空白/.test(src)
   && /有些客人是長輩　課卡太小張可能不夠友善/.test(src));
ok('★★ 「共用 class、只能掛 .memh2」的警告寫在原地（下一個人最容易踩的一刀）',
   /是管理員手機首頁、教練手機首頁與\s*\n\s*會員頁共用的，動到共用那條會四處一起變/.test(src));
ok('★ 「為什麼用 JS 算而不是 CSS 容器查詢」寫在原地',
   /這一支本來就是唯一知道版面高度的地方\s*\n\s*（body\.style\.height 是它設的），容器查詢還要多賭一次 webview 支援/.test(src));
ok('★ 下限的理由寫在原地', /矮螢幕上寧可維持原樣、讓它捲，\s*\n\s*也不要把卡壓得比現在還小/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
