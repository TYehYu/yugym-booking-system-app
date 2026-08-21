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
ok('　　範圍後來擴到行事曆的空時段（2026-08-21 第二輪），理由寫在原地',
   /週六週日不要顯示非營業時間的預約時段/.test(src)
   && /兩處都只藏「空的」時段/.test(src));
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

/* ═══ 2026-08-21 追加：「週六週日不要顯示非營業時間的預約時段」 ═══
   前一輪使用者說「只管快速預約按鈕就好」，這一輪把範圍擴到行事曆的空時段。
   兩處做法不同 —— 桌機七欄共用一條時間軸（剪不掉單一欄），手機一日行事曆可以直接剪短。 */
console.log('\n打烊後不顯示可約時段');
ok('★ 桌機：每一欄各自算自己的打烊時間',
   /const _closeMin=\(typeof bizCloseMin==='function'\)\?bizCloseMin\(ds\):22\*60;/.test(src));
ok('★ 桌機：打烊後的格子不可點（拿掉 onclick）',
   /const _closed=min>=_closeMin;/.test(src)
   && /const _canAdd=opts\.onSlot && ds>=ymd\(TODAY\) && !_closed;/.test(src));
ok('★ 桌機：打烊後的格子畫成已打烊（灰底、hover 不反白）',
   /\$\{_closed\?' cal-half-closed':''\}/.test(src)
   && /\.cal-half\.cal-half-closed\{cursor:default;background:rgba\(0,0,0,0\.045\);\}/.test(src)
   && /\.cal-half\.cal-half-closed:hover\{background:rgba\(0,0,0,0\.045\);\}/.test(src));
ok('　　友善課時段的藍底也要蓋掉，不然打烊後那幾格還是藍的',
   /\.cal-half\.cal-half-closed\.fw-win\{background:rgba\(0,0,0,0\.045\);\}/.test(src));
ok('★ 手機一日行事曆：時間軸直接收到打烊那一小時',
   /const AG_END=Math\.min\(WTL_END, Math\.max\(bizCloseMin\(selDate\), Math\.ceil\(_agLate\/60\)\*60\)\);/.test(src)
   && /const startH=Math\.floor\(AG_START\/60\), endH=Math\.ceil\(AG_END\/60\);/.test(src));
ok('★ ⚠ 已經排在打烊後的課還是要看得到 —— 軸會延伸到最後一堂課的結束時間',
   /_agLate=allBk\.filter\(b=>b&&b\.date===selDate&&b\.status!=='cancelled'\)/.test(src)
   && /Math\.max\(m,t\+\(Number\(b\.duration\)\|\|60\)\)/.test(src)
   && /已經排在打烊後的課照畫/.test(src));
ok('★ 軸縮短後，拖曳換算要跟著用新的下緣（否則會落錯時間）',
   /window\._agEnd=AG_END;/.test(src)
   && /const SLOT_H=\(rect\.height\)\/\(\(\(window\._agEnd\|\|WTL_END\)-AGS\)\/30\);/.test(src)
   && (src.match(/const maxSlot=\(\(window\._agEnd\|\|WTL_END\)-AG_START\)\/30-1;/g)||[]).length===2);
ok('　　現在紅線也不要畫到軸外',
   /const showNow = weekHasToday && nowMin>=AG_START && nowMin<=AG_END;/.test(src)
   && /const ph=Math\.min\(yOf\(Math\.min\(nowMin,AG_END\)\),gridH\);/.test(src));
