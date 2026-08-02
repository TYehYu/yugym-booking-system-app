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
ok('★ 打卡清單每一列都點得開', /class="pe-row" onclick="openPunchEdit\('\$\{id\}','\$\{a\.date\|\|''\}'\)"/.test(src));
ok('★ 清單下方有「＋ 補登打卡」（整天沒打到時用）',
   /<button class="btn btn-green" onclick="openPunchEdit\('\$\{id\}'\)">＋ 補登打卡<\/button>/.test(src));
ok('★ 忘記打下班的那幾天用紅字標出來',
   /miss1\?'<span style="color:var\(--danger,#b5372e\);font-weight:700;">未打<\/span>'/.test(src));
ok('　　看得出來列點得動（游標＋hover）', /tr\.pe-row\{cursor:pointer;/.test(src)
   && /tr\.pe-row:hover td\{background:var\(--sage-bg,#eef4ee\);\}/.test(src));
ok('　　教練自己看的時候不出現可點與補登（只有櫃檯能改）',
   /const _canFix=isDeskLike\(\);/.test(src)
   && /\$\{_canFix\?`<button class="btn btn-green" onclick="openPunchEdit/.test(src));
ok('★ 上下班都用時：分兩個下拉（工時要算到分，不能用 30 分一格的時段下拉）',
   /\$\{hmPicker\('pe-in', \(rec&&rec\.clock_in\)\|\|''\)\}/.test(src)
   && /\$\{hmPicker\('pe-out',\(rec&&rec\.clock_out\)\|\|''\)\}/.test(src));
ok('★ 日期是下拉不是手打（避免打錯年份、也不會補到未來）',
   /function dateOptions\(id, sel\)\{/.test(src)
   && /for\(let i=0;i<60;i\+\+\)\{/.test(src));
ok('★ 儲存也上了防連點鎖', /return onceAct\('punchedit:'\+empId, \(\)=>_savePunchEdit\(empId\)\);/.test(src));
ok('★ 留痕：誰補的、什麼時候補的（事後對薪資有疑問時查得到）',
   /rec\.fixed_by=\(SESSION&&SESSION\.id\)\|\|null; rec\.fixed_at=new Date\(\)\.toISOString\(\);/.test(src));
ok('　　存完回到打卡清單（連續處理不用重進）',
   (src.match(/ppOpenEmpPunch\(empId\); return;/g)||[]).length>=1
   && /showToast\(rec\.work_hours!=null\?`已儲存，工時 \$\{rec\.work_hours\} 小時`/.test(src));

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
