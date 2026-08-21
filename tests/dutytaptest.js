/* 今日值班那格的打卡分支（2026-08-21 使用者：「教練上班打卡的按鈕 目前只能上班 不能下班」）*/
const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

console.log('今日值班：依打卡狀態分流');
ok('★ 兩格都改叫 chv2DutyTap（原本一律開掃碼視窗）',
   (src.match(/onclick="chv2DutyTap\(\)"/g)||[]).length===2
   && /onkeydown="if\(event\.key==='Enter'\|\|event\.key===' '\)\{event\.preventDefault\(\);chv2DutyTap\(\);\}"/.test(src)
   && !/onclick="openStaffScanModal\(\)"[\s\S]{0,200}?admh-kpi admh-rev chv2-dutytap/.test(src));

/* 實跑三種狀態：把三個出口換成記錄器，確認走對分支 */
const fn=new Function('getAttendance','SESSION','ymd','TODAY','openStaffScanModal','confirmPunchOut','confirmUndoPunchOut',
  g('async function chv2DutyTap(){','\n}\n')+'\nreturn chv2DutyTap;');
const run=async rec=>{
  const hit=[];
  const f=fn(async()=>rec,{id:'c-1'},()=>'2026-08-21',new Date(2026,7,21),
    ()=>hit.push('scan'),()=>hit.push('out'),()=>hit.push('undo'));
  await f(); return hit.join(',');
};
(async()=>{
  ok('★ 還沒上班 → 掃碼（上班一定要掃店內 QR，這是防代打卡那道門）', await run(null)==='scan');
  ok('　　有紀錄但沒 clock_in 也算還沒上班', await run({date:'2026-08-21'})==='scan');
  ok('★ 上班中 → 直接開下班確認（不必再找一次 QR）', await run({clock_in:'09:00'})==='out');
  ok('★ 已下班 → 取消下班（誤觸補救，同舊版打卡卡片）', await run({clock_in:'09:00',clock_out:'18:00'})==='undo');
  ok('　　理由與「上班仍須掃碼」的分工寫在原地',
     /上班一定要掃碼\*\*（這是防代打卡的那道門）/.test(src)
     && /教練上班打卡的按鈕 目前只能上班 不能下班/.test(src));
  console.log(`\n${pass} 通過 / ${fail} 失敗`);
  if(fail) process.exit(1);
})();
