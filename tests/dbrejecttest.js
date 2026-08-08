/* 2026-08-08 使用者回報：「櫃檯帳號在切換導覽列的時候都會跳權限不足的提示」
                          「管理員帳號也是」

   兩層原因，兩個都修：

   ① 直接成因：新表 ticket_grant_requests 是用 create table 建的，只寫了 RLS policy
      卻沒有 grant。policy 管的是「這一列給不給看」，grant 管的是「這個角色能不能碰
      這張表」—— 兩個都要。authenticated 沒有 SELECT，於是每次換頁的待審核查詢
      都被擋成 42501。（migration 20260808_grant_ticket_grant_requests.sql）

   ② 更根本的問題：dbGetAll 把 `p.then(r=>r.data)` 這個衍生 promise 放進 _dbInflight。
      p 的拒絕由函式裡的 await 接手了，dataP 卻沒有人接 —— 於是**任何一次讀取失敗**
      都會多產生一個 unhandledrejection，被全域處理器抓去跳一次 Toast。
      呼叫端明明自己 try/catch 了，畫面還是會跳；而且這與新表無關，
      全站每一次讀取失敗都會這樣（只是平常很少失敗，沒被發現）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 衍生 promise 不再變成 unhandledrejection');
ok('★★ dataP 自己吃掉一次拒絕',
   /const dataP=p\.then\(r=>r\.data\);/.test(src)
   && /dataP\.catch\(\(\)=>\{\}\);\n\s*_dbInflight\.set\(key,dataP\);/.test(src));
ok('★ 註解說明這只是消音、不改變呼叫端行為',
   /這裡只是「消音」，不改變行為：等在 _dbInflight 上的呼叫端 await 的是同一個 dataP，/.test(src));
ok('★ 全域處理器還在（真的沒人接的錯誤仍要出得來）',
   /window\.addEventListener\('unhandledrejection', e=>\{/.test(src));

// 實跑：模擬「p 拒絕、函式自己 await 並往外丟」，確認 dataP 不會變成未處理拒絕
{
  let unhandled=0;
  const onRej=()=>{ unhandled++; };
  process.on('unhandledRejection', onRej);
  (async()=>{
    const mk=(silence)=>{
      const p=Promise.reject(new Error('RLS'));
      const dataP=p.then(r=>r.data);
      if(silence) dataP.catch(()=>{});
      return p.catch(()=>{});           // 模擬函式裡的 await p（有人接）
    };
    await mk(true);
    await new Promise(r=>setTimeout(r,30));
    eq('★★ 加了 dataP.catch → 沒有未處理的拒絕', unhandled, 0);
    unhandled=0;
    await mk(false);
    await new Promise(r=>setTimeout(r,30));
    ok('★★ 沒加的話就會多出一個（這就是使用者看到的那個 Toast）', unhandled>0, unhandled);
    process.off('unhandledRejection', onRej);

    console.log('\n② 待審核查詢：失敗一次就不再重試');
    ok('★★ 讀不到就靜靜當作沒有，並記下來不再重試',
       /let _grantReqOff=false;/.test(src)
       && /if\(_grantReqOff\) return \[\];/.test(src)
       && /_grantReqOff=true;/.test(src));
    ok('★ 失敗有進 console（查得到原因，只是不吵使用者）',
       /console\.error\('待審核發放讀取失敗（本次工作階段不再重試）：', e\);/.test(src));
    ok('　　為什麼要關掉重試，寫在原地',
       /失敗一次就記下來、整個工作階段不再重試 —— 不然一個設定問題會變成每換一頁跳一次提示。/.test(src));

    console.log('\n③ 新表的 grant');
    {
      const mig=process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260808_grant_ticket_grant_requests.sql';
      ok('★ migration 有進版控', fs.existsSync(mig));
      const sql=fs.readFileSync(mig,'utf8');
      ok('★★ authenticated 拿到四種 DML',
         /grant select, insert, update, delete on public\.ticket_grant_requests to authenticated;/.test(sql));
      ok('★ 也給 service_role（edge function 之後要用）',
         /grant select, insert, update, delete on public\.ticket_grant_requests to service_role;/.test(sql));
      ok('★★ 為什麼 policy 不夠，寫在 migration 裡',
         /policy 是「這一列給不給看」，grant 是「這個角色能不能碰這張表」，\n-- 兩個都要。/.test(sql));
      ok('　　建表的 migration 也補上 grant（之後重跑不會又漏）',
         /grant select, insert, update, delete on public\.ticket_grant_requests to authenticated;/
           .test(fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260808_ticket_grant_requests.sql','utf8')));
    }

    console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
    process.exit(fail?1:0);
  })();
}
