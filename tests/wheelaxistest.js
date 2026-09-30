/* 時間／日期滾輪只能垂直捲（2026-09-30 使用者）：
   「時間滾輪能夠固定垂直方向嗎 現在滾的時候會有左右移動 應該不需要」

   根因是 CSS 的一條規定：**一軸是 auto/scroll 時，另一軸的 visible 會被當成 auto**。
   .wh-col 只寫了 overflow-y:auto，於是 overflow-x 實際被計算成 auto
   （Playwright 量過：getComputedStyle(.wh-col).overflowX === 'auto'），
   而 .wh-item.on 的 scale(1.06) 剛好撐出 3px，那 3px 就成了可以左右捲的空間。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 水平那一軸關死');
{
  const C=g('.wh-col{','}');
  ok('★★★ 明寫 overflow-x:hidden（不能只寫 overflow-y）', /overflow-x:hidden;/.test(C));
  ok('★★★ 垂直仍然可捲', /overflow-y:auto;/.test(C));
  /* 光靠 overflow 擋不住觸控的水平慣性 —— 手指斜著滑仍然會帶著跑 */
  ok('★★★ touch-action:pan-y（手指只吃垂直手勢）', /touch-action:pan-y;/.test(C));
  ok('★★ 捲到底不要把後面的彈窗一起帶著跑', /overscroll-behavior:contain;/.test(C));
  ok('★★ 貼齊仍是垂直方向', /scroll-snap-type:y mandatory;/.test(C));
}

console.log('\n② 沒有動到滾輪的行為');
{
  ok('★★★ 一格 44px、貼齊置中（改的是軸向，不是尺寸）',
     /\.wh-item\{height:44px;line-height:44px;scroll-snap-align:center;/.test(src));
  ok('★★★ 選中那格照樣放大（它正是撐出那 3px 的原因，但那是刻意的視覺重點）',
     /\.wh-item\.on\{color:var\(--text\);transform:scale\(1\.06\);\}/.test(src));
  ok('★★ 捲動判定仍是「離中央最近的那一格」',
     /const i=Math\.round\(col\.scrollTop\/ASH_WH_ITEM\);/.test(src));
  ok('★★ 點一下也還能選（滑鼠使用者靠這條）',
     /onclick="ashWheelGo\('\$\{key\}',\$\{i\},1\)"/.test(src));
  ok('★★ 捲軸仍然藏著', /scrollbar-width:none;/.test(src)
     && /\.wh-col::-webkit-scrollbar\{width:0;display:none;\}/.test(src));
}

console.log('\n③ 成因寫在原地');
{
  ok('★★★ 把那條 CSS 規定寫出來（下一個人才不會又只寫一軸）',
     /一軸是 auto\/scroll 時，另一軸的 visible 會被當成 auto/.test(src));
  ok('★★ 也寫明 scale 是那幾 px 的來源',
     /\.wh-item\.on 的 scale\(1\.06\) 撐出來的那幾 px/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
