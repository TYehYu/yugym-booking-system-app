/* 會員自助預約自主訓練：跑步機的佔用燈號（2026-07-31 使用者指示）

   「在客人自己預約自主訓練的表單上，就要顯示跑步機＋兩個燈號，
     灰燈是可預約、綠燈是已預約。」

   跑步機是「一個場地、兩台」（capacity 2）。一對二的客人可能一張票就佔掉兩台，
   客人要在確認視窗看得出還剩幾台。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('燈號顏色（使用者定義：灰＝可預約、綠＝已預約）');
ok('★ 預設灰底', /\.msb-vdot\{width:7px;height:7px;border-radius:50%;background:var\(--bd,#d8d2c4\);\}/.test(src));
ok('★ 已預約的那顆上綠', /\.msb-vdot\.taken\{background:var\(--green,#1f6f54\);\}/.test(src));
ok('　　選中的按鈕是綠底 → 燈號改用白／半透明白，才看得見',
   /\.msb-vbtn\.on \.msb-vdot\{background:rgba\(255,255,255,\.45\);\}/.test(src)
   && /\.msb-vbtn\.on \.msb-vdot\.taken\{background:#fff;\}/.test(src));

console.log('\n只有跑步機掛燈號');
ok('★ 其他場地不掛', /const _dotsOf=vid=>vid==='treadmill'\?_tmDots:'';/.test(src));
ok('★ 可選與已滿兩種按鈕都掛得上',
   (src.match(/\$\{label\}\$\{_dotsOf\(vid\)\}/g)||[]).length===2);
ok('　　台數讀場地設定，不寫死', /const _tmCap=\(typeof venueCap==='function'\)\?\(venueCap\('treadmill'\)\|\|2\):2;/.test(src));
ok('　　跑步機容量確實是 2', /\{ id:'treadmill', name:'跑步機',       capacity:2, active:true \}/.test(src));

console.log('\n數佔用的方式');
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
  eq('★ 沒人用 → 0（兩顆都灰）', run([]), 0);
  eq('★ 一台被佔 → 1（一灰一綠）', run([T('treadmill_1','10:00')]), 1);
  eq('★ 兩台都被佔 → 2（兩顆綠）', run([T('treadmill_1','10:00'),T('treadmill_2','10:00')]), 2);
  eq('★ 同一張票約走兩台，也是 2', run([T('treadmill_1','10:00'),T('treadmill_2','10:00')]), 2);
  eq('★ 舊資料沒編號（venue_unit=treadmill）兩筆 → 仍算 2，不會被去重成 1',
     run([T('treadmill','10:00'),T('treadmill','10:00')]), 2);
  eq('　　超過容量也封頂在 2', run([T('treadmill','10:00'),T('treadmill_1','10:00'),T('treadmill_2','10:00')]), 2);
  eq('　　別的場地不算', run([T('multi_1','10:00'),T('group_1','10:00')]), 0);
  eq('　　別的時段不算', run([T('treadmill_1','08:00'),T('treadmill_2','11:00')]), 0);
  /* 2026-07-31：改吃 fetchDayOccupancy（只回當天），所以不必再自己比日期 */
  ok('★ 會員端改走當日佔用 RPC，不再抓整張 bookings',
     /const _allBk=await fetchDayOccupancy\(s\.date\)\.catch\(\(\)=>\[\]\);/.test(src)
     && /與 validateBooking 同一支當日佔用 RPC，有快取、只回當天/.test(src));
  eq('　　跨時段重疊要算（09:30 的 60 分課壓到 10:00）', run([T('treadmill_1','09:30')]), 1);
  eq('　　已取消的不算', run([T('treadmill_1','10:00',{status:'cancelled'})]), 0);
  eq('★ 改期時不把自己算進去', run([T('treadmill_1','10:00')],'treadmill_110:00'), 0);
}

console.log('\n不影響原本的擋位邏輯');
ok('★ 場地能不能選仍由 validateBooking 決定（燈號只是顯示）',
   /const err=await validateBooking\(probe,s\.date,t,60\);\s*\n\s*return \[vid,label,!err\];/.test(src));
ok('★ 已滿的場地仍然變灰不可按', /<button class="msb-vbtn off" disabled title="此時段已滿">/.test(src));
/* 2026-08-03：catch 與 _tmDots 之間插進了「pickUnits 夾回上限」那一行（treadmilltest ⑦），
   斷言放寬成同一段落即可。 */
ok('　　讀不到預約資料時不會擋住整個視窗（燈號退成全灰）',
   /\}catch\(_\)\{\}[\s\S]{0,600}const _tmDots=/.test(src));
ok('　　滑過看得到台數說明', /title="跑步機 \$\{_tmCap\} 台：已預約 \$\{_tmUsed\} 台"/.test(src));
ok('　　原因寫在程式裡（為什麼用筆數而不是編號去重）',
   /用編號去重會把兩筆 treadmill 算成一台/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
