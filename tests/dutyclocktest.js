/* 2026-08-06 使用者指示（附今日值班截圖）：
   「更換填滿的方式，改成像時鐘 —— 例如過了 1/4 的時間，則填滿右上角 1/4 圓，分成 60 等份」

   原本是水位（由下往上注水），改成從 12 點順時針長出來的扇形，每格 6°（60 等份）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const box=new Function('const DUTY_SEGS=60;\n'+grabFn('dutyClockSeg')+'\n'+grabFn('dutyClockPath')
  +'\nreturn {dutyClockSeg,dutyClockPath};')();

console.log('① 分成 60 等份');
eq('★ 還沒開始 → 0 格', box.dutyClockSeg(0), 0);
eq('★ 過了 1/4 的時間 → 15 格（右上角 1/4 圓）', box.dutyClockSeg(25), 15);
eq('★ 一半 → 30 格', box.dutyClockSeg(50), 30);
eq('★ 3/4 → 45 格', box.dutyClockSeg(75), 45);
eq('★ 做滿 → 60 格（整圈）', box.dutyClockSeg(100), 60);
eq('　　未滿一格不填（無條件捨去）', box.dutyClockSeg(1), 0);
eq('　　差一點點也不給整圈（99% → 59 格）', box.dutyClockSeg(99), 59);
eq('　　超過 100 仍封頂 60', box.dutyClockSeg(130), 60);

console.log('\n② 扇形路徑（圓心 32,32／半徑 26／從 12 點順時針）');
{
  const p15=box.dutyClockPath(15);
  ok('★ 1/4 圓：從正上方 (32,6) 畫到正右方 (58,32)',
     /^M32 32 L32 6 A26 26 0 0 1 58\.00 32\.00 Z$/.test(p15), p15);
  const p30=box.dutyClockPath(30);
  ok('★ 半圈：畫到正下方 (32,58)，仍走小弧旗標 0',
     /^M32 32 L32 6 A26 26 0 0 1 32\.00 58\.00 Z$/.test(p30), p30);
  const p45=box.dutyClockPath(45);
  ok('★ 3/4 圓：畫到正左方 (6,32)，大弧旗標要翻成 1',
     /^M32 32 L32 6 A26 26 0 1 1 6\.00 32\.00 Z$/.test(p45), p45);
  eq('★ 整圈用完整圓（不留缺口）', box.dutyClockPath(60), 'M32 6 A26 26 0 1 1 31.99 6 Z');
  eq('　　0 格不畫東西', box.dutyClockPath(0), '');
  const p5=box.dutyClockPath(5);
  ok('　　5 格＝30°：終點在右上（x>32、y<32）',
     /L32 6 A26 26 0 0 1 45\.00 9\.48 Z$/.test(p5), p5);
}

console.log('\n③ 接線');
ok('★ 值班圓用扇形，水位版退場',
   /<path class="dr-clock" d="\$\{segPath\}"/.test(src)
   && !/class="dr-water"/.test(src)
   && !/@keyframes drRise/.test(src));
ok('★ 顏色仍跟著班別（早班金／中班綠／晚班藍）',
   /<path class="dr-clock" d="\$\{segPath\}" style="fill:\$\{ringC\};"/.test(src)
   && /const ringC=dutyShiftColor\(shift, att\);/.test(src));
ok('★ 60 等份的分刻度畫得出來（虛線圓，每格 2.5447）',
   /<circle class="dr-cup-ticks" cx="32" cy="32" r="24\.3" stroke-dasharray="0\.85 1\.6947" stroke-dashoffset="0\.425"\/>/.test(src)
   && /\.dr-cup-ticks\{fill:none;stroke:rgba\(0,61,50,\.20\);stroke-width:2\.6;\}/.test(src));
ok('　　刻度在扇形底下（填到的地方被蓋住，沒填的看得出還剩幾格）',
   src.indexOf('class="dr-cup-ticks"') < src.indexOf('<path class="dr-clock"'));
ok('★ 尚未打卡的空環也有刻度（同一個時鐘面）',
   (src.match(/class="dr-cup-ticks"/g)||[]).length===2);
ok('★ 中央仍顯示時數、流星仍在（這次只換填滿方式）',
   /const center = `<div class="dr-center dr-center-done"><b>\$\{dispH\}<\/b><span>h<\/span><\/div>`;/.test(src)
   && /\.duty-ring\.dr-live \.dr-wrap::before\{inset:4px;/.test(src));
ok('　　滑鼠提示帶上格數', /（\$\{seg\}\/60 格）/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
