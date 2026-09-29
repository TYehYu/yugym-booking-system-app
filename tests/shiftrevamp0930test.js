/* 班表收斂（2026-09-30 使用者指示）：
   「有收斂的優化建議嗎」→ 勾了四項：沒值班的人不畫／「中」班補顏色／
     時數改寫「排班 / 計薪」／「全班 早班 中班 晚班 可以跟著首頁的值班顏色」
   「羅威幫我列在支援班人員」
   「點支援班的時候只要顯示[班別][人員姓名]」
   「美蓉7號這天[教]改成[假]」
   「要檢查會不會影響到員工薪資喔」← ⑥ 整段在守這件事 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};
/* 斷言「某字串不存在」之前要先剝註解，不然會命中自己寫的說明（踩過四次） */
const bare=src.replace(/\/\*[\s\S]*?\*\//g,' ');

console.log('① 班別顏色跟首頁同一套');
{
  /* 首頁「今日值班」那三個 hex（dutyShiftColor／手機首頁 BANDS）是硬寫的，
     班表跟著硬寫才會一致 —— 走 token 會被 ink 主題換掉。 */
  ok('★★★ 早班＝琥珀金 #D9A441（同首頁）', /\.sh-code-am\{background:#D9A441;\}/.test(src));
  ok('★★★ 中班＝品牌綠 #1F6F54（同首頁）', /\.sh-code-mid\{background:#1F6F54;\}/.test(src));
  ok('★★★ 晚班＝靛藍 #3A5BA0（同首頁）', /\.sh-code-pm\{background:#3A5BA0;\}/.test(src));
  ok('★★ 全班留品牌紅（首頁沒有這一種）', /\.sh-code-full\{background:#8C4A3E;\}/.test(src));
  ok('★★★ 首頁那三個色沒有被一起改掉（班表跟過去，不是反過來）',
     /if\(m < 12\*60\) return '#D9A441';/.test(src)
     && /if\(m < 15\*60\) return '#1F6F54';/.test(src)
     && /return '#3A5BA0';/.test(src));
  /* 0929 的洞：只寫了 .sh-code.sh-code-* 雙 class 版，而姓名旁的小章 class 是
     「shn-kind sh-code-full」，沒有 .sh-code → 白字配透明底，整個小章看不見。 */
  ok('★★★ 四條都是單一 class（姓名旁的小章才有底色）',
     !/\.sh-code\.sh-code-(full|am|pm|mid)\{/.test(src));
  ok('★★ 舊的 --green／--gold-d 班別色已經收掉',
     !/\.sh-code\.sh-code-pm\{background:var\(--green\)/.test(bare)
     && !/\.sh-code\.sh-code-am\{background:var\(--gold-d/.test(bare));
}

console.log('\n② 中班變成正式的一種班');
{
  const cls=new Function('return '+g('function shiftCodeCls(code, isWeekend){','\n}'))();
  eq('★★★ 中 → sh-code-mid', cls('中',false), ' sh-code-mid');
  eq('★★ 全／早／晚不受影響', ['全','早','晚'].map(c=>cls(c,false)),
     [' sh-code-full',' sh-code-am',' sh-code-pm']);
  eq('★★★ 「假晚」仍算晚班（含「晚」字）', cls('假晚',false), ' sh-code-pm');
  eq('★★ 認不出的代號照舊退回假日金／平日綠', [cls('X',true),cls('X',false)], [' sh-code-wkd','']);
  /* 排序也要認得中班，不然黃美蓉（早 8 中 8 晚 4）列上標「早」、格子卻一半是綠的 */
  ok('★★★ _shKind 四種班：0全 1早 2中 3晚', /const cnt=\{0:0,1:0,2:0,3:0\};/.test(src)
     && /else if\(cd\.indexOf\('中'\)>=0\) cnt\[2\]\+\+; else if\(cd\.indexOf\('晚'\)>=0\) cnt\[3\]\+\+;/.test(src));
  ok('★★★ 平手照 全 > 早 > 中 > 晚', /for\(let i=0;i<4;i\+\+\) if\(cnt\[i\]===max\) return i;/.test(src));
  ok('★★ 沒排班＝5、認不出班別＝4（往後挪一格，別跟「晚」撞在一起）',
     /if\(!n\) return 5;/.test(src) && /if\(max<=0\) return 4;/.test(src));
  ok('★★★ 小章也補上中班', /2:'<b class="shn-kind sh-code-mid">中<\/b>',3:'<b class="shn-kind sh-code-pm">晚<\/b>'/.test(src));
}

console.log('\n③ 假別小標：教練請假寫「假」不寫「教」');
{
  const F=new Function('shIsClassLeave','return '+g('function shLeaveTag(s){','\n}'))
    (s=>!!(s&&s.leave_type==='教練請假'));
  eq('★★★ 教練請假 → 假（不是「教」）', F({leave_type:'教練請假'}), '假');
  eq('★★ 教練請假不接時數（本來就是 0）', F({leave_type:'教練請假',leave_hours:0}), '假');
  eq('★★★ 真的請假照舊取第一個字＋時數', [F({leave_type:'特休',leave_hours:6}),
     F({leave_type:'病假',leave_hours:4}), F({leave_type:'事假'})], ['特6','病4','事']);
  eq('★★ 沒有假別就不畫', [F(null), F({}), F({leave_type:''})], ['','','']);
  ok('★★★ 兩處格子都換過來（可編輯的班表＋唯讀的月排班視窗）',
     (src.match(/<span class="sh-leave">\$\{shLeaveTag\(s\)\}<\/span>/g)||[]).length===2
     && !/\$\{s\.leave_type\[0\]\}\$\{s\.leave_hours/.test(bare));
}

console.log('\n④ 時數：排班／實際計薪');
{
  const F=new Function('return '+g('function shHrHtml(sched, paid){','\n}'))();
  eq('★★★ 一樣就只畫一個數字（大多數人本來就一樣）', F(78,78), '<b>78.0h</b>');
  eq('★★★ 不一樣才畫兩個（曾邦宏 9 月：三天特休＋一天沒打卡）',
     F(78,54), '<b>78.0</b><i>/</i>54.0h');
  eq('★★ 算不出計薪時數就只畫排班（不要畫成 0 嚇人）', F(78,null), '<b>78.0h</b>');
  eq('★★ 差距小於半小時不算差（0.5 小時為單位，浮點誤差不要冒出來）', F(78,78.01), '<b>78.0h</b>');
  eq('★★ 完全沒上班畫 0.0', F(12,0), '<b>12.0</b><i>/</i>0.0h');
  /* ⚠ 計薪那個一定要呼叫 dutyHoursCapped：薪資單、員工卡、班表三處必須同一個數字 */
  ok('★★★ 計薪時數直接呼叫 dutyHoursCapped，沒有另外算一套',
     /empPaid\[e\.id\]=dutyHoursCapped\(attendance, shifts, e\.id, month, e\);/.test(src));
  ok('★★★ 班表有把打卡載進來（不然 dutyHoursCapped 永遠回 0）',
     /const\[coaches,shifts,attendance\]=await Promise\.all\(\[dbGetAll\('coaches'\),/.test(src)
     && /dbGetAll\('shifts'\)\.catch\(\(\)=>\[\]\), dbGetAll\('attendance'\)\.catch\(\(\)=>\[\]\)\]\);/.test(src));
}

console.log('\n⑤ 沒值班的人不畫，但名字還在');
{
  ok('★★★ 真正的值班＝不是支援班、也不是教練請假',
     /const _hasRealDuty=id=>_monthShifts0\.some\(s=>s\.emp_id===id && !shIsSub\(s\) && !shIsClassLeave\(s\)\);/.test(src));
  ok('★★★ 沒有真正值班的人收進 _shiftIdle，不進表格',
     /window\._shiftIdle=_pool\.filter\(c=>!_hasRealDuty\(c\.id\)/.test(src)
     && /let staff=_pool\.filter\(c=>_hasRealDuty\(c\.id\)/.test(src));
  /* 「不能用就寫原因，別藏按鈕」—— 而且這是還沒排班的人唯一的排班入口，
     真的藏起來會變成「need_duty 開著卻永遠排不了班」。 */
  ok('★★★ 名字收在表格下面，點一下加回表格', /<b>本月未排班<\/b>/.test(src)
     && /onclick="shiftShowIdle\('\$\{c\.id\}'\)"/.test(src));
  ok('★★★ shiftShowIdle 把人加回來並重畫',
     /function shiftShowIdle\(id\)\{[\s\S]{0,200}?window\._shiftShowExtra=\(window\._shiftShowExtra\|\|\[\]\)\.concat\(\[id\]\);[\s\S]{0,60}?renderShiftsTab\(\);/.test(src));
  ok('★★ 加回來的人照樣排在名單裡（兩個 filter 都認 _shiftShowExtra）',
     (src.match(/window\._shiftShowExtra\|\|\[\]\)\.includes\(c\.id\)/g)||[]).length===2);
  ok('★★ 沒人閒著就整行不畫（不要留一個空標題）',
     /\$\{\(window\._shiftIdle\|\|\[\]\)\.length\?`<div class="sh-idle">/.test(src));
}

console.log('\n⑥ 薪資完全沒被動到（使用者：「要檢查會不會影響到員工薪資喔」）');
{
  /* 這一輪只改顯示。薪資的三條路：
     ・dutyHoursCapped（值班時數）  ・need_duty（值班費總開關）  ・saveShift 存進去的欄位 */
  const D=g('function dutyHoursCapped(attendance, shifts, empId, month, emp){','\n  return total;\n}');
  ok('★★★ dutyHoursCapped 一個字都沒改：仍以 emp_id 篩、仍取 min(打卡,排班)',
     /let myShifts=\(shifts\|\|\[\]\)\.filter\(s=>s\.emp_id===empId&&\(s\.date\|\|''\)\.slice\(0,7\)===month\);/.test(D)
     && /total \+= \(punched!=null\) \? Math\.min\(punched, sched\) : 0;/.test(D));
  /* ⚠ 羅威搬到支援班列＝那 3 筆加上 is_sub，emp_id 仍是羅威。
       dutyHoursCapped 只對**主管**濾掉 is_sub，羅威不是主管 → 值班費一毛不差。 */
  ok('★★★ is_sub 只影響主管（羅威不是主管，搬過去值班費不變）',
     /if\(emp && emp\.is_manager\) myShifts=myShifts\.filter\(s=>!shIsSub\(s\)\);/.test(D)
     && (D.match(/shIsSub/g)||[]).length===1);
  /* ⚠ 千萬不要為了「不畫某人」去關 need_duty —— 那是值班費的總開關（26476/46514/
     46802/69143/72986 都用它當門），關掉等於值班費直接歸零。 */
  ok('★★★ 「不畫」是前端 filter，沒有碰 need_duty',
     !/_shiftIdle[\s\S]{0,400}?need_duty\s*=/.test(src));
  ok('★★★ need_duty 仍是值班費的門（沒被這次改動拆掉）',
     /const _dutyHrs = tpl\.need_duty \? dutyHours : 0;/.test(src)
     && /const dutyCap=emp\.need_duty\?dutyHoursCapped\(attendance,shifts,empId,ym,emp\):0;/.test(src));
  ok('★★★ saveShift 存的欄位沒變（起迄／時數／code／is_sub／sub_name 一個不少）',
     /const obj=\{ id:id\|\|uid\('shift'\), emp_id:empId, date, start_time:start, end_time:end, hours, note,/.test(src)
     && /const hours=shiftHours\(start,end\);/.test(src));
}

console.log('\n⑦ 支援班視窗只剩兩格');
{
  const M=g('function openShiftEdit(empId,dateStr){','\n}\n/* 支援班：選了班別');
  ok('★★★ 班別改成下拉（選了就帶起迄，不用再填一次時間）',
     /<select id="sh-subcode" onchange="shSubCodeSync\(\)">/.test(M)
     && /data-s="\$\{a\}" data-e="\$\{b\}"/.test(M));
  ok('★★★ 支援人員那一格留著（挑店內員工＝值班費照算）',
     /<select id="sh-subemp" onchange="shSubEmpSync\(\)">/.test(M));
  /* 起迄時間還是要存（值錢的是時數），只是不讓使用者再填一次 */
  ok('★★★ 起迄退成隱藏欄位，saveShift 照樣讀得到',
     /<input type="hidden" id="sh-start" value="/.test(M)
     && /<input type="hidden" id="sh-end" value="/.test(M)
     && /<input type="hidden" id="sh-note" value="/.test(M));
  ok('★★★ 支援班看不到：起時間下拉／常用時段快捷／備註欄／時數預覽',
     /\$\{_isSub\?'':`<div id="sh-preview"/.test(M)
     && /<label>起時間<\/label><select id="sh-start"/.test(M)   // 這一份只留給一般員工那一支
     && /`:`\n    <div style="display:flex;gap:10px;margin-bottom:10px;">/.test(M));
  const S=new Function('return '+g('function shSubCodeSync(){','\n}'))();
  {
    /* 實跑一次：選了班別要把起迄寫進隱藏欄位，不然存下去時數是 0、值班費就沒了 */
    const box={'sh-subcode':{options:[{getAttribute:k=>({'data-s':'16:00','data-e':'22:00'})[k]}],selectedIndex:0},
               'sh-start':{value:''},'sh-end':{value:''}};
    global.document={getElementById:id=>box[id]||null};
    S();
    eq('★★★ 選「晚」→ 起迄帶成 16:00–22:00', [box['sh-start'].value,box['sh-end'].value], ['16:00','22:00']);
    global.document={getElementById:()=>null};
    ok('★★ 找不到元素也不會爆', (()=>{ try{ S(); return true; }catch(e){ return String(e); } })());
    delete global.document;
  }
  ok('★★ 舊資料的自訂時段不會被洗掉（多補一個「原時段」選項）',
     /const _hit=SHIFT_QUICK\.some\(\(\[c,a,b\]\)=>a===_cs&&b===_ce\);/.test(M)
     && /\$\{escH\(cur\.code\|\|'原時段'\)\}/.test(M));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
