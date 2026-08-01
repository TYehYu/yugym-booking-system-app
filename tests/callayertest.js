/* 2026-08-01 使用者回報：
   「我剛剛把8/12 21:00待簽約劉世清移動到20:00 畫面沒有馬上更新 要點刷新才會更改」

   成因：「單日時間軸」滿版層是 appendChild 到 <body> 的獨立圖層，不在頁面內容 C 裡面。
   從課卡明細改完時間會走 saveBookingTime → navTo(CUR_PAGE)，那支重繪的是圖層「底下」那一頁，
   蓋在上面的圖層完全沒被碰到 → 看到的還是舊位置。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('修法');
ok('★ navTo 重繪完會一併重畫滿版圖層',
   /if\(typeof refreshCalLayers==='function'\) refreshCalLayers\(\);   \/\/ 掛在 body 的滿版行事曆圖層也要跟著重畫（2026-08-01）/.test(src));
ok('★ 有 refreshCalLayers 這支', /function refreshCalLayers\(\)\{/.test(src));
ok('★ 只在圖層還開著時才重畫（display 不是 none）',
   /if\(dt && dt\.style\.display!=='none' && typeof renderDayTimeline==='function'\) renderDayTimeline\(\);/.test(src));
ok('★ 整段包 try —— 重畫失敗不能讓切頁壞掉', /function refreshCalLayers\(\)\{\s*\n\s*try\{/.test(src));
ok('　　成因寫在程式裡（給下一個人看）', /是 appendChild 到 <body> 的獨立圖層，不在頁面內容 C 裡面/.test(src));
ok('　　也註明手機版 agenda 不受影響（它在 C 裡）', /手機版的 agenda\/週曆掛在 C 裡的 #wtl-page，navTo 本來就會重畫/.test(src));

console.log('\n這個圖層的既有事實（修法建立在這些之上）');
ok('★ 單日時間軸確實是掛在 body', /host\.id='day-timeline-modal';[\s\S]{0,120}document\.body\.appendChild\(host\);/.test(src));
ok('★ 關閉時是設 display:none（所以要用 display 判斷開沒開）',
   /if\(host\)\{ host\.style\.display='none'; host\.innerHTML=''; \}/.test(src));
ok('★ renderDayTimeline 會重抓 bookings（不是畫舊資料）',
   /const host=document\.getElementById\('day-timeline-modal'\); if\(!host\) return;[\s\S]{0,400}await Promise\.all\(\[dbGetAll\('bookings'\)/.test(src));
ok('★ 手機版行事曆掛在 C 裡（navTo 本來就會重畫）',
   /C\.innerHTML=`<div id="wtl-page"><\/div>`;\s*\n\s*await renderCoachAgenda\(\);/.test(src));
ok('★ 改時間的收尾確實只有 navTo（原本沒人重畫圖層）',
   /closeModal\(\);showToast\('已更新預約'\);navTo\(CUR_PAGE\);/.test(src));

console.log('\n實跑：開著才重畫');
{
  const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  let drew=0;
  const mk=(el)=>new Function('document','renderDayTimeline',
    g('function refreshCalLayers(){','\n}\n')+'\nreturn refreshCalLayers;')(
    {getElementById:id=>id==='day-timeline-modal'?el:null}, ()=>{drew++;});

  drew=0; mk({style:{display:'flex'}})();
  eq('★ 圖層開著 → 重畫一次', drew, 1);
  drew=0; mk({style:{display:'none'}})();
  eq('★ 圖層關著 → 不重畫', drew, 0);
  drew=0; mk(null)();
  eq('　　根本沒有這個圖層 → 不重畫也不爆', drew, 0);
  drew=0;
  const boom=new Function('document','renderDayTimeline',
    g('function refreshCalLayers(){','\n}\n')+'\nreturn refreshCalLayers;')(
    {getElementById:()=>{throw new Error('boom');}}, ()=>{drew++;});
  let threw=false; try{ boom(); }catch(_){ threw=true; }
  eq('★ 取 DOM 爆掉也不會往上丟（切頁不能因此壞掉）', threw, false);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
