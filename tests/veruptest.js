/* 2026-08-01 使用者指示（兩件）：
   ①「移除右下角手機打卡的提示」—— 教練每天上下班各打一次卡，櫃檯右下角被例行打卡洗版，
      真正要看的課卡異動被推走。補卡申請要留（那是待辦，不是紀錄）。
   ②「左下角新增版本更新的提醒」—— push 就是上線，但開著的分頁不會自己換版。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 右下角不再跳「手機打卡」');
ok('★ MCHG_LABEL 已拿掉 attendance', !/attendance:'出勤打卡'/.test(src));
ok('★ 補卡申請留著（那是要核准的待辦）', /punch_requests:'補卡申請'/.test(src));
ok('　　預約與會員資料的通知沒被動到',
   /const MCHG_LABEL=\{ bookings:'預約', punch_requests:'補卡申請',\s*\n\s*members:'會員資料' \};/.test(src));
ok('　　mchgNotify 仍以 MCHG_LABEL 當白名單（拿掉就等於不通知）',
   /if\(!MCHG_LABEL\[store\]\) return;/.test(src));
{
  // 實跑：把白名單抽出來，確認打卡真的不再通知
  const m=src.match(/const MCHG_LABEL=\{[\s\S]*?\};/);
  const MCHG_LABEL=eval('('+m[0].slice(m[0].indexOf('=')+1).replace(/;\s*$/,'')+')');
  const notify=store=>!!MCHG_LABEL[store];
  eq('★ attendance（打卡）→ 不通知', notify('attendance'), false);
  eq('★ punch_requests（補卡申請）→ 通知', notify('punch_requests'), true);
  eq('　　bookings（預約異動）→ 通知', notify('bookings'), true);
  eq('　　members（會員資料）→ 通知', notify('members'), true);
  eq('　　member_tickets 本來就不通知（一次簽到會連寫三張表）', notify('member_tickets'), false);
}

console.log('\n② 左下角版本更新提醒');
ok('★ 有 verUpStart 並在 enterApp 啟動',
   /function verUpStart\(\)\{/.test(src) && /verUpStart\(\);\s+\/\/ 有新版上線/.test(src));
ok('★ 用 HEAD 比指紋，不是每輪抓 2.4MB',
   /fetch\(_verUpProbe\(\),\{method:'HEAD',cache:'no-store'\}\)/.test(src));
ok('　　指紋依序取 etag → last-modified → content-length',
   /r\.headers\.get\('etag'\)\|\|r\.headers\.get\('last-modified'\)\|\|r\.headers\.get\('content-length'\)/.test(src));
ok('★ 第一輪只記基準值，不會一進來就跳', /else if\(!_verUpTag\)\{ _verUpTag=tag; \}/.test(src));
ok('★ 指紋變了才 GET 全文讀新版本號', /const m=txt\.match\(\/const APP_VERSION = '\(\[\^'\]\+\)'\/\);/.test(src));
ok('★ 版本號要真的不一樣才提醒（同版重傳不跳）', /if\(nv && nv!==APP_VERSION && nv!==_verUpSkip\)/.test(src));
ok('★ 會員端不提醒（LINE 進來本來就是新的）',
   /function verUpEnabled\(\)\{ return !!\(SESSION && SESSION\.role!=='member'\); \}/.test(src));
ok('　　分頁在背景不輪詢，回到前景補查一次',
   /if\(!verUpEnabled\(\) \|\| _verUpBusy \|\| document\.hidden\) return;/.test(src)
   && /document\.addEventListener\('visibilitychange',\(\)=>\{ if\(!document\.hidden\) verUpCheck\(\); \}\);/.test(src));
ok('　　5 分鐘一輪', /const VERUP_MS=300000;/.test(src));
ok('★ 更新用帶版本號的網址（純 reload 可能吃到 HTML 快取）',
   /location\.replace\(location\.pathname\+\(nv\?'\?v='\+encodeURIComponent\(nv\):''\)\+\(location\.hash\|\|''\)\);/.test(src));
ok('★ 進站後把 ?v= 清掉，網址不積參數（但保留 hash）',
   /if\(sp\.get\('v'\)\) history\.replaceState\(null,'',location\.pathname\+\(location\.hash\|\|''\)\);/.test(src));
ok('　　?v= 的清除排在 _deepGo 之前，不會吃掉 ?go= 深連結',
   src.indexOf("if(sp.get('v')) history.replaceState") < src.indexOf('window._deepGo=(function(){'));
ok('　　「稍後」只跳過這一版，之後有更新版還是會跳',
   /_verUpSkip=el\.dataset\.ver\|\|null;/.test(src));

console.log('\nCSS：位置與讓位');
ok('★ 固定在左下角', /\.ver-up\{position:fixed;left:24px;right:auto;bottom:24px;/.test(src));
ok('★ 桌機管理員有側欄 → 左邊要讓開（與抽獎鈕同一套位移）',
   /body\.mc-mode \.ver-up\{left:calc\(232px \+ 20px\);\}/.test(src)
   && /body\.mc-mode \.ver-up\{left:calc\(64px \+ 16px\);\}/.test(src));
/* 2026-08-03：抽獎／審核鈕移到左上角（左欄改靠底後，月曆貼齊視窗底，
   左下角那兩顆疊在月曆上）—— 與左下角的更新提醒不再同角落，讓位規則移除。 */
ok('★ 抽獎／審核鈕已移到左上角，不再與更新提醒搶位置',
   /\.mc-lotto-fab\{position:fixed;left:24px;right:auto;top:78px;bottom:auto;/.test(src)
   && /\.mc-req-fab\{position:fixed;left:24px;right:auto;top:78px;bottom:auto;/.test(src)
   && !/body\.verup-on \.mc-req-fab/.test(src));
ok('　　顯示/關閉時有加/拿掉 verup-on',
   /document\.body\.classList\.add\('verup-on'\);/.test(src)
   && /document\.body\.classList\.remove\('verup-on'\);/.test(src));
ok('　　右下角的 desk-feed 沒被動到（兩邊各據一角）',
   /#desk-feed\{position:fixed;right:18px;bottom:18px;/.test(src));
{
  // 疊放：兩顆鈕同時在左上角時，抽獎鈕往下疊一層，不可互相蓋住
  const reqTop=Number((src.match(/\.mc-req-fab\{[^}]*top:(\d+)px/)||[])[1]);
  const lotUp=Number((src.match(/\.mc-lotto-fab\.mc-fab-up\{top:(\d+)px/)||[])[1]);
  ok('★ 審核鈕在上、抽獎鈕往下疊（78 → 136，差一顆鈕的高度）',
     reqTop===78 && lotUp>reqTop+40, {reqTop,lotUp});
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
