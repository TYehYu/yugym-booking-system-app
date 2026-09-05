/* 2026-08-03 教練回報（承 calscrolltest 的修正）：「自己的課卡會集中在左半邊，
   左半邊的課卡要能夠維持拖移的功能；但是右半邊是其他人的預約，
   所以在右半邊滑移應該要讓畫面移動。」

   教練手機行事曆（renderCoachAgenda）左欄＝自己的課（長按 350ms 拖移改期）、
   右欄＝別人的預約（純顯示）。前一版把 touch-action:none 全拿掉後，
   長按還沒完成前的微小移動就被瀏覽器搶去捲動並 touchcancel，拖移起不來。
   定案分工：只有綁拖移的卡（帶 data-bid＝自己的課）關掉原生捲動，
   右欄與空白處照常捲。已在瀏覽器驗過 computed style：mine=none、others=auto。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 拖移與捲動的分工');
ok('★ 只有帶 data-bid 的課卡關掉原生捲動（拖移需要）',
   /\.cag-wc\[data-bid\],\.cag-std\[data-bid\]\{touch-action:none;\}/.test(src));
/* 同日更新（使用者指示「櫃檯/管理員/店長要能調整課卡」）：data-bid 改跟 canClick 走 ——
   教練（非店長）仍然只有自己的課有；管理身份全卡可拖（見 staffcardtest.js）。 */
ok('★ 教練的右欄卡沒有 data-bid（canClick 對非管理教練只認 mine）',
   /\$\{canClick\?`data-bid="\$\{b\.id\}"`:''\}/.test(src)
   && /const canClick = layer==='mine' \|\| mobTouch;/.test(src));
ok('★ 長按拖移就是綁在 data-bid 卡上（分工的依據）',
   /host\.querySelectorAll\('\.cag-wc\[data-bid\], \.cag-std\[data-bid\]'\)\.forEach\(card=>\{/.test(src));

console.log('\n② 為什麼要 touch-action:none 才拖得動');
ok('★ 理由寫在 CSS 旁（長按沒完成前就被瀏覽器搶去捲動）',
   /前的微小移動就被瀏覽器搶去捲動並 touchcancel，拖移永遠起不來。/.test(src));
ok('　　拖移中的 touchmove 有 preventDefault（passive:false）',
   /card\.addEventListener\('touchmove',\(e\)=>\{ if\(dragging\)e\.preventDefault\(\); const t=e\.touches\[0\]; moveTo\(t\.clientX,t\.clientY\); \},\{passive:false\}\);/.test(src));
ok('　　touchcancel 有收尾（來電/系統手勢打斷不會卡 dragging）',
   /card\.addEventListener\('touchcancel',endPress\);/.test(src));

console.log('\n③ 不影響其他修正');
ok('★ 桌機/平板共用行事曆的 cal-drag-on 分工照舊（calscrolltest 的修正）',
   /\.cal-drag-on \.cal-ev:not\(\.readonly\):not\(\.cal-ev-view\)\{touch-action:none;\}/.test(src));
ok('★ 全域的 .cal-ev touch-action:none 沒有回來',
   !/\n\.cal-ev:not\(\.readonly\)\{touch-action:none;\}/.test(src));
ok('　　其他教練課卡維持純顯示、觸控穿透（0801 定版）',
   /不要再回頭用 pointer-events:none/.test(src));


console.log('\n⑧ 教練手機圓角收斂（2026-09-05）');
{
  const fs2=require('fs');
  const S=fs2.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
  const css=S.replace(/\/\*[\s\S]*?\*\//g,'').match(/<style>[\s\S]*?<\/style>/g).join('');
  const kinds=new Set();
  (css.match(/[^{}]+\{[^{}]*\}/g)||[]).forEach(r=>{
    const i=r.indexOf('{'); if(!/\.(cag|coachhome|chome)/.test(r.slice(0,i))) return;
    (r.slice(i).match(/border-radius:\s*([0-9]+px[^;]*|999px|50%)/g)||[])
      .forEach(m=>kinds.add(m.split(':').slice(1).join(':').trim()));
  });
  ok('★★★ 圓角種類 13 → 5 以內　現在 '+kinds.size+' 種', kinds.size<=5, [...kinds].sort());
  ok('★★★ 不再有 50%（其餘都是正方形：52／26／7／14／6／7）', !kinds.has('50%'));
  ok('★★★ 三顆本來就是膠囊的改成 999px（.cag-cnt／.cag-cc／.cag-card-st）',
     /\.cag-day \.cag-cnt\{[^}]*border-radius:999px;/.test(S)
     && /\.cag-card-st\{[^}]*border-radius:999px;/.test(S));
  ok('★★★ 刪掉死樣式 .cag-daymarks（全檔只出現在 CSS，沒有 markup 用）',
     !/cag-daymarks/.test(S.replace(/\/\*[\s\S]*?\*\//g,'')));
  /* ⚠ 這一輪踩到兩個坑，兩個測試都抓不到，是看 git diff 才發現的： */
  ok('★★★ 四值簡寫沒被改壞（.cag-slotsheet-panel 上緣兩角要一樣）',
     /\.cag-slotsheet-panel\{[^}]*border-radius:16px 16px 0 0;/.test(S));
  ok('★★★ 沒有誤改到別家的規則（.mcal-btn-now 不是 cag 家族）',
     /\.mcal-btn-now\{width:34px;height:34px;border-radius:50%;/.test(S));
  ok('★★ 兩個坑寫在原地（扁平正則會把註解當選擇器、簡寫有四個值）',
     /\*\*註解會被算進選擇器\*\*/.test(S) && /四值簡寫/.test(S));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
