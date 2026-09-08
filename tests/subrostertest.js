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
   /return main\+\(s\.sub_name\?`<span class="sh-subnm\$\{_paid\?' paid':''\}"/.test(TAB));
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
ok('★★ 兩種補班人員各自講清楚計不計薪，而且都算進空班檢查',
   /挑<b>店裡的員工<\/b>→ 這個班算他的，<b>值班費照算<\/b>/.test(EDIT)
   && /挑<b>店外人員<\/b>→ 只是記錄誰來顧店，<b>不計薪<\/b>/.test(EDIT)
   && /兩種都會算進下方的空班檢查/.test(EDIT));

console.log('\n⑤ 存檔');
ok('★★★ 那幾格沒畫出來（一般員工的視窗）就別碰那些欄位',
   /if\(_c\) obj\.code=/.test(SAVE) && /if\(_e\)\{/.test(SAVE));
ok('★★★ 班別留空寫 null 不是空字串 —— 空字串也算有值，那一格會永遠是空白章',
   /obj\.code=\(_c\.value\|\|''\)\.trim\(\)\|\|null;/.test(SAVE)
   && /空字串也算有值，\s*\n\s*會讓那一格永遠是空白章/.test(src));
ok('★★ 一般員工的排班沒有被改成寫死 code（原本就是依時間推導）',
   !/const obj=\{ id:id\|\|uid\('shift'\)[\s\S]{0,300}code:/.test(SAVE));

console.log('\n⑥ 補班人員挑到店裡的員工 → 那個班算他的薪水（2026-09-08 二修）');
ok('★★★ 判準改成 is_sub 旗標，不是看 emp_id（emp_id 現在可能是真員工）',
   /function shIsSub\(s\)\{ return !!\(s && \(s\.is_sub \|\| shIsSubRoster\(s\.emp_id\)\)\); \}/.test(src)
   && /const list=monthShifts\.filter\(s=>shIsSub\(s\)&&s\.date===dateStr\);/.test(TAB));
ok('★★★ 挑員工就把 emp_id 換成他 —— 薪資本來就是逐人 emp_id 加總，計薪那邊一行都不用改',
   /obj\.emp_id=_pick;/.test(SAVE) && /薪資本來就是逐人 emp_id 加總/.test(src));
ok('★★★ 換了 emp_id 之後 is_sub 一定要寫，不然補班列就取不到那一筆',
   /obj\.is_sub=true;/.test(SAVE) && /is_sub 一定要寫，補班列是靠它取值的/.test(src));
ok('★★★ 店外人員維持虛擬 emp_id、不計薪',
   /obj\.emp_id=SUB_ROSTER_ID;/.test(SAVE));
ok('★★★ 補班那一格要用 is_sub 找既有的那一筆 —— 照 emp_id 找會每點一次就新增一筆',
   /const list=shIsSubRoster\(empId\)\s*\n\s*\? shifts\.filter\(s=>shIsSub\(s\)&&s\.date===dateStr\)/.test(EDIT));
ok('★★★ 從員工自己那一列點開同一筆時，旗標與名字不能被洗掉',
   /\}else if\(cur0 && cur0\.is_sub\)\{/.test(SAVE)
   && /obj\.is_sub=true; obj\.sub_name=cur0\.sub_name\|\|null;/.test(SAVE)
   && /const cur0=id\?\(\(window\._shiftsCache\|\|\[\]\)\.find\(x=>x&&x\.id===id\)\|\|null\):null;/.test(SAVE));
ok('★★ 員工自己那一列會標「補」，不然多一個班卻看不出來是怎麼多的',
   /return main\+\(shIsSub\(s\)\?'<span class="sh-subtag">補<\/span>':''\)\+leaveTag;/.test(TAB));
ok('★★ 補班列上，掛在真員工身上的名字標成深色（一眼看得出有沒有牽涉到薪水）',
   /const _paid=!shIsSubRoster\(s\.emp_id\);/.test(TAB)
   && /\.sh-subnm\.paid\{color:var\(--green\);font-weight:700;\}/.test(src));
ok('★★ 候選名單＝在職員工（不限有沒有值班標籤 —— 臨時找人是找得到的人）',
   /window\._shiftSubPool=coaches/.test(TAB)
   && /不限有沒有值班標籤/.test(TAB));
ok('★★ 挑了員工就不用再打名字（那一格收起來）',
   /function shSubEmpSync\(\)\{/.test(src)
   && /row\.style\.display=\(sel&&sel\.value\)\?'none':'block';/.test(src));
ok('★★ 一筆資料兩個地方畫，但空班檢查與薪資都只算一次',
   /一筆資料兩個地方畫，但只有一筆 —— 空班檢查與薪資都只算一次/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
