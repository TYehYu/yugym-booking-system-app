/* 2026-08-06 使用者指示（附頂欄截圖）：「管理員單獨放到左邊 logo 右邊」

   管理員是設定類的入口（員工、勞健保、權限、課程方案…），跟每天在用的
   首頁／預約／會員／月報表／班表不同性質，混在中央那顆導覽膠囊裡容易誤點。
   抽出來自成一顆，貼在品牌字旁邊；中央膠囊只留日常功能。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 拆分（實跑那段分組算式）');
{
  const groups=[{key:'g_dashboard',label:'首頁總覽'},{key:'g_booking',label:'預約管理'},
    {key:'g_member',label:'會員管理'},{key:'g_admin',label:'管理員'},
    {key:'g_report',label:'月報表'},{key:'g_supervisor',label:'班表'}];
  const split=isCoachWide=>{
    const _adminG = isCoachWide ? null : groups.find(g=>g.key==='g_admin');
    const _pillGroups = isCoachWide ? groups : groups.filter(g=>g.key!=='g_admin');
    return {admin:_adminG?_adminG.key:null, pill:_pillGroups.map(g=>g.key)};
  };
  eq('★ 管理員抽出來，膠囊只剩日常五顆', split(false),
     {admin:'g_admin', pill:['g_dashboard','g_booking','g_member','g_report','g_supervisor']});
  eq('　　教練桌機版沒有管理員（那條路只放首頁與預約）', split(true).admin, null);
  ok('★ 順序不變：月報表仍在班表左邊',
     split(false).pill.indexOf('g_report') < split(false).pill.indexOf('g_supervisor'));
}

console.log('\n② 接線');
ok('★ 獨立那顆插在品牌字之後、中央膠囊之前',
   src.indexOf('<span class="mc-brand-sub">有肌訓練</span>')
     < src.indexOf('class="mc-nav-item mc-admin-btn')
   && src.indexOf('class="mc-nav-item mc-admin-btn') < src.indexOf('<nav class="mc-nav">'));
ok('★ 中央膠囊改吃 _pillGroups（不再是全部 groups）',
   /: _pillGroups\.map\(g=>`<div class="mc-nav-item\$\{CUR_GROUP===g\.key\?' active':''\}" data-group="\$\{g\.key\}"/.test(src));
ok('★ 帶 data-group="g_admin" → selectGroup 的 active 切換照舊管得到它',
   /class="mc-nav-item mc-admin-btn\$\{CUR_GROUP==='g_admin'\?' active':''\}" data-group="g_admin"/.test(src)
   && /document\.querySelectorAll\('\.mc-nav-item'\)\.forEach\(el=>el\.classList\.toggle\('active',el\.dataset\.group===gkey\)\);/.test(src));
ok('　　點下去仍走同一支 selectGroup（不另開一套路由）',
   /onclick="selectGroup\('g_admin'\)" title="\$\{MC_LABELS\.g_admin\|\|_adminG\.label\}"/.test(src));
ok('　　教練桌機版不畫這顆（isCoachWide 時 _adminG 為 null）',
   /const _adminG = isCoachWide \? null : groups\.find\(g=>g\.key==='g_admin'\);/.test(src));

console.log('\n③ 樣式');
ok('★ 獨立那顆自己帶膠囊底（它在 .mc-nav 之外，沒有容器可以靠）',
   /body\.mc-mode \.mc-admin-btn\{flex:0 0 auto;margin-left:2px;\n\s*background:rgba\(255,255,255,\.1\);border:1px solid rgba\(255,255,255,\.16\);border-radius:999px;\}/.test(src));
ok('★ 選中時與膠囊裡的 active 同一個樣子（米白底、綠字）',
   /body\.mc-mode \.mc-admin-btn\.active\{background:#F4F1E8;color:var\(--green\);font-weight:700;/.test(src)
   && /body\.mc-mode \.mc-nav-item\.active\{background:#F4F1E8;color:var\(--green\);/.test(src));
ok('　　窄畫面跟著縮（與膠囊裡的項目同一組斷點）',
   /body\.mc-mode \.mc-admin-btn\{padding:8px 10px;\}   \/\* 獨立那顆也跟著縮（2026-08-06）/.test(src));
ok('　　中央膠囊仍絕對置中（不會被左邊多一顆推歪）',
   /body\.mc-mode \.mc-nav\{position:absolute;left:50%;top:50%;transform:translate\(-50%,-50%\);margin:0;\}/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
