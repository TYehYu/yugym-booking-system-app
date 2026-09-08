/* 月排班表的「補班人員」列（2026-09-08 使用者指示）：
   「黃沛瀞不用打卡　在班表上面不用出現他的名字　他的這一列改成補班人員
     然後每一格可以手動輸入班別跟補班人員」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};
const TAB=g('async function renderShiftsTab(){','\n}');
const EDIT=g('function openShiftEdit(empId,dateStr){','\n}');
const SAVE=g('async function saveShift(){','\n}');

console.log('① 這一列不掛在任何員工身上');
ok('★★★ 用虛擬 emp_id，不對應 employees 任何一列',
   /const SUB_ROSTER_ID='SUB-ROSTER';/.test(src)
   && /function shIsSubRoster\(id\)\{ return String\(id\|\|''\)===SUB_ROSTER_ID; \}/.test(src));
ok('★★★ 為什麼不沿用黃沛瀞那一列，原因寫在原地（合作教練值班時薪有 $200 保底）',
   /合作教練的值班時薪有 \$200 保底（見 calcSalary），別人來補的班會變成她的值班費/.test(src));
ok('★★★ 保底那條規則真的還在（這條註解不是憑空寫的）',
   /if\(et==='contractor' && dutyHours>0 && dhr<200\) dhr=200;/.test(src));
ok('★★★ 算薪與請假統計都是 s.emp_id===emp.id 逐人比對 —— 虛擬 id 對不到任何一位',
   /if\(s\.emp_id===emp\.id/.test(src) && !/SUB_ROSTER_ID/.test(g('function leaveSummary','\n}')));

console.log('\n② 表格');
ok('★★★ 固定排在最後一列（在員工那幾列 .join 之後接上去）',
   /\}\)\.join\(''\)\s*\n\s*\/\* 補班人員：固定排在最後一列/.test(TAB));
ok('★★★ 一格裡兩件事：班別章在上、補班人員的名字在下',
   /return main\+\(s\.sub_name\?`<span class="sh-subnm">\$\{escH\(s\.sub_name\)\}<\/span>`:''\);/.test(TAB));
ok('★★ 班別吃手填的 code，留空才依起迄時間推導',
   /const code=s\.code\|\|shiftCode\(s\.start_time,s\.end_time,s\.date\);/.test(TAB));
ok('★★ 抬頭寫「補班人員」＋「班別與人員手填・不計薪」，不會被當成某位員工',
   /<span class="shn-name">補班人員<\/span>/.test(TAB)
   && /班別與人員手填・不計薪/.test(TAB));
ok('★★ 沒有「週期」鈕（這一列不是人，沒有週期可排）',
   !/sh-subrow[\s\S]{0,600}openWeeklyShift/.test(TAB));
ok('★★★ 時數照樣算進空班檢查 —— 有人補班就是有人顧店',
   /這一列的時數照樣算進「空班檢查」/.test(src)
   && /const gaps=monthShiftGaps\(shifts\.filter\(s=>\(s\.date\|\|''\)\.slice\(0,7\)===month\), month\);/.test(TAB));
ok('★★ 「值班員工共 N 位」不把這一列算進去', /值班員工共 \$\{staff\.length\} 位/.test(src));

console.log('\n③ 關掉值班標籤之後，歷史不能跟著消失');
ok('★★★ 名單＝有值班標籤的人 ∪ 這個月有排過班的人',
   /let staff=coaches\.filter\(c=>\(c\.need_duty \|\| _monthShifts0\.some\(s=>s\.emp_id===c\.id\)\)/.test(TAB));
ok('★★ 原因寫在原地（黃沛瀞 9 月 0 小時，但歷史月份有排班）',
   /過去那幾個月的班也跟著消失\*\*就不對了/.test(TAB));
ok('　　當月排班要先算出來，名單才判斷得出來',
   TAB.indexOf('const _monthShifts0=shifts.filter') < TAB.indexOf('let staff=coaches.filter'));

console.log('\n④ 編輯視窗');
ok('★★★ 補班列多「班別」與「補班人員」兩格手填',
   /<input type="text" id="sh-subcode"/.test(EDIT) && /<input type="text" id="sh-subname"/.test(EDIT));
ok('★★★ 補班列不畫請假登記（這一列不是員工，沒有假可以請）',
   /\$\{\(cur&&!_isSub\)\?`<div style="border-top:1px solid var\(--bd\);padding-top:12px/.test(EDIT));
ok('★★★ 補班列不畫「設為每週固定」', /\$\{_isSub\?'':`<div style="margin-bottom:10px;padding-top:10px/.test(EDIT));
ok('★★ 視窗標題分得出來是哪一種', /\$\{_isSub\?'補班人員 · ':'排班 · '\}/.test(EDIT));
ok('★★ 講明不計薪、但算進空班檢查', /這一列不屬於任何員工，<b>不計薪<\/b>/.test(EDIT));

console.log('\n⑤ 存檔');
ok('★★★ 兩格沒畫出來（一般員工的視窗）就別碰那兩個欄位',
   /if\(_c\) obj\.code=/.test(SAVE) && /if\(_n\) obj\.sub_name=/.test(SAVE));
ok('★★★ 班別留空寫 null 不是空字串 —— 空字串也算有值，那一格會永遠是空白章',
   /obj\.code=\(_c\.value\|\|''\)\.trim\(\)\|\|null;/.test(SAVE)
   && /空字串也算有值，\s*\n\s*會讓那一格永遠是空白章/.test(src));
ok('★★ 一般員工的排班沒有被改成寫死 code（原本就是依時間推導）',
   !/const obj=\{ id:id\|\|uid\('shift'\)[\s\S]{0,300}code:/.test(SAVE));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
