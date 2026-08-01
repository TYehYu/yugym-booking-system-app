/* 2026-08-01 使用者指示（附 Mac 上的行事曆截圖）：
   「這是 mac 的格式寬距，可以幫我保持這個畫面的相對位子，
     如果用其他解析度閱讀的話，只要等比例縮放」
   「整個系統都做看看，先記住變更之前的版本，我不滿意就改回來」

   原本各處是「重排」：螢幕變窄就換行、間距縮小、欄位擠在一起。改成整個桌機畫面
   依視窗寬度等比放大縮小，版面關係固定不動。

   ⚠ zoom 會讓「元素座標」與「window.innerWidth/Height」不是同一把尺 ——
   凡是拿 innerHeight 減 getBoundingClientRect() 再寫回 style 的地方都要除以縮放比。
   還原點：commit e036cdd／v260801.2245，或把 UI_SCALE_ON 改成 false。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 縮放比計算');
{
  const i=src.indexOf('const UI_SCALE_ON=true, UI_SCALE_REF=1440');
  const j=src.indexOf("window.addEventListener('resize', ()=>{ try{ fitUiScale(); }catch(_){} });", i);
  const code=src.slice(i,j);
  const run=(w, mobile, on)=>{
    let zoom='__unset__', cls=null;
    const body={ style:{ set zoom(v){ zoom=v; }, get zoom(){ return zoom; } },
      classList:{ toggle:(c,v)=>{cls=v?c:null;}, remove:()=>{cls=null;} } };
    const doc={ body, querySelector:()=>null };
    const win={ innerWidth:w, _uiZ:undefined };
    const f=new Function('document','window','isMobileLayout',
      (on===false?code.replace('const UI_SCALE_ON=true','const UI_SCALE_ON=false'):code)
      +'\nreturn {fitUiScale,uiScale};')(doc,win,()=>!!mobile);
    f.fitUiScale();
    return {z:win._uiZ, zoom, scaled:cls==='ui-scaled'};
  };

  eq('★ 基準寬度 1440 → 不縮放（1:1）', run(1440).z, 1);
  eq('　　1:1 時不寫 zoom（維持原生行為）', run(1440).zoom, '');
  eq('★ 1920 寬 → 放大 1.333 倍', run(1920).z, 1.333);
  eq('★ 1280 寬 → 縮小 0.889 倍', run(1280).z, 0.889);
  eq('★ 下限 0.72（再小字看不清）', run(800).z, 0.72);
  eq('★ 上限 1.5（再大一屏塞不下幾張課卡）', run(3000).z, 1.5);
  eq('★ 手機版面不套（那邊本來就該重排）', run(1200,true).z, 1);
  eq('★ UI_SCALE_ON=false 就完全還原（一行關掉）', run(1920,false,false).z, 1);
  eq('　　有縮放時掛上 ui-scaled，供 CSS 需要時判斷', run(1920).scaled, true);
  eq('　　1:1 時不掛', run(1440).scaled, false);
}

console.log('\n② 座標換算（zoom 之後 window 與元素不是同一把尺）');
ok('★ 有 uiScale() 可取用目前的縮放比', /function uiScale\(\)\{ return Number\(window\._uiZ\)\|\|1; \}/.test(src));
ok('★ 行事曆填滿視窗的高度要除以縮放比',
   /const h=Math\.max\(360, Math\.round\(\(window\.innerHeight - top - gap\)\/uiScale\(\)\)\);/.test(src));
ok('★ 教練任務卡的可用高度也要除',
   /const avail=Math\.max\(220, Math\.round\(\(window\.innerHeight - top - 14\)\/uiScale\(\)\)\);/.test(src));
ok('★ 合併式下拉的浮出選單（position:fixed 但在 body 內）也要除',
   /const _z=uiScale\(\);/.test(src)
   && /menu\.style\.left=Math\.round\(r\.left\/_z\)\+'px';/.test(src)
   && /menu\.style\.top=Math\.round\(r\.bottom\/_z\+4\)\+'px';/.test(src));
ok('　　選單的最大高度同理', /menu\.style\.maxHeight=Math\.max\(120,Math\.min\(300,\(\(up\?above:below\)-8\)\/uiScale\(\)\)\)\+'px';/.test(src));
ok('　　⚠ 這件事寫在程式裡（下次改這幾支不會忘）',
   /zoom 會讓「元素座標」與「window\.innerWidth\/Height」不同尺/.test(src));

console.log('\n③ 什麼時候重算');
ok('★ 視窗改變大小', /window\.addEventListener\('resize', \(\)=>\{ try\{ fitUiScale\(\); \}catch\(_\)\{\} \}\);/.test(src));
ok('★ 登入後套一次', /try\{ fitUiScale\(\); \}catch\(_\)\{\}   \/\/ 全系統等比例縮放/.test(src));
ok('★ 桌機↔手機版面切換時跟著開關',
   /try\{ fitUiScale\(\); \}catch\(_\)\{\}   \/\/ 手機版面不套縮放，切換時要跟著開關/.test(src));
ok('★ 縮放比一變，那兩支量高度的要重算（結果依賴縮放比）',
   /try\{ if\(document\.querySelector\('\.cal-wrap'\)\) fitCalWrapHeight\(\); \}catch\(_\)\{\}/.test(src)
   && /try\{ if\(document\.querySelector\('\.mc-g5-mid \.mc-coachcenter'\)\) fitCoachCards\(\); \}catch\(_\)\{\}/.test(src));
ok('　　沒變就不動（避免每次 resize 都重排整頁）', /if\(window\._uiZ===z\) return;/.test(src));

console.log('\n④ 還原路徑');
ok('★ 有總開關 UI_SCALE_ON，設 false 即完全還原',
   /const UI_SCALE_ON=true, UI_SCALE_REF=1440, UI_SCALE_MIN=0\.72, UI_SCALE_MAX=1\.5;/.test(src));
ok('　　基準寬度是常數，要換螢幕基準改一個數字就好', /UI_SCALE_REF=1440/.test(src));
ok('　　使用者的原話與還原方式寫在程式裡',
   /只要等比例縮放/.test(src) && /UI_SCALE_ON 是總開關，設 false 即完全還原成改版前的行為/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
