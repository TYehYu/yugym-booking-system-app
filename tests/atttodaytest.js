/* 今日出勤區塊收斂＋日期翻頁（2026-07-30 使用者回報「版面佔太大」）
   原本兩張大 KPI 卡（應出勤／已打卡）把員工管理頁的第一屏整個吃掉，
   而且只有一個日曆輸入框，要看別天得每次點開日曆。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('版面收斂');
ok('★ 兩張 KPI 大卡移除', !/<div class="stat-grid dash-summary"><div class="stat-card"><div class="sc-label">應出勤（排班）<\/div>/.test(src));
ok('★ 改成標題列旁一行摘要（排班／已打卡／未打卡）',
   /<span class="att-sum">排班 <b>\$\{dutyEmpIds\.length\}<\/b> 人　·　已打卡 <b class="ok">\$\{punchedIn\}<\/b> 人\$\{miss\?/.test(src));
ok('　　全員都打卡時不顯示「未打卡 0 人」', /\$\{miss\?`　·　未打卡 <b class="miss">\$\{miss\}<\/b> 人`:''\}/.test(src));
ok('　　未打卡不可能是負數', /const miss=Math\.max\(0,dutyEmpIds\.length-punchedIn\);/.test(src));
ok('　　表格列距收斂', /\.att-tbl th,\.att-tbl td\{padding-top:7px;padding-bottom:7px;font-size:13px;\}/.test(src));
ok('　　摘要三個數字顏色分明（一般／綠／金）',
   /\.att-sum b\.ok\{color:var\(--green\);\}/.test(src) && /\.att-sum b\.miss\{color:var\(--gold-d,#b48a56\);\}/.test(src));

console.log('\n日期翻頁');
ok('★ 前一天／後一天各一顆按鈕',
   /onclick="attStepDate\(-1\)" title="前一天"/.test(src) && /onclick="attStepDate\(1\)" title="後一天"/.test(src));
ok('★ 日曆輸入框保留（可直接跳到指定日）',
   /<input type="date" value="\$\{date\}" onchange="_attDate=this\.value;navTo\(CUR_PAGE\)">/.test(src));
ok('★ 不在今天時多一顆「回今天」', /\$\{isToday\?'':'<button type="button" class="btn btn-ghost btn-sm" onclick="attToday\(\)">回今天<\/button>'\}/.test(src));
ok('　　標題會跟著改（今天→今日出勤，其他天→出勤）', /\$\{isToday\?'今日出勤':'出勤'\}/.test(src));
ok('　　日期旁標星期', /\$\{wd\?`<span class="att-wd">（\$\{wd\}）<\/span>`:''\}/.test(src));
ok('　　員工管理頁與出勤管理頁共用 → 重繪目前那一頁', /_attDate=ymd\(d\);\s*\n\s*navTo\(CUR_PAGE\);/.test(src));
ok('　　按鈕標了 aria-label（只有箭頭符號，讀螢幕聽不出來）',
   /aria-label="前一天"/.test(src) && /aria-label="後一天"/.test(src));
ok('　　type="button"，不會誤觸表單送出', (src.match(/<button type="button" class="att-arw"/g)||[]).length===2);
ok('　　原因寫在程式裡', /版面佔太大/.test(src) && /不必每次點開日曆/.test(src));

// 實跑翻頁
{
  const i=src.indexOf('function attStepDate(n){'); const j=src.indexOf('\n}\n',i)+2;
  const k=src.indexOf('function attToday(){');
  const code=src.slice(i,j)+'\n'+src.slice(k,src.indexOf('\n',k));
  let _attDate=null, page=0;
  const env={ parseYmd:s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);},
              ymd:d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
              TODAY:new Date(2026,6,30), CUR_PAGE:'staff', navTo:()=>{page++;} };
  const api=new Function(...Object.keys(env),'let _attDate=null;'+code+
    '\nreturn {step:n=>{attStepDate(n);return _attDate;}, today:()=>{attToday();return _attDate;}, set:v=>{_attDate=v;}};')(...Object.values(env));

  console.log('\n實跑');
  eq('★ 從今天往前一天', api.step(-1), '2026-07-29');
  eq('★ 再往前一天（連續翻頁從目前那天算）', api.step(-1), '2026-07-28');
  eq('★ 往後兩次回到今天', [api.step(1),api.step(1)], ['2026-07-29','2026-07-30']);
  eq('★ 跨月往前（8/01 → 7/31）', (api.set('2026-08-01'), api.step(-1)), '2026-07-31');
  eq('　　跨月往後（7/31 → 8/01）', (api.set('2026-07-31'), api.step(1)), '2026-08-01');
  eq('　　跨年（2026-12-31 → 2027-01-01）', (api.set('2026-12-31'), api.step(1)), '2027-01-01');
  eq('　　閏年 2/28 → 2/29（2028）', (api.set('2028-02-28'), api.step(1)), '2028-02-29');
  eq('★ 回今天＝清掉選取日（讓渲染吃 TODAY）', api.today(), null);
  eq('　　壞掉的日期不會爆、也不會亂跳', (api.set('壞掉'), api.step(1)), '壞掉');
  ok('　　每次翻頁都重繪頁面', page>0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
