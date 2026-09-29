/* 經營報表的說明文字簡化（2026-09-30 使用者：
   「經營報表下面的這些文字 可以簡化嗎 給重點就好」）

   原本兩段共 9 條長句、約 580 字，會計上都必要，但平常看報表不會逐句讀。
   改成「名目 → 一句話」的重點條，數字等式單獨一行；
   勞健保誰付、稅怎麼估這些「要查才看」的收進〔為什麼〕的展開區。
   ⚠ 一個字都沒刪 —— 每一條資訊還在不在，由 finpnltest／salarypartstest／
     salesbasetest／ownerinstest／fintidytest 那五支原本的斷言繼續守著。
     這一支只守「簡化本身」：結構對不對、該留在外面的有沒有被收進去。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};
const bare=src.replace(/\/\*[\s\S]*?\*\//g,' ');

/* 兩段說明各自切出來 */
const PNL=g('      <div class="nk">\n        <div class="nk-r"><span class="nk-k">銷課金額</span>','</details>\n      </div>');
const SAL=g('    <div class="nk">\n      <div class="nk-r"><span class="nk-k">顏色</span>','</details>\n    </div>`;');

console.log('① 損益表下面：5 行重點 ＋ 一個展開區');
{
  eq('★★★ 外面剛好 5 行（銷課金額／收款／營業稅／員工薪資／人事總支出）',
     (PNL.match(/class="nk-r"/g)||[]).length, 5);
  eq('★★★ 名目就是那五個',
     (PNL.match(/<span class="nk-k">([^<]+)<\/span>/g)||[]).map(x=>x.replace(/<[^>]+>/g,'')),
     ['銷課金額','收款','營業稅','員工薪資','人事總支出']);
  eq('★★★ 只有一個展開區，不要一條一個', (PNL.match(/<details/g)||[]).length, 1);
  eq('★★ 展開區裡 4 段（看銷課不看收款／稅怎麼估／自付不用再扣／淨利唯一）',
     (PNL.match(/<p><b>/g)||[]).length, 4);
  /* 錢的等式要留在外面，收進展開區就等於又藏起來 */
  ok('★★★ 人事總支出的等式在外面（不在 details 裡）',
     /<span class="nk-v nk-eq">\$\{m\(salary\)\} ＋ 公司負擔 \$\{m\(coIns\)\} ＝ <b>\$\{m\(staffCost\)\}<\/b><\/span>/.test(PNL)
     && PNL.indexOf('nk-eq')<PNL.indexOf('<details'));
  /* 稅那一條有兩種狀態，簡化之後兩條分支都要還在 */
  ok('★★★ 營業稅「已填實際數／尚未填」兩種都還在',
     /已填實際應納 <b>\$\{m\(_vat\.periodAmount\)\}<\/b>，本月依收款比例攤回 <b>\$\{m\(tax\)\}<\/b>。/.test(PNL)
     && /<b>尚未填實際數<\/b>，先按內含 5% 預估。/.test(PNL));
  ok('★★ 期別仍寫出來（9–10 月期／11–12 月期…）', /\$\{vatPeriodLabel\(_vat\.period\)\}期/.test(PNL));
}

console.log('\n② 員工薪資明細下面：3 行重點 ＋ 一個展開區');
{
  eq('★★★ 外面剛好 3 行（顏色／實領合計／人事總支出）',
     (SAL.match(/class="nk-r"/g)||[]).length, 3);
  eq('★★★ 名目就是那三個',
     (SAL.match(/<span class="nk-k">([^<]+)<\/span>/g)||[]).map(x=>x.replace(/<[^>]+>/g,'')),
     ['顏色','實領合計','人事總支出']);
  eq('★★ 展開區裡 3 段（勞健保誰付／實領 vs 應發／請假扣薪）',
     (SAL.match(/<p><b>/g)||[]).length, 3);
  /* ⚠ 0901 使用者問過「為何這兩個數字對不上？」——兩條等式一定要看得到 */
  ok('★★★ 兩條等式都在外面，一條都沒被收進展開區',
     (SAL.match(/class="nk-v nk-eq"/g)||[]).length===2
     && SAL.lastIndexOf('nk-eq')<SAL.indexOf('<details'));
  ok('★★★ 沒有人請假時兩條等式都不多一段（那一項是 0，畫面不多字）',
     (SAL.match(/tot\.leave\?` − 請假扣薪 \$\{m\(tot\.leave\)\}`:''\}/g)||[]).length===2);
  ok('★★ 顏色那一行用真的顏色畫（綠＝給、紅＝扣）',
     /<b style="color:var\(--ok,#1F6F54\);">綠<\/b>＝給出去的、<b style="color:var\(--danger\);">紅<\/b>＝扣的。/.test(SAL));
}

console.log('\n③ 舊的長句已經收乾淨');
{
  ok('★★★ 舊的 .pnl-note 與 .sal-mx-note 區塊不再被畫出來',
     !/<div class="pnl-note">/.test(bare) && !/<div class="sal-mx-note">/.test(bare));
  ok('★★ 那兩支 CSS 留著（別的地方還在用 .pnl-note 的語彙就不要順手刪）',
     /\.pnl-note\{font-size:11\.5px/.test(src) && /\.sal-mx-note\{font-size:11px/.test(src));
  ok('★★ 原本那三句長註腳沒有留下殘句',
     !/公司這個月實際的人事支出＝應發合計/.test(bare)
     && !/第一欄「實領」的合計/.test(bare)
     && !/本月實際<b>收款<\/b>/.test(bare));
}

console.log('\n④ 樣式');
{
  ok('★★★ 重點條的樣式有定義（名目固定寬，值自己換行）',
     /\.nk-r\{display:flex;gap:9px;align-items:baseline;/.test(src)
     && /\.nk-k\{flex:none;width:86px;/.test(src)
     && /\.nk-v\{flex:1;min-width:0;/.test(src));
  ok('★★★ 等式用數字字體（位數才對得齊）', /\.nk-eq\{font-family:var\(--num\);/.test(src));
  ok('★★ 展開鈕不要瀏覽器預設的三角形（兩種瀏覽器都要收）',
     /\.nk-more summary\{[\s\S]{0,180}?list-style:none;/.test(src)
     && /\.nk-more summary::-webkit-details-marker\{display:none;\}/.test(src));
  /* 名目欄 86px 在手機上會把值擠成一直條 */
  ok('★★ 窄螢幕把名目欄收窄', /@media\(max-width:520px\)\{ \.nk-k\{width:72px;\} \}/.test(src));
  ok('★★ 理由寫在原地（下一個人不要又把細節攤回外面）',
     /原本兩段共 9 條長句、約 580 字，會計上都必要，但平常看報表不會逐句讀/.test(src)
     && /收進〔為什麼〕就等於又藏起來了/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
