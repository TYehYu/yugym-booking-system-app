/* 會員端團課只開放「一週內」報名（2026-09-08 使用者指示）：
   「會員端團課的預約幫我設定限制只能約一週內的課　例如今天是週二　會員端只能看到下週一」

   今天算第 1 天、往後含今天共 7 天 → 週二 +6 天＝下週一。三個入口共用同一支判準。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 判準本身');
{
  /* 把三支函式抽出來實跑，不只比對字串 —— 差一天這種事看字串看不出來 */
  const pad=n=>String(n).padStart(2,'0');
  const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const body=g('const GRP_MEMBER_BOOK_DAYS=7;','function grpTooFar(dateStr){ return String(dateStr||\'\')>grpBookLastDay(); }');
  const mk=today=>{ const TODAY=new Date(today+'T00:00:00');
    return new Function('TODAY','ymd', body+'; return {last:grpBookLastDay, far:grpTooFar, txt:grpBookLastDayTxt};')(TODAY,ymd); };

  const tue=mk('2026-09-08');            // 2026-09-08 是週二
  eq('★★★ 使用者的例子：週二 → 最後一天是下週一', tue.last(), '2026-09-14');
  eq('　　（確認 9/14 真的是週一）', new Date('2026-09-14T00:00:00').getDay(), 1);
  eq('★★★ 今天算得進去（今天開的課還報得到）', tue.far('2026-09-08'), false);
  eq('★★★ 邊界當天可以、隔一天不行', [tue.far('2026-09-14'), tue.far('2026-09-15')], [false,true]);
  eq('★★ 過去的日期不歸這條管（另有「已結束」在擋）', tue.far('2026-09-01'), false);
  eq('★★ 跨月也要對（9/28 週一 → 10/04）', mk('2026-09-28').last(), '2026-10-04');
  eq('★★ 跨年也要對（12/29 → 01/04）', mk('2026-12-29').last(), '2027-01-04');
  eq('　　提示文字是 M/D，不帶年份', tue.txt(), '09/14');
}

console.log('\n② 只管會員自己報名，不動櫃檯與教練');
ok('★★★ 判準只出現在會員端那幾支（預約表單／首頁課卡／報名攔截）',
   ['grpClasses=(bks||[]).filter','const far=!past && grpTooFar(b.date);',
    'const tooFar=!past && grpTooFar(b.date);','if(grpTooFar(c.date)){','if(_b && grpTooFar(_b.date)){']
   .every(k=>src.indexOf(k)>0));
ok('★★★ 櫃檯排課那條路（validateBooking／openGroupMembers）完全沒被塞進這個判斷',
   !/function validateBooking[\s\S]{0,4000}grpTooFar/.test(src)
   && !/async function openGroupMembers[\s\S]{0,3000}grpTooFar/.test(src));
ok('★★ 原因寫在程式裡（固定班本來就要往後排整串）',
   /櫃檯與教練排課完全不受限/.test(src));

console.log('\n③ 預約表單（msb 團體課分頁）');
{
  const ST=g('async function msbStart(reschedId){','\n}');
  ok('★★★ 濾在來源這一層 —— 日期鈕與場次列吃同一份，不必兩處各擋一次',
     /grpClasses=\(bks\|\|\[\]\)\.filter\(x=>bkIsGroup\(x\)&&x\.status==='booked'\s*\n\s*&& !grpTooFar\(x\.date\)/.test(ST));
  ok('★★ 面板下方講明只開放一週內、開放到哪一天（不能用就寫原因）',
     /團體課只開放<b>一週內<\/b>報名（目前到 \$\{grpBookLastDayTxt\(\)\}）/.test(src)
     && /只列一週內，目前到 \$\{grpBookLastDayTxt\(\)\}/.test(src));
}

console.log('\n④ 首頁／行事曆的當日團課卡');
ok('★★★ 超過一週的**不藏**，照樣列出來只是暗化（藏了會被當成那天沒開課）',
   /比照「已結束」那一套：照樣列、暗化、不可報名/.test(src)
   && /\$\{\(past\|\|far\)\?' mh2-past':''\}/.test(src));
ok('★★★ 卡上寫出原因，不是只變灰',
   /\$\{past\?'・已結束':\(far\?'・開課前一週開放':\(full\?'・已額滿':'・還可報名'\)\)\}/.test(src));
ok('★★ 點開之後圓鈕也說得出原因，且排在「已額滿」前面（時間沒到是更前面的一道門）',
   /tooFar \? orb\('off','—','尚未開放',null,`團體課開課前一週才開放報名（目前開放到 \$\{grpBookLastDayTxt\(\)\}）`\)/.test(src)
   && src.indexOf("'尚未開放'") < src.indexOf("orb('off','—','已額滿'"));
ok('★★ 說明行也跟著換（不然會顯示「你有 N 張票可以用」卻按不下去）',
   /\$\{tooFar\?`團體課開課前<b>一週<\/b>才開放報名，目前開放到 \$\{grpBookLastDayTxt\(\)\}`:/.test(src));

console.log('\n⑤ 報名前再擋一次');
ok('★★★ msbGrpJoin 擋一道 —— 報名會扣課，不能只靠畫面當防線',
   /if\(grpTooFar\(c\.date\)\)\{[\s\S]{0,400}還沒開放報名/.test(src));
ok('★★★ memh2GrpJoin 也擋 —— 那是兩條路的匯流處，落到 msbGrpJoin 只會說「找不到這堂課」',
   /if\(_b && grpTooFar\(_b\.date\)\)\{/.test(src)
   && /落到 msbGrpJoin 只會得到一句「找不到這堂課」/.test(src));
ok('★★ 擋下時說得出「這一堂是哪天、目前開放到哪天」，不是一句不能約',
   (src.match(/目前開放到 \$\{grpBookLastDayTxt\(\)\}。/g)||[]).length>=2);

console.log('\n⑥ 資料庫端最後一道（fn_member_join_group，2026-09-08 已部署）');
ok('★★★ 前端擋不到的路要有錯誤碼可以說話',
   /'BOOKING\.TOO_FAR':'團體課開課前一週才開放報名，這一堂還沒開放'/.test(src));
ok('★★ 註明那一道在資料庫端（改 edge／RPC 前要先比對線上版本）',
   /資料庫端也擋一週以外的場次（fn_member_join_group）/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
