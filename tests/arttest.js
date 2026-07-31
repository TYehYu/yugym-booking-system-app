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
ok('★ 放在首頁左欄最上方（「當月排班」按鈕之上）',
   /\$\{butlerArtHtml\(\)\}\s*\n\s*<!-- 2026-07-26 使用者指示：「當月排班」按鈕/.test(src));
ok('★ 兩層 <img> 交叉淡入（換圖不閃白）',
   /<img class="mc-art-img" id="mc-art-a" alt=""><img class="mc-art-img" id="mc-art-b" alt="">/.test(src)
   && /\.mc-art-img\{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity \.7s ease;\}/.test(src));
ok('★ 維持原圖比例，不裁切到角色', /aspect-ratio:1854\/854;/.test(src));
ok('　　尊重系統的減少動態設定', /@media \(prefers-reduced-motion:reduce\)\{ \.mc-art-img\{transition:none;\} \}/.test(src));
ok('　　純裝飾，不進輔助工具的朗讀', /aria-hidden="true"/.test(g('function butlerArtHtml(){','\n}\n')));
ok('　　標註插畫作者', /title="插畫：@_Fergus\.art_"/.test(src));

console.log('\n計時器');
{
  const st=g('function startButlerArt(){','\n}\n');
  ok('★ 每 9 秒換一張', /const BUTLER_ART_MS=9000;/.test(src) && /\}, BUTLER_ART_MS\);/.test(st));
  ok('★ 元素不在就自己收掉（換頁不留殘留計時器）',
     /if\(!document\.getElementById\('mc-art'\)\)\{ clearInterval\(_artTimer\); _artTimer=null; return; \}/.test(st));
  ok('★ 重入保護：重新進首頁不會疊兩個計時器',
     /if\(_artTimer\)\{ clearInterval\(_artTimer\); _artTimer=null; \}/.test(st));
  ok('★ 分頁在背景時不換圖', /if\(document\.hidden\) return;/.test(st));
  ok('★ onload 先掛再設 src（快取命中時也會觸發）',
     st.indexOf('nxt.onload=')<st.indexOf('nxt.src=butlerArtNext();'));
  ok('★ 沒有元素就直接返回（手機版面沒有這一塊）', /if\(!a\|\|!b\) return;/.test(st));
  ok('　　首頁渲染完才啟動，且不讓它拖垮整頁',
     /try\{ startButlerArt\(\); \}catch\(_\)\{\}/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
