/* 2026-08-11 使用者回報：「客戶端簽約的時候，有人反應簽名欄太小，
   可以讓客戶點簽名欄以後放大變成橫向佔滿畫面嗎」
   —— 會員簽約的簽名欄改為「點一下 → 全螢幕橫向簽名板」，簽完縮繪回原 canvas。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(i<0)return '';if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 會員簽約的簽名欄＝點一下放大');
{
  const F=grabFn('memSignContract');
  ok('★★ 小框不再直接手寫（pointer-events:none），點整塊開全螢幕',
     /<div class="ct-sign-wrap" onclick="signFullOpen\(\)"/.test(F)
     && /<canvas class="ct-sign" id="ct-sign" style="pointer-events:none;">/.test(F));
  ok('★ 有「點一下放大」提示，簽完會消失、清除後復原',
     /id="ct-sign-hint"/.test(F) && /onclick="memSignClear\(\)"/.test(F));
  ok('★ 全系統只剩會員端這一顆手寫板（平板簽名 2026-07-28 已廢除），不會誤傷別的流程',
     (src.match(/<canvas class="ct-sign" id="ct-sign"/g)||[]).length===1
     /* 2026-09-04：ctSetType 精簡（建約不選簽署方式），但那一行「把平板簽名板藏起來」
        仍然要在 —— ct-sign-box 的 DOM 還在頁面上，不藏就會露出來。 */
     && /const s2=document\.getElementById\('ct-sign-box'\); if\(s2\) s2\.style\.display='none';/.test(src));
}

console.log('\n② 全螢幕橫向簽名板');
{
  const F=grabFn('signFullOpen');
  ok('★★ 內容旋轉 90°、佔滿畫面（手機轉橫＝滿版簽名板）',
     /rotate\(90deg\)/.test(F) && /position:fixed;inset:0;/.test(F));
  ok('★★ 座標換算跟著旋轉（u=y-rect.top、v=rect.right-x），筆跡永遠跟著手指',
     /return \[e\.clientY-r\.top, r\.right-e\.clientX\];/.test(F));
  ok('★ LIFF 擋原生捲動：touchmove preventDefault（passive:false）',
     /host\.addEventListener\('touchmove',e=>e\.preventDefault\(\),\{passive:false\}\)/.test(F));
  ok('★ devicePixelRatio 縮放（簽名不糊）',
     /cv\.width=cw\*ratio; cv\.height=ch\*ratio;/.test(F) && /ctx\.scale\(ratio,ratio\);/.test(F));
  ok('　　三顆按鈕（取消／清除重簽／完成）也轉 90°，轉橫看是正的',
     /signFullCancel\(\)/.test(F) && /signFullClear\(\)/.test(F) && /signFullDone\(\)/.test(F)
     && /transform:rotate\(90deg\);white-space:nowrap;/.test(F));
}

console.log('\n③ 簽完回寫：後端流程完全不動');
{
  const F=grabFn('signFullDone');
  ok('★★ 沒簽就按完成要擋', /if\(!window\._signFullInk\)\{ showToast\('請先在框內簽名'\); return; \}/.test(F));
  ok('★★ 筆跡等比例縮繪回 #ct-sign（memSignContractDo 讀的還是同一顆 canvas）',
     /const s=Math\.min\(W\/full\.width, H\/full\.height\);/.test(F)
     && /sctx\.drawImage\(full, 0,0,full\.width,full\.height,/.test(F));
  ok('★ 回寫後標記已簽（window._signInk），送出鈕才會放行',
     /window\._signInk=true;/.test(F));
}
console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
