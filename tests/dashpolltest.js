/* 2026-08-12 使用者回報：「抽獎是剛剛櫃檯選好了，但是我 Mac 沒有即時更新」——
   跨裝置更新漏接的兩個破口：
   ① remoteSigChanged 是一次性的（比對完就記下新簽章）；那一輪 dashRevalidate
      若因彈窗／課卡展開被擋掉直接 return，下一輪簽章已「沒變」→ 更新永遠漏掉。
      → 被擋時掛 window._dashDirty，輪詢每輪補追，收合後補重繪。
   ② 課卡抽獎鈕的資格快取 window._lottoMapCache 有 60 秒 TTL；別台抽完獎、
      本機就算重繪也可能沿用舊 map → 資料簽章真的變了就把快取作廢。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(i<0)return '';if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 首頁輪詢不再漏接（_dashDirty 補追）');
{
  ok('★★ 輪詢條件：簽章變了「或」上次被擋（_dashDirty）都要重抓',
     /if\(await remoteSigChanged\(\) \|\| window\._dashDirty\) dashRevalidate\(_dashTabs\.map\(x=>x\.t\)\);/.test(src));
  const F=grabFn('dashRevalidate');
  ok('★★ 被彈窗擋掉時掛 _dashDirty 再 return（下一輪補追）',
     /if\(document\.getElementById\('modal-bg'\)\)\{ window\._dashDirty=true; return; \}/.test(F));
  ok('★★ 被展開的課卡擋掉時也掛 _dashDirty',
     /if\(document\.querySelector\('\.cal-ev-active'\)\)\{ window\._dashDirty=true; return; \}/.test(F));
  ok('★ 成功走到簽章比對就清掉 _dashDirty（不會無限重抓）',
     /window\._dashDirty=false;\s*\n\s*if\(dashDataSig\(/.test(F));
}

console.log('\n② 抽獎資格快取跟著資料失效');
{
  const F=grabFn('dashRevalidate');
  ok('★★ 資料簽章真的變了 → _lottoMapCache 作廢，再重繪（課卡 🎁 立即反映別台的抽獎）',
     /window\._lottoMapCache=null;[^\n]*\n\s*navTo\(CUR_PAGE\);/.test(F));
  ok('★ 本機抽完獎也會立即作廢快取（lottoAwardDo，2026-07-27 既有行為守住）',
     /window\._lottoMapCache=null;\s*\/\/ 抽完立即失效/.test(src) && /window\._lottoDirty=true;/.test(src));
  ok('　　課卡抽獎鈕的 60 秒 TTL 仍在（沒被誤刪；平時省算力）',
     /\(Date\.now\(\)-_c\.ts\)>60000/.test(src));
}
console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
