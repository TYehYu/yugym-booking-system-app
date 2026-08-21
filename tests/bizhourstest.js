/* 快速預約按鈕的分日打烊時間（2026-08-21 使用者定案）
   回報：「教練快速預約按鈕 週六怎麼可以約20:30跟21:00 這樣會讓櫃檯陪他加班」
   定案：「週六21:00週日15:00打烊 只管快速預約按鈕就好」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('設定');
ok('★ 週日 15:00、週六 21:00，其餘平日 22:00',
   /const BIZ_CLOSE_H=\{0:15, 6:21\};/.test(src)
   && /return \(h==null\?22:h\)\*60;/.test(src));
ok('★ 快速預約的最後一格＝打烊前 60 分（一堂課的長度）',
   /function quickBookLastMin\(ds\)\{ return bizCloseMin\(ds\)-60; \}/.test(src));
ok('★ 只套在快速預約那一圈（另外兩圈是場地標籤，使用者指定不動）',
   /for\(let mm=AG_START; mm<=quickBookLastMin\(selDate\); mm\+=30\)\{/.test(src)
   && (src.match(/for\(let mm=AG_START; mm<=21\*60; mm\+=30\)\{/g)||[]).length===2);
ok('　　時間軸範圍與手動新增不受影響（櫃檯真要排打烊後仍排得進去）',
   /只管快速預約按鈕（使用者指定）——行事曆時間軸的顯示範圍、手動新增預約都不受影響/.test(src));
ok('　　沒有營業時間設定表，先寫在程式裡並註明日後要搬進資料庫',
   /系統裡沒有營業時間設定表，所以先寫在這裡；日後要讓使用者自己設定再搬進資料庫/.test(src));

console.log('\n各天的最後一格');
{
  const BIZ={0:15,6:21};
  const closeMin=dow=>((BIZ[dow]==null?22:BIZ[dow])*60);
  const last=dow=>closeMin(dow)-60;
  const hm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  eq('★ 週六 → 打烊 21:00、最後一格 20:00', [hm(closeMin(6)), hm(last(6))], ['21:00','20:00']);
  eq('★ 週日 → 打烊 15:00、最後一格 14:00', [hm(closeMin(0)), hm(last(0))], ['15:00','14:00']);
  eq('★ 平日 → 打烊 22:00、最後一格 21:00（維持原本）',
     [1,2,3,4,5].map(d=>hm(last(d))), ['21:00','21:00','21:00','21:00','21:00']);
  eq('　　週六不再出現 20:30 與 21:00（使用者回報的那兩格）',
     [20*60+30, 21*60].every(m=>m>last(6)), true);
  eq('　　週日不再出現 14:30 之後', (14*60+30)>last(0), true);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
