/* 首頁左上角插畫輪播（2026-07-31 使用者指示：隨機連播）

   位置＝管理員／櫃檯桌機首頁左欄最上方（「當月排班」按鈕之上、月曆之上）。
   隨機＝每輪把清單洗牌後依序播完再重洗，所以不會連續出現同一張。 */
const fs=require('fs');
const path=require('path');
const ROOT=process.env.HOME+'/Projects/yugym-booking-system-app';
const src=fs.readFileSync(ROOT+'/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

console.log('圖檔');
{
  const dir=ROOT+'/img/butler';
  const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/\.jpg$/.test(f)).sort():[];
  eq('★ 13 張都在 img/butler/', files.length, 13);
  const list=new Function(g('const BUTLER_ART=[','];')+'\nreturn BUTLER_ART;')();
  eq('★ 程式裡的清單與實際檔案一致', list.slice().sort(), files);
  const big=files.filter(f=>fs.statSync(path.join(dir,f)).size>200*1024);
  ok('★ 每張都壓過（<200KB，原圖 2–4MB）', big.length===0, big);
  const total=files.reduce((s,f)=>s+fs.statSync(path.join(dir,f)).size,0);
  ok('　　整包 <1MB（' + Math.round(total/1024) + 'KB）', total<1024*1024);
}

console.log('\n隨機連播');
{
  const code=g('function butlerArtNext(){','\n}\n');
  const api=n=>{
    const f=new Function('BUTLER_ART','Math', 'let _artQueue=[];\n'+code+'\nreturn butlerArtNext;')
      (Array.from({length:n},(_,i)=>'x'+i), Math);
    return f;
  };
  const f=api(13);
  const first=Array.from({length:13},()=>f());
  eq('★ 一輪 13 次不重複（洗牌後依序播完）', new Set(first).size, 13);
  ok('★ 路徑指向 img/butler/', first.every(u=>u.startsWith('img/butler/')));
  // 連續兩輪之間仍可能剛好接同一張，但一輪內絕不重複 —— 這是「隨機但不亂跳」的取捨
  const second=Array.from({length:13},()=>f());
  eq('　　第二輪同樣 13 張不重複', new Set(second).size, 13);
  ok('　　兩輪順序不同（有真的重洗）', first.join()!==second.join());
  const f2=api(1);
  eq('　　只有一張也不會爆', [f2(),f2()], ['img/butler/x0','img/butler/x0']);
}

console.log('\n版面');
/* 2026-07-31 二修：往上移到頂欄正下方（原本在左欄第一格），並關閉自動輪播改成點選換圖 */
ok('★ 放在頁面最上方、頂欄正下方（不再包在左欄裡）',
   /\$\{isMobileLayout\(\)\?'':butlerArtHtml\(\)\}/.test(src)
   && !/\$\{butlerArtHtml\(\)\}\s*\n\s*<!-- 2026-07-26 使用者指示：「當月排班」/.test(src));
ok('★ 寬度對齊左欄（300px），負上邊距抵掉頁面內距',
   /\.mc-art-top\{width:300px;max-width:100%;margin:-6px 0 12px;\}/.test(src));
ok('★ 手機版面不顯示（那裡沒有這一塊）', /isMobileLayout\(\)\?'':butlerArtHtml\(\)/.test(src));
ok('★ 兩層 <img> 交叉淡入（換圖不閃白）',
   /<img class="mc-art-img" id="mc-art-a" alt=""><img class="mc-art-img" id="mc-art-b" alt="">/.test(src)
   && /\.mc-art-img\{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity \.7s ease;\}/.test(src));
ok('★ 維持原圖比例，不裁切到角色', /aspect-ratio:1854\/854;/.test(src));
ok('　　尊重系統的減少動態設定', /@media \(prefers-reduced-motion:reduce\)\{ \.mc-art-img\{transition:none;\} \}/.test(src));
ok('　　標註插畫作者與操作方式', /title="點一下換一張　·　插畫：@_Fergus\.art_"/.test(src));

console.log('\n點選更換（不再自動輪播）');
{
  const sw=g('function butlerArtSwap(){','\n}\n');
  ok('★ 自動輪播整組移除（沒有 setInterval、沒有 BUTLER_ART_MS）',
     !/BUTLER_ART_MS/.test(src) && !/_artTimer/.test(src));
  ok('★ 點一下換下一張', /onclick="butlerArtSwap\(\)"/.test(src));
  ok('★ 看得出可以點（游標、hover 邊框、按下回饋）',
     /\.mc-art\{[\s\S]{0,220}cursor:pointer;\}/.test(src)
     && /\.mc-art:hover\{border-color:var\(--green\);\}/.test(src)
     && /\.mc-art:active\{transform:scale\(\.995\);\}/.test(src));
  ok('★ 鍵盤也能操作（Enter／空白鍵）',
     /role="button" tabindex="0"/.test(src)
     && /onkeydown="if\(event\.key==='Enter'\|\|event\.key===' '\)\{event\.preventDefault\(\);butlerArtSwap\(\);\}"/.test(src));
  ok('★ 連點保護：上一張還沒載完不會再換（避免兩層都半透明）',
     /if\(!a\|\|!b\|\|_artBusy\) return;/.test(sw) && /_artBusy=true;/.test(sw));
  ok('★ 圖載不出來也要解鎖，不會從此點不動', /nxt\.onload=nxt\.onerror=\(\)=>\{/.test(sw));
  ok('★ onload 先掛再設 src（快取命中時也會觸發）',
     sw.indexOf('nxt.onload=')<sw.indexOf('nxt.src=butlerArtNext();'));
  ok('　　換完才把「哪一層在上面」翻面', /_artTop=!_artTop; _artBusy=false;/.test(sw));
}

console.log('\n初始');
{
  const st=g('function startButlerArt(){','\n}\n');
  ok('★ 進首頁先隨機給一張', /a\.src=butlerArtNext\(\); a\.style\.opacity='1'; b\.style\.opacity='0';/.test(st));
  ok('★ 沒有元素就直接返回（手機版面沒有這一塊）', /if\(!a\|\|!b\) return;/.test(st));
  ok('　　重進首頁時把狀態歸零', /_artTop=false; _artBusy=false;/.test(st));
  ok('　　首頁渲染完才啟動，且不讓它拖垮整頁',
     /try\{ startButlerArt\(\); \}catch\(_\)\{\}/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
