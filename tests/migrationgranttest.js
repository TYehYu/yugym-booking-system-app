/* Migration 一定要帶 GRANT（2026-09-25）

   Supabase 公告：自 2026/10/30 起，public schema 中**新建立的 table**
   不再自動取得 Data API 的存取權限。migration 建立、preview branch、
   本機 supabase db reset 重建的表，都必須明確 GRANT，
   否則 Data API 存取時會 permission denied。

   ⚠ 現有的表不受影響 —— 這支測試守的是「重建環境」那條路：
     docs/migrations 跑完之後，權限要與正式庫一致。
   ⚠ 0812 與 0909 各踩過一次漏 GRANT，兩次的症狀都是**靜默失效**：
     SELECT 失敗被 dbGetAll 的 catch 吞掉（回空陣列），畫面只是「還沒有資料」，
     一直到 INSERT 才爆權限不足。所以這件事一定要用測試守，不能靠記得。 */
const fs=require('fs'), path=require('path');
const DIR=process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations';
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 剝掉註解與字串常數再掃 —— 不剝的話會命中註解裡的範例、
   以及 0001 那支 event trigger 裡的 'CREATE TABLE AS' 字串（那不是建表）。 */
function codeOf(s){
  return s.replace(/\/\*[\s\S]*?\*\//g,' ')      // /* ... */
          .replace(/--[^\n]*/g,' ')             // -- ...
          .replace(/\$function\$[\s\S]*?\$function\$/g,' ')  // 函式本體（裡面有 DDL 字串）
          .replace(/'[^']*'/g,"''");             // 字串常數
}
const TBL=/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
const GRT=/grant\s+[^;]*?\s+on\s+(?:table\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
function names(re, code){ const out=new Set(); let m; re.lastIndex=0;
  while((m=re.exec(code))) out.add(m[1].toLowerCase()); return out; }

const files=fs.readdirSync(DIR).filter(f=>f.endsWith('.sql')).sort();

console.log('① 每一支建表的 migration，同一支裡就要有 GRANT');
{
  const gaps=[];
  files.forEach(f=>{
    const code=codeOf(fs.readFileSync(path.join(DIR,f),'utf8'));
    const t=names(TBL,code), g=names(GRT,code);
    [...t].forEach(x=>{ if(!g.has(x)) gaps.push(f+' → '+x); });
  });
  ok('★★★ 沒有任何一張建出來的表缺 GRANT', gaps.length===0, gaps);
  ok('　　真的有掃到東西（正則寫壞的話會全綠）', (()=>{
      let n=0; files.forEach(f=>{ n+=names(TBL,codeOf(fs.readFileSync(path.join(DIR,f),'utf8'))).size; });
      return n>=30; })());
}

console.log('\n② 新表不給 anon（公告第 3 點：請勿直接把所有 table 全部開放給 anon）');
{
  /* ⚠ 歷史表不在此限：baseline 時代 Supabase 預設就給 anon，
     22 張舊表因此都有四個權限，靠 RLS policy 的 auth.uid() IS NOT NULL 擋著。
     **照現況寫進 migration 是對的**（重建要一致），但新的不要跟進。
     判準用檔名日期：2026-09-25（立規範那天）之後的 migration 不准出現 anon。 */
  const CUT='20260925';
  const bad=[];
  files.forEach(f=>{
    const d=(f.match(/^(\d{8})/)||[])[1];
    if(!d || d<CUT) return;
    const code=codeOf(fs.readFileSync(path.join(DIR,f),'utf8'));
    let m; const re=/grant\s+[^;]*?\s+to\s+([^;]+);/gi;
    while((m=re.exec(code))) if(/\banon\b/.test(m[1])) bad.push(f+' → '+m[1].trim());
  });
  ok('★★★ 0925 之後的 migration 沒有給 anon', bad.length===0, bad);
  ok('★★ 歷史的 anon 刻意保留，理由寫在檔案裡',
     /anon 那幾張是 baseline 時代留下的/.test(fs.readFileSync(path.join(DIR,'0000_baseline_schema.sql'),'utf8')));
}

console.log('\n③ 三個角色都要照顧到');
{
  const need=['authenticated','service_role'];
  /* ⚠ 具名例外：這六張正式庫也只給 service_role，**沒有任何程式在用**
     （0909 全庫掃描時逐一確認過，當時的結論就是刻意不補）。
     這裡照現況寫進 migration 是對的 —— 重建環境要跟正式庫一樣。
     ⚠ 用具名清單而不是「小表就放行」之類的模糊規則：
       哪天其中一張真的被拿來用，會先在這裡看到它，而不是在線上壞掉才發現。 */
  const NO_AUTH=new Set(['category','member_level','reward_rules',
    'space_resources','spaces','ticket_type_member_levels']);
  const bad=[];
  files.forEach(f=>{
    const code=codeOf(fs.readFileSync(path.join(DIR,f),'utf8'));
    const t=names(TBL,code); if(!t.size) return;
    [...t].forEach(tab=>{
      const got=new Set();
      let m; const re=new RegExp('grant\\s+[^;]*?on\\s+(?:table\\s+)?(?:public\\.)?"?'+tab+'"?\\s+to\\s+([^;]+);','gi');
      while((m=re.exec(code))) m[1].split(',').forEach(r=>got.add(r.trim().toLowerCase()));
      need.forEach(r=>{
        if(r==='authenticated' && NO_AUTH.has(tab)) return;
        if(!got.has(r)) bad.push(f+' → '+tab+' 缺 '+r); });
    });
  });
  ok('★★★ 每張表的 authenticated 與 service_role 都有給', bad.length===0, bad);
  ok('★★★ service_role **一張都不能漏**（Edge Function 繞過 RLS，全靠它）',
     !bad.some(x=>/service_role/.test(x)), bad.filter(x=>/service_role/.test(x)));
  ok('★★ 六張沒人用的表只給 service_role，理由寫在 migration 原地',
     /那幾張沒有任何程式在用（0909 全庫掃描時確認過，刻意不補）/.test(
       fs.readFileSync(path.join(DIR,'0000_baseline_schema.sql'),'utf8')));
  ok('★★ service_role 為什麼不能漏，寫在原地（Edge Function 用它，而且失敗是靜默的）',
     /Edge Function 用 SERVICE_ROLE_KEY，碰不到這張表/.test(
       fs.readFileSync(path.join(DIR,'20260804_change_log.sql'),'utf8')));
}

console.log('\n④ 範本存在，而且講得出三個角色的差別');
{
  const T=path.join(DIR,'_TEMPLATE_new_table.sql');
  ok('★★★ 有範本檔', fs.existsSync(T));
  const s=fs.existsSync(T)?fs.readFileSync(T,'utf8'):'';
  ok('★★★ 範本的 GRANT 只給 authenticated 與 service_role',
     /grant select, insert, update, delete on public\.<新表> to authenticated;/.test(s)
     && /grant select, insert, update, delete on public\.<新表> to service_role;/.test(s)
     && !/to anon;/.test(s));
  ok('★★ 範本要求同時開 RLS（GRANT 只是能不能碰到表，真正的權限在 policy）',
     /alter table public\.<新表> enable row level security;/.test(s)
     && /真正的權限在這裡，GRANT 只是「能不能碰到這張表」/.test(s));
  ok('★★ 範本講明公告日期與影響範圍', /2026\/10\/30/.test(s) && /現有的表不受影響/.test(s));
  ok('★★ 範本寫明 0812 的教訓（不要為了這次去動既有 grants）',
     /不要為了這次更新去動它們/.test(s));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
