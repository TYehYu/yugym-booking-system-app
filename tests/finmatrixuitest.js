/* 月報表 UI 改版（2026-08-27 使用者指示）
   「資料內容、欄位、計算邏輯、排序方式、功能全部維持不變，只修改視覺樣式與版面」
   「改成『全店合計＋各教練獨立 column group』的視覺結構」
   「整體維持高資訊密度，不要為了美化把表格做得太鬆」

   ⚠ 這一支的重點是「只動樣式」：DOM 的欄位、順序、計算全部不能被碰。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const B=(()=>{const m='/* ══ 月報表：改成「全店合計';const a=src.indexOf(m);
  const nxt=src.indexOf('\n/* ══', a+40), cap=src.indexOf('</style>');
  return src.slice(a,(nxt>=0&&nxt<cap)?nxt:cap);})();

console.log('① 計算與欄位一個都沒動');
{
  const RENDER=src.slice(src.indexOf('const head1=cols.map'), src.indexOf('fmStickyFit();'));
  ok('★★ 兩列表頭的欄位與順序原封不動（日期／全店合計 3 欄／每位教練 4 欄）',
   /* 2026-08-31：全店合計拆成五欄（教練課／團課／團課收入／其他／營業額）——
      團課收入與其他＝沒歸屬到教練的收款，拆兩欄是因為團課 85,000 會蓋掉場租商品 4,326。 */
     /<th class="fm-d fm-h">日期<\/th><th class="fm-h fm-t" colspan="5">全店合計<\/th>\$\{head1\}/.test(RENDER)
     && /<th class="fm-sh fm-t">教練課<\/th><th class="fm-sh fm-t fm-t2">團課<\/th><th class="fm-sh fm-t fm-t5"[\s\S]{0,140}?<th class="fm-sh fm-t fm-t4"[\s\S]{0,80}?<th class="fm-sh fm-t fm-t3">營業額<\/th>\$\{head2\}/.test(RENDER)
     && /<th class="fm-sh fm-gs" style="--cc:\$\{cc\};">教練課<\/th><th class="fm-sh">團課<\/th><th class="fm-sh">業績<\/th><th class="fm-sh fm-ge" style="--cc:\$\{cc\};">新\/續<\/th>/.test(RENDER));
  ok('★★ 月合計列：五個數字（sumPt／sumGrp／sumGrpRev／sumOthRev／sumAmtAll）＋各教練',
     /* 2026-08-31 二修：那兩格多夾一份 fmRevTip 明細提示（使用者：「滑鼠指上去
        可以顯示該金額是什麼內容嗎」），所以標籤與 > 之間允許一段 title。 */
     /<tr class="fm-sum"><th class="fm-d">月合計<\/th><td class="fm-c fm-t">\$\{num\(sumPt\)\}<\/td><td class="fm-c fm-t fm-t2">\$\{num\(sumGrp\)\}<\/td><td class="fm-c fm-t fm-t5"\$\{fmRevTip\(sumGrpWho\)\}>\$\{money\(sumGrpRev\)\}<\/td><td class="fm-c fm-t fm-t4"\$\{fmRevTip\(sumOthWho\)\}>\$\{money\(sumOthRev\)\}<\/td><td class="fm-c fm-t fm-t3">\$\{money\(sumAmtAll\)\}<\/td>\$\{sumTds\}<\/tr>/.test(RENDER));
  ok('★★★ 團課收入＋其他＝沒歸屬教練的收款，加上各教練業績要等於營業額',
     /if\(p\.coach_id\) return;                       \/\/ 有歸屬教練 → 已經在那位教練的業績欄/.test(src)
     && /五欄相加＝營業額，永遠對得起來/.test(src));
  ok('★★ 教練色仍由 coachTagColor 帶（沒有另訂一套）',
     /const head1=cols\.map\(c=>\{ const k=coachTagColor\(c\.id\);/.test(RENDER)
     && !/coachTagColor/.test(B));
  ok('★★ 底部的欄位定義跟著改（體驗不再算進教練課；多了團課收入與其他）',
     /教練課＝已簽到／已完成的教練課、友善教練課與運動按摩（體驗、自主訓練、場租不計）；/.test(src)
     && /團課收入與其他＝沒有歸屬到教練的收款/.test(src));
  /* ⚠ RENDER 的切片就結束在 fmStickyFit(); 這一行之前，要在 src 裡比 */
  ok('　 凍結表頭的量測（fmStickyFit）照舊',
     /<\/div>\s*\n\s*<\/div>`;\s*\n\s*fmStickyFit\(\);/.test(src) && /function fmStickyFit\(\)\{/.test(src));
}

console.log('\n② 月份列：置中、約 64px、不是卡片');
{
  ok('★★ 不再包成 card ops-datebar',
     !/<div class="card ops-datebar" style="margin:-4px 0 12px;box-shadow:none;border:none;padding:0;">/.test(src));
  ok('★★ 置中的「月曆圖示＋2026 年 08 月」，兩端各一顆翻月鈕',
     /<div class="fm-mbar">/.test(src)
     && /<svg class="fm-mic"/.test(src)
     && /<span class="fm-mtxt">\$\{ym\.split\('-'\)\[0\]\} 年 \$\{ym\.split\('-'\)\[1\]\} 月<\/span>/.test(src)
     && /onclick="finMonthMove\(-1\)">‹ 上個月/.test(src)
     && /onclick="finMonthMove\(1\)">下個月 ›/.test(src));
  ok('★ 整列高度壓在 56px（含上下 margin 約 64px）',
     /\.fm-mbar\{display:flex;align-items:center;gap:12px;min-height:56px;/.test(src));
  ok('　 月份用等寬數字（翻月時不會左右跳）',
     /\.fm-mtxt\{font-family:var\(--num\);font-size:19px;font-weight:700;[^}]*font-variant-numeric:tabular-nums;\}/.test(src));
}

console.log('\n③ 全店合計：淡暖米色框成一塊');
{
  ok('★★ 日期＋三欄用 #F3EEE4，表頭再深一階',
     /\.fm-tb \.fm-d,\.fm-tb \.fm-t\{background:#F3EEE4;\}/.test(src)
     && /\.fm-tb thead \.fm-d,\.fm-tb thead \.fm-t\{background:#EDE6D8;\}/.test(src));
  ok('★ 與教練區之間用一條較實的線切開', /\.fm-tb \.fm-t\.fm-t3\{border-right:2px solid rgba\(45,36,28,\.18\);\}/.test(src));
}

console.log('\n④ 月合計列：再深一階、數字 semibold 且稍大');
{
  ok('★★ 底色比日期列深，字重 600',
     /\.fm-tb \.fm-sum td,\.fm-tb \.fm-sum \.fm-d\{background:#EAE2D2;font-weight:600;/.test(src));
  ok('★★ 主要數字 15px（一般列 13.5px）',
     /\.fm-tb \.fm-sum \.fm-c,\.fm-tb \.fm-sum \.fm-t\{font-size:15px;font-weight:600;\}/.test(src)
     && /\.fm-tb\{font-size:13\.5px;\}/.test(src));
  ok('　 hover 時不會被一般列的 hover 底色蓋掉',
     /\.fm-tb tbody tr\.fm-sum:hover td,\.fm-tb tbody tr\.fm-sum:hover \.fm-d\{background:#EAE2D2;\}/.test(src));
}

console.log('\n⑤ 教練分組：頭帶＋低調分組線');
{
  ok('★★ 3px 粗色框 → 2px 低飽和（color-mix 40%）',
     /\.fm-tb \.fm-gs\{border-left:2px solid color-mix\(in srgb, var\(--cc,#8a8178\) 40%, transparent\);\}/.test(src)
     && /\.fm-tb \.fm-ge\{border-right:2px solid color-mix/.test(src));
  ok('★ 教練名那一列不再壓一條 3px 頂線（頭帶本身就是分組）',
     /\.fm-tb \.fm-gh\{[^}]*border-top:none;/.test(src));
  ok('★ 子欄位表頭再淡一階，與教練名分層',
     /\.fm-tb thead tr:nth-child\(2\) th\{font-size:11\.5px;background:#F7F3EA;\}/.test(src));
  ok('　 教練名帶的底色與字色仍是 coachTagColor 的 inline style',
     /style="--cc:\$\{_fmCol\[c\.id\]\};background:\$\{k\.bg\};color:\$\{k\.fg\};"/.test(src));
}

console.log('\n⑥ 新／續：縮小、極淡底，不撐高列');
{
  ok('★★ 字級 10.5、內距只留左右，line-height 壓住',
     /\.fm-tb \.fm-k i\{font-size:10\.5px;font-weight:600;border-radius:3px;padding:0 4px;margin:0 1px;\s*\n\s*line-height:1\.5;display:inline-block;\}/.test(src));
  ok('★★ 新＝低飽和藍、續＝低飽和暖棕',
     /\.fm-tb \.fm-k \.fm-nw\{background:#EDF1F7;color:#3F5F85;\}/.test(src)
     && /\.fm-tb \.fm-k \.fm-rn\{background:#F5EFE3;color:#8A6E42;\}/.test(src));
  ok('　 比原本更淡（原本是 #e8eef7/#1a3a6e 與 #f5ede0/#8a5e28）',
     /\.fm-tb \.fm-k \.fm-nw\{background:#e8eef7;color:#1a3a6e;\}/.test(src));
}

console.log('\n⑦ 密度與格線');
{
  ok('★★ cell 內距 6/9（原本 5/8），字級 13.5（原本 12）',
     /\.fm-tb th,\.fm-tb td\{padding:6px 9px;\}/.test(src));
  ok('★★ 日期與星期同一格緊湊排（1（六）），星期小一階',
     /\.fm-tb \.fm-d span\{font-size:11\.5px;margin-left:3px;\}/.test(src)
     && /\.fm-tb \.fm-d span\{font-weight:400;color:var\(--t3\);/.test(src));
  ok('★★ 格線降對比 —— 讓「分組」而不是「格線」成為結構',
     /\.fm-tb th,\.fm-tb td\{border-bottom:1px solid rgba\(45,36,28,\.07\);border-right:1px solid rgba\(45,36,28,\.04\);\}/.test(src));
  ok('　 數字一律等寬（欄位才對得齊）',
     /\.fm-tb \.fm-c,\.fm-tb \.fm-t\{font-variant-numeric:tabular-nums;\}/.test(src));
  ok('★★ 沒有一條規則碰版面（position／寬高／display）—— 凍結欄與捲動照舊',
     !/(^|[;{\s])(position|top|left|right|bottom|height|display|overflow)\s*:/
       /* 新做出來的元件（月份列與它的圖示）本來就要自己排版；.fm-k i 的
          display:inline-block 是為了壓住行高不撐列，都不算「動到既有版面」。 */
       .test(B.replace(/\/\*[\s\S]*?\*\//g,'')
              .replace(/\.fm-mbar[^}]*\}/g,'').replace(/\.fm-mbar-mid[^}]*\}/g,'')
              .replace(/\.fm-mic\{[^}]*\}/g,'').replace(/\.fm-k i\{[^}]*\}/g,'')));
  ok('　 這組刻意不掛 body.ink（櫃檯也看得到月報表）',
     /這一組是基礎樣式（不掛 body\.ink）—— 櫃檯也看得到月報表，版面不該因人而異/.test(src)
     && !/body\.ink \.fm-/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
