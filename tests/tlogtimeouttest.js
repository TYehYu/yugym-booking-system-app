/* 訓練課表讀不到就要講（2026-10-02 事故）

   教練鄭百益回報「新增動作按儲存，課表頁面上沒出現」，同一堂課連打了 7 次「旋轉」——
   7 筆全部好好地在資料庫裡。

   真正的成因不是寫不進去，是**讀不回來**：training_logs 的讀取權限規則寫成了
   對每一筆紀錄重掃一次 bookings（1,096 × 9,504），查詢超過 8 秒被資料庫砍掉。
   資料庫日誌 30 次逾時，時間點與他每一次存檔完全對上。
   （SQL 端的修法與驗收數字見 docs/migrations/20261003_tlog_rls_speedup.sql）

   ⚠⚠ 但讓這個洞查了兩天的，是前端這一行：
         try{ allLogs=await dbGetAll('training_logs'); }catch(_){}
       **錯誤被整個吞掉，allLogs 變成空陣列** —— 於是「讀失敗」與「這堂課還沒有紀錄」
       在畫面上長得一模一樣。中間還因此誤判成「分頁漏列」與「壞快取」各一次。

   這支測試守三件事：
     ① 讀失敗要講出來，而且要記下來（_tlLogsErr）
     ② 讀失敗時不准算 seq（空陣列會算出 1，把新紀錄插到整堂課最前面）
     ③ 讀失敗時不准套用課表（「已經記過哪些」是空的＝跳過同名那道防線失效） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const sql=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20261003_tlog_rls_speedup.sql','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 讀失敗要講出來');
{
  const R=g('async function renderTrainingLogSheet(){','\n}');
  ok('★★★ 不再是空的 catch（錯誤有接住、有記下來）',
     /catch\(e\)\{ _logsErr=e; allLogs=\[\];/.test(R));
  ok('★★★ 當場告訴教練（不要讓他以為是自己沒存成功）',
     /showToast\('課表讀取失敗，畫面上的紀錄可能不完整：'/.test(R));
  ok('★★★ 旗標掛上 window，別支函式看得到', /window\._tlLogsErr=_logsErr;/.test(R));
  ok('★★ 原本那句空 catch 已經不在了', !/try\{ allLogs=await dbGetAll\('training_logs'\); \}catch\(_\)\{\}/.test(src));
}

console.log('\n② 讀失敗時不准算 seq');
{
  const F=new Function('window','return '+g('function tlNextSeq(bid, add){','\n}'));
  const logs=[{booking_id:'BK-1',slot:null,seq:1},{booking_id:'BK-1',slot:null,seq:2}];
  eq('★★★ 正常時照算（下一個是 3）', F({_tlAllLogs:logs})('BK-1'), 3);
  /* ⚠ 這就是事故現場：清單是空的，照算會得到 1 —— 畫面依 seq 排序，
       新紀錄會插到整堂課最前面，而且每存一次都是 1。 */
  eq('★★★ 讀失敗 → 回 null，不要算出假的 1',
     F({_tlAllLogs:[], _tlLogsErr:new Error('timeout')})('BK-1'), null);
  eq('★★★ 就算清單看起來有資料，只要讀過失敗就不算',
     F({_tlAllLogs:logs, _tlLogsErr:new Error('timeout')})('BK-1'), null);
  eq('★★ 真的沒紀錄（讀取成功、清單是空的）仍然回 1',
     F({_tlAllLogs:[]})('BK-1'), 1);
  eq('★★ 1V2 第二位分開算（沒被這次改動弄壞）',
     F({_tlAllLogs:[{booking_id:'BK-1',slot:2,seq:5}], _tlSlot:2})('BK-1'), 6);
}

console.log('\n③ 讀失敗時不准套用課表');
{
  const H=g('async function _tlDoApplyHist(srcBid){','\n}');
  const P=g('async function _tlPlanApply(pid,useLast){','\n}');
  for(const [nm,F] of [['套用上次',H],['套用方案',P]]){
    ok(`★★★ ${nm}：讀失敗就擋下來（否則跳過同名那道防線等於沒有）`,
       /if\(window\._tlLogsErr\)\{/.test(F) && /先別套用（避免重複）/.test(F));
  }
  /* ⚠ 套用上次那一支在這之前已經把按鈕改成「套用中…」，提前離開一定要解鎖 */
  ok('★★★ 套用上次：提前離開前先解鎖按鈕（不要卡在「套用中…」）',
     /if\(window\._tlLogsErr\)\{ _unlock\(\); showToast/.test(H));
}

console.log('\n④ 資料庫端：權限規則只算一次');
{
  ok('★★★ 新函式是 STABLE SECURITY DEFINER', /stable\s*\n\s*security definer/.test(sql));
  /* ⚠⚠ 第一版寫成 `= any(coach_taught_member_ids())` 反而更慢（20 秒還跑不完）——
       STABLE 不保證只算一次，寫在條件裡就是一列呼叫一次。 */
  ok('★★★ 政策用 in (select unnest(...))，不是 = any(函式())',
     /member_id in \(select unnest\(coach_taught_member_ids\(\)\)\)/.test(sql)
     && !/= any \(coach_taught_member_ids\(\)\)/.test(sql));
  ok('★★★ 這個陷阱寫在原地（不然下一個人會再寫一次 = any）',
     /STABLE 只保證「同一句話裡結果不變」，\*\*不保證 Postgres 只算一次\*\*/.test(sql));
  ok('★★★ 可見範圍沒變：四個條件還是那四個',
     /\(select is_admin\(\)\)/.test(sql)
     && /coach_id = \(select current_employee_id\(\)\)/.test(sql)
     && /member_id = \(select current_member_id\(\)\)/.test(sql));
  ok('★★ 團課名單展開前先擋 jsonb_typeof（RLS 裡報錯＝那個人什麼都讀不到）',
     /jsonb_typeof\(b\.member_ids\) = 'array'/.test(sql));
  ok('★★ 取消的課不算（與原政策逐字對齊）',
     (sql.match(/status is distinct from 'cancelled'/g)||[]).length===2);
  ok('★★ 權限有給（authenticated 與 service_role 都不能漏）',
     /grant execute on function public\.coach_taught_member_ids\(\) to authenticated;/.test(sql)
     && /grant execute on function public\.coach_taught_member_ids\(\) to service_role;/.test(sql));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
