/* 2026-08-02 使用者回報／指示：
   ②「薪資單用彈出視窗顯示上方選擇月份」
   ③「員工列表有看到打卡異常的驚嘆號了，可以點進員工視窗，點了打卡按鈕，
       沒有可以補打卡的功能」

   ③ 的缺口：昨天做的驚嘆號彈窗只能「補登下班」，但櫃檯常遇到的是整天沒打到
   （忘了帶手機、相機故障），那要能連上班一起補。員工資料 →「最近打卡」原本
   是唯讀清單，現在每一列都可以點開修改，另外有一顆「＋ 補登打卡」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 員工資料 → 打卡紀錄可以補登');
ok('★ 有補登／修改的視窗', /async function openPunchEdit\(empId, dateStr\)\{/.test(src));
ok('★ 只有管理員／櫃台可以補', /if\(!isDeskLike\(\)\)\{ showToast\('只有管理員或櫃台可以補登打卡'\); return; \}/.test(src));
/* 2026-08-02 二修（使用者指示「把最近打卡這功能整理在本月值班裡面」）：
   那張打卡長表格整份收進值班月曆了，入口改成月曆上的日期格（見 empcaltest.js）。 */
ok('★ 月曆上點日期就能改那一天的打卡',
   /openPunchEdit\('\$\{_ppCal\.id\}','\$\{ds\}'\)">\$\{at\?'修改這天的打卡':'補登這天的打卡'\}/.test(src));
ok('★ 值班視窗下方有「＋ 補登打卡」（整天沒打到時用）',
   /<button class="btn btn-green" onclick="openPunchEdit\('\$\{_ppCal\.id\}'\)">＋ 補登打卡<\/button>/.test(src));
ok('★ 忘記打下班的那幾天在月曆上就標出來',
   /\$\{miss\?'未打下班':/.test(src));
ok('　　教練自己看的時候不出現補登（只有櫃檯能改）',
   /\$\{\(!isCls&&isDeskLike\(\)\)\?`<button class="btn btn-green" onclick="openPunchEdit/.test(src));
ok('★ 上下班都用時：分兩個下拉（工時要算到分，不能用 30 分一格的時段下拉）',
   /\$\{hmPicker\('pe-in', \(rec&&rec\.clock_in\)\|\|''\)\}/.test(src)
   && /\$\{hmPicker\('pe-out',\(rec&&rec\.clock_out\)\|\|''\)\}/.test(src));
ok('★ 日期是下拉不是手打（避免打錯年份、也不會補到未來）',
   /function dateOptions\(id, sel\)\{/.test(src)
   && /for\(let i=0;i<60;i\+\+\)\{/.test(src));
ok('★ 儲存也上了防連點鎖', /return onceAct\('punchedit:'\+empId, \(\)=>_savePunchEdit\(empId\)\);/.test(src));
ok('★ 留痕：誰補的、什麼時候補的（事後對薪資有疑問時查得到）',
   /rec\.fixed_by=\(SESSION&&SESSION\.id\)\|\|null; rec\.fixed_at=new Date\(\)\.toISOString\(\);/.test(src));
ok('　　存完回到值班月曆（連續處理不用重進）',
   (src.match(/ppOpenEmpPunch\(empId\); return;/g)||[]).length>=1
   && /showToast\(rec\.work_hours!=null\?`已儲存，工時 \$\{rec\.work_hours\} 小時`/.test(src));

console.log('\n④ 今日值班圓環也能改上班時間（2026-09-04）');
/* 使用者附截圖（代打下班卡）問「這個晚打卡的 管理員有修正的功能嗎」。
   ⚠ 先講清楚：**本來就有** —— 就是這支測試 ① 在守的 openPunchEdit
     （員工資料 → 本月值班 → 點某一列），上班下班都能改、還能刪。
     我第一次回答說「沒有」是錯的。
   缺的其實是**入口**：使用者看的是首頁今日值班的圓環，那裡原本只有「代打下班卡」，
   上班時間是唯讀顯示；要改上班得離開首頁、繞到員工資料去。
   ⚠ 而且原本只有「還沒下班」才點得開，人一旦下班，圓環就完全點不動了。 */
ok('★★★ 已下班也點得開（_canProxy 不再帶 !done）',
   /const _canProxy=!!\(isToday && att && att\.id\s*\n\s*&& SESSION && SESSION\.role==='admin'\);/.test(src));
ok('★★★ 上班時間變成可改的欄位',
   /<div class="form-row"><label>上班時間<\/label>\$\{hmPicker\('dpo-in',rec\.clock_in\)\}<\/div>/.test(src));
/* 已下班時它是純修正對話框，標題與按鈕都要換字，免得管理員以為在重打一次卡。 */
ok('★★★ 已下班時標題與按鈕換字',
   /\$\{_done\?'修正打卡時間':'代打下班卡'\}/.test(src)
   && /\$\{_done\?'儲存修正':'確認代打'\}/.test(src));
/* 已下班時下班欄要帶原本的值，不能用「現在」蓋掉他本來就打對的時間。 */
ok('★★★ 下班預設值：未下班＝現在，已下班＝原本那筆',
   /const _outDef=_done\?rec\.clock_out:nowHM\(\);/.test(src));
ok('★★★ 上班不能晚於下班（跨午夜會算出 20 幾小時工時）',
   /if\(timeToMin\(t\)<timeToMin\(tin\)\)\{/.test(src));
ok('★★★ 兩個都沒動就不寫入（避免留下無意義的修改紀錄）',
   /if\(!_chg\.length\)\{ closeModal\(\); showToast\('時間沒有變動'\); return; \}/.test(src));
/* 留痕要寫清楚改了哪幾項 —— 只寫「代打下班」的話，日後工時對不上會找不到是上班被改過。 */
ok('★★★ 留痕列出實際改動（上班 09:11→09:00 這種）',
   /if\(tin!==rec\.clock_in\) _chg\.push\(`上班 \$\{rec\.clock_in\}→\$\{tin\}`\);/.test(src));
ok('★★★ fixed_by／fixed_at 一併寫（attendance 本來就有這兩欄）',
   /rec\.fixed_by=\(SESSION&&SESSION\.id\)\|\|null;\s*\n\s*rec\.fixed_at=new Date\(\)\.toISOString\(\);/.test(src));
ok('★★ 「本來就有 openPunchEdit」這件事寫在原地，免得再誤判一次',
   /「打卡異常」只認「有上班沒下班」，晚打卡不算異常，不會出現在任何清單上/.test(src));
/* ⚠ 兩條路的權限目前**不一致**：openPunchEdit 是 isDeskLike（櫃檯也能改），
   圓環這條沿用代打下班的 role==='admin'（櫃檯不能）。
   這個矛盾在 0829 代打下班上線時就存在，不是 0904 造成的；
   要收斂成哪一種是使用者的決定，這裡先把現況釘住，避免有人以為某一邊寫錯了。 */
ok('★★★ 兩條路的權限差異已被釘住（改動任一邊都會在這裡爆）',
   /if\(!isDeskLike\(\)\)\{ showToast\('只有管理員或櫃台可以補登打卡'\); return; \}/.test(src)
   && /if\(!\(SESSION && SESSION\.role==='admin'\)\)\{ showToast\('只有管理員可以代打卡'\); return; \}/.test(src));

console.log('\n② 實跑：補登的存檔規則');
{
  const i=src.indexOf('async function _savePunchEdit(empId){');
  const body=src.slice(i, src.indexOf('\n}\n', i)+3);
  const run=async(fields, existing)=>{
    const put=[], del=[]; const toasts=[];
    const vals={'pe-date':fields.date||'2026-08-01','pe-note':fields.note||''};
    const env={
      document:{ getElementById:id=>vals[id]!==undefined?{value:vals[id]}:null },
      readHM:id=>id==='pe-in'?(fields.in||''):(fields.out||''),
      getAttendance:async()=>existing||null,
      dbGet:async()=>({id:'E1',name:'小曾'}),
      dbPut:async(_t,o)=>{put.push(JSON.parse(JSON.stringify(o)));},
      dbDel:async(_t,id)=>{del.push(id);},
      calcWorkHours:r=>{ if(!r.clock_in||!r.clock_out) return null;
        const[a,b]=r.clock_in.split(':').map(Number),[c,d]=r.clock_out.split(':').map(Number);
        let m=(c*60+d)-(a*60+b); if(m<0)m+=1440; return Math.round(m/6)/10; },
      uid:p=>p+'-1', ymd:()=>'2026-08-02', TODAY:new Date(2026,7,2),
      SESSION:{id:'staff1'}, showToast:m=>toasts.push(m),
      ppOpenEmpPunch:()=>{}, onceAct:(k,fn)=>fn(),
    };
    const f=new Function(...Object.keys(env), body+'\nreturn _savePunchEdit;')(...Object.values(env));
    await f('E1');
    return {put, del, toasts};
  };

  (async()=>{
    let r=await run({date:'2026-07-30', in:'09:00', out:'18:30'}, null);
    eq('★ 整天沒紀錄 → 新建一筆，上下班都寫進去',
       [r.put.length, r.put[0].date, r.put[0].clock_in, r.put[0].clock_out], [1,'2026-07-30','09:00','18:30']);
    eq('★ 工時跟著算', r.put[0].work_hours, 9.5);
    eq('　　留下是誰補的', r.put[0].fixed_by, 'staff1');

    r=await run({date:'2026-07-30', in:'09:00', out:'21:00'}, {id:'AT-9',emp_id:'E1',date:'2026-07-30',clock_in:'09:00',clock_out:null});
    eq('★ 已有紀錄 → 修改同一筆（不會多長一筆）', [r.put.length, r.put[0].id], [1,'AT-9']);
    eq('　　補上下班之後工時才算得出來', r.put[0].work_hours, 12);

    r=await run({date:'2026-07-30', in:'', out:''}, {id:'AT-9',emp_id:'E1',date:'2026-07-30',clock_in:'09:00'});
    eq('★ 兩個時間都清空 → 刪掉那一天（日期打錯時收得回來）', [r.del, r.put.length], [['AT-9'],0]);

    r=await run({date:'2026-07-30', in:'', out:''}, null);
    eq('　　本來就沒有紀錄還按刪 → 不會爆，只提示', [r.del.length, r.put.length], [0,0]);
    ok('　　　　提示講清楚', /沒有東西可以刪/.test(r.toasts.join('')));

    r=await run({date:'2026-07-30', in:'09:00', out:''}, null);
    eq('★ 只補單邊（例如只知道上班時間）→ 存得起來，工時留空',
       [r.put[0].clock_in, r.put[0].clock_out, r.put[0].work_hours], ['09:00',null,null]);
    ok('　　　　提示不會假裝算得出工時', /只有單邊時間，工時待補/.test(r.toasts.join('')));

    r=await run({date:'2026-07-30', in:'22:00', out:'02:00'}, null);
    eq('　　跨午夜也算得對（22:00–02:00 ＝ 4 小時）', r.put[0].work_hours, 4);

    console.log('\n③ 薪資單上方改成可以直接挑月份');
    ok('★ 月份改成下拉（原本只有前後鍵，看三個月前要按三次）',
       /<select class="sal-mpick" onchange="\$\{_msPick\}">\$\{monthOptions\(month, ymd\(TODAY\)\.slice\(0,7\)\)\}<\/select>/.test(src));
    ok('★ 彈出視窗版與整頁版各有自己的重繪',
       /function salarySheetPickMonth\(ym\)\{ if\(!ym\) return; window\._salaryMonth=ym; renderSalaryContent/.test(src)
       && /function salaryPickMonth\(ym\)\{ if\(!ym\) return; window\._salaryMonth=ym; navTo\('coach_salary'\); \}/.test(src));
    ok('★ 只列到本月（未來的月份沒有薪資可看）', /monthOptions\(month, ymd\(TODAY\)\.slice\(0,7\)\)/.test(src));
    ok('★ 本月時「下個月」按不動（不然會跳到空白的未來月）',
       /<button class="btn btn-ghost btn-sm"\$\{isCurMonth\?' disabled style="opacity:\.4;cursor:not-allowed;"':''\} onclick="\$\{isCurMonth\?'':_msNext\}">下個月 ›<\/button>/.test(src));
    ok('　　前後鍵保留（看上一個月這種順手的操作）', /onclick="\$\{_msPrev\}">‹ 上個月<\/button>/.test(src));
    ok('　　下拉站在原本「年 月」大字的位置，看起來仍是標題',
       /\.sal-mpick\{border:1px solid var\(--bd\);border-radius:9px;/.test(src));

    console.log(`\n${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  })();
}
