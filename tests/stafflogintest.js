/* 登入頁的員工入口（2026-08-27 使用者：「登入頁面新增一個員工專用登入按鈕」）

   背景：2026-08-20 使用者指示把員工入口從會員頁移除（「員工另外用網址登入」），
   當時只留 #staff 網址這條路。現在放回一顆按鈕。
   ⚠ 員工表單（#login-staff-view）與 doLoginStaff 一直都在，這次只是補回入口，
     登入流程一行都沒動。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 按鈕在會員入口裡，點了切到員工表單');
{
  const MV=src.slice(src.indexOf('<div id="login-member-view">'), src.indexOf('<!-- 員工入口（點擊才顯示） -->'));
  ok('★★ 按鈕就在會員入口區塊內（跟著會員頁一起顯示／隱藏）',
     /<div id="staff-login-toggle"/.test(MV)
     && /<button type="button" class="login-staffbtn" onclick="gotoStaffLogin\(\)">/.test(MV));
  ok('★ 文案是「員工登入」，配一個盾牌圖示', /員工登入\s*<\/button>/.test(MV) && /<svg width="18" height="18"/.test(MV));
  ok('　 排在會員入口最後（LINE ／手機登入之後）',
     MV.indexOf('line-login-block') < MV.indexOf('staff-login-toggle')
     && MV.indexOf('phone-login-block') < MV.indexOf('staff-login-toggle'));
}

console.log('\n② gotoStaffLogin：切畫面 ＋ 設 #staff ＋ 游標落在帳號欄');
{
  const seg=src.slice(src.indexOf('function gotoStaffLogin(){'), src.indexOf('// 展開手機登入區'));
  const log={mode:null, url:null, focused:0};
  const el={focus:()=>{log.focused++;}};
  new Function('history','location','switchLoginMode','setTimeout','document', seg+'\ngotoStaffLogin();')(
    {replaceState:(a,b,u)=>{log.url=u;}},
    {pathname:'/app/', search:''},
    m=>{log.mode=m;},
    f=>f(),
    {getElementById:id=>id==='login-acct-staff'?el:null});
  eq('★★ 切到員工表單', log.mode, 'staff');
  eq('★★ 網址設成 #staff（員工在櫃檯常重新整理，沒設會被彈回會員頁）', log.url, '/app/#staff');
  eq('★ 游標直接落在帳號欄', log.focused, 1);
  ok('★★ 進場路由本來就吃 #staff（兩邊對得起來）',
     /switchLoginMode\(\/staff\/i\.test\(hash\) \? 'staff' : 'member'\);/.test(src));
  ok('★★ 「← 返回會員登入」會把 hash 清掉（對稱，不會卡在員工頁）',
     /onclick="history\.replaceState\(null,'',location\.pathname\);switchLoginMode\('member'\)"/.test(src));
  ok('　 replaceState 包在 try 裡（某些 webview 會擋 history API，不能因此卡住登入）',
     /try\{ history\.replaceState\(null,'',location\.pathname\+location\.search\+'#staff'\); \}catch\(_\)\{\}/.test(seg));
  ok('　 保留 search（?v= 之類的參數不能被吃掉）', /location\.pathname\+location\.search\+'#staff'/.test(seg));
}

console.log('\n③ 樣式：安靜的第二順位，不跟 LINE 主鈕搶');
{
  ok('★★ 透明底＋米白細框（登入頁是深綠底）',
     /\.login-staffbtn\{width:100%;padding:13px;border:1\.5px solid rgba\(244,241,232,\.42\);border-radius:11px;\s*\n\s*background:transparent;color:#F1EADA;/.test(src));
  ok('★ LINE 那顆仍是實心綠主鈕（層級沒被拉平）',
     /background:#06C755;color:#fff;font-size:16px;font-weight:700;/.test(src));
  ok('　 字級比主鈕小一階（15 vs 16）', /\.login-staffbtn\{[^}]*font-size:15px;/.test(src));
  ok('　 有 hover 與按下的回饋', /\.login-staffbtn:hover\{background:rgba\(244,241,232,\.12\);/.test(src)
     && /\.login-staffbtn:active\{transform:translateY\(1px\);\}/.test(src));
}

console.log('\n④ 登入流程一行都沒動');
{
  ok('★★ 員工表單與送出仍是原本那一套',
     /<div id="login-staff-view" class="hidden">/.test(src)
     && /<input type="text" id="login-acct-staff"/.test(src)
     && /<button class="btn-primary" onclick="doLoginStaff\(\)">登入<\/button>/.test(src));
  ok('★★ switchLoginMode 本體沒被改（只是多一個呼叫端）',
     /function switchLoginMode\(mode\)\{\s*\n\s*document\.getElementById\('login-member-view'\)\.classList\.toggle\('hidden', mode!=='member'\);/.test(src));
  ok('　 0820 移除入口的那段歷史寫在原地（免得下一個人以為是漏掉的）',
     /2026-08-20 曾把它從會員頁移除、改成只走 #staff 網址；現在放回來/.test(src));
  ok('　 為什麼做成第二順位，寫在原地',
     /會員是絕大多數，員工一天只登入一次/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
