/* 會員自助預約自主訓練：跑步機的佔用數

   2026-07-31 使用者指示：確認視窗顯示兩顆燈號（灰＝可預約、綠＝已預約）。
   2026-08-03 使用者指示：「跑步機的燈號從按鈕上移除，只要能確認客戶預約時
   一台或兩台不會出錯」—— 燈號整組退場，但佔用數（_tmUsed）留著：
   它是台數按鈕上限與 pickUnits 夾制的依據，算錯它台數就會出錯。
   台數選擇本身的正確性見 treadmilltest ⑦。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 燈號整組退場（2026-08-03）');
ok('★ 按鈕上不再畫燈號', !/msb-vdots/.test(src) && !/_tmDots/.test(src) && !/_dotsOf/.test(src));
ok('★ 燈號樣式一併移除，不留無主規則', !/\.msb-vdot\{/.test(src) && !/\.msb-vbtn\.on \.msb-vdot/.test(src));
ok('　　場地按鈕回到只有名稱',
   /onclick="msbChooseVenue\('\$\{vid\}'\)">\$\{label\}<\/button>/.test(src)
   && /disabled title="此時段已滿">\$\{label\}<\/button>/.test(src));
ok('　　為什麼佔用數留著，寫在程式裡',
   /_tmUsed 留著：台數按鈕的上限與 pickUnits 的夾制都靠它。/.test(src));
ok('　　台數讀場地設定，不寫死', /const _tmCap=\(typeof venueCap==='function'\)\?\(venueCap\('treadmill'\)\|\|2\):2;/.test(src));
ok('　　跑步機容量確實是 2', /\{ id:'treadmill', name:'跑步機',       capacity:2, active:true \}/.test(src));

console.log('\n② 數佔用的方式（台數不出錯的根據）');
{
  /* 實跑那段計數：用同樣的條件去篩，驗各種情境 */
  const i=src.indexOf('    _tmUsed=(_allBk||[]).filter(x=>x && x.status!==');
  const j=src.indexOf('\n', src.indexOf('_tmUsed=Math.min(_tmUsed,_tmCap);'));
  const body=src.slice(i,j).replace(/_allBk\|\|\[\]/,'BK');
  const run=(BK,used=null)=>{
    const fn=new Function('BK','DATE','_ne','_ns','_selfId','_tmCap','timeToMin',
      'let _tmUsed=0;\n'+body+'\nreturn _tmUsed;');
    return fn(BK,'2026-08-03',660,600,used,2,t=>{const[h,m]=String(t||'0:0').split(':').map(Number);return h*60+(m||0);});
  };
  const T=(u,t,o)=>Object.assign({id:u+t,date:'2026-08-03',status:'booked',venue_unit:u,start_time:t,duration:60},o||{});
  eq('★ 沒人用 → 0（可選 2 台）', run([]), 0);
  eq('★ 一台被佔 → 1（下一位只能選 1 台）', run([T('treadmill_1','10:00')]), 1);
  eq('★ 兩台都被佔 → 2', run([T('treadmill_1','10:00'),T('treadmill_2','10:00')]), 2);
  eq('★ 舊資料沒編號（venue_unit=treadmill）兩筆 → 仍算 2，不會被去重成 1',
     run([T('treadmill','10:00'),T('treadmill','10:00')]), 2);
  eq('　　超過容量也封頂在 2', run([T('treadmill','10:00'),T('treadmill_1','10:00'),T('treadmill_2','10:00')]), 2);
  eq('　　別的場地不算', run([T('multi_1','10:00'),T('group_1','10:00')]), 0);
  eq('　　別的時段不算', run([T('treadmill_1','08:00'),T('treadmill_2','11:00')]), 0);
  ok('★ 會員端走當日佔用 RPC，不抓整張 bookings（RLS 下讀不到別人的單人預約）',
     /const _allBk=await fetchDayOccupancy\(s\.date\)\.catch\(\(\)=>\[\]\);/.test(src)
     && /與 validateBooking 同一支當日佔用 RPC，有快取、只回當天/.test(src));
  eq('　　跨時段重疊要算（09:30 的 60 分課壓到 10:00）', run([T('treadmill_1','09:30')]), 1);
  eq('　　已取消的不算', run([T('treadmill_1','10:00',{status:'cancelled'})]), 0);
  eq('★ 改期時不把自己算進去', run([T('treadmill_1','10:00')],'treadmill_110:00'), 0);
}

console.log('\n③ 不影響原本的擋位邏輯');
ok('★ 場地能不能選仍由 validateBooking 決定',
   /const err=await validateBooking\(probe,s\.date,t,60\);\s*\n\s*return \[vid,label,!err\];/.test(src));
ok('★ 已滿的場地仍然變灰不可按', /<button class="msb-vbtn off" disabled title="此時段已滿">/.test(src));
ok('　　讀不到預約資料時不擋流程（_tmUsed 保持 0，台數照常可選）',
   /\}catch\(_\)\{\}[\s\S]{0,700}s\.pickUnits=Math\.min/.test(src));
ok('　　原因寫在程式裡（為什麼用筆數而不是編號去重）',
   /用編號去重會把兩筆 treadmill 算成一台/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
