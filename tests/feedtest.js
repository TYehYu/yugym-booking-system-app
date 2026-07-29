/* 會員自助異動 → 桌機右下角滑出通知（2026-07-29 使用者指示）
   會員在手機上自己改自主訓練／團體課，櫃檯桌機要看得到。
   來源是 notifications（recipient_type='desk'），由會員端的 security definer RPC 寫入 ——
   那是唯一能百分之百分辨「會員自己做的」而非櫃檯代操作的地方。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('啟用條件');
ok('★ 只在桌機、且是櫃檯／管理員／店長身分才跑',
   /return CLOUD && SESSION && isDeskLike\(\) && !isMobileLayout\(\);/.test(src));
ok('　　登入後啟動', /deskFeedStart\(\);\s+\/\/ 會員自助異動/.test(src));
ok('　　手機版整塊隱藏', /@media \(max-width:900px\)\{ #desk-feed\{display:none;\} \}/.test(src));

console.log('\n輪詢行為');
ok('★ 只撈 desk 收件者、且未讀',
   /\.eq\('recipient_type','desk'\)\.eq\('read',false\)/.test(src));
ok('★ 顯示後立刻標已讀（換頁／重整不重複跳）',
   /\.update\(\{read:true\}\)\.in\('id',ids\)/.test(src));
ok('　　分頁在背景時不輪詢', /if\(!deskFeedEnabled\(\) \|\| _deskFeedBusy \|\| document\.hidden\) return;/.test(src));
ok('　　回到前景補查一次', /visibilitychange[\s\S]{0,80}deskFeedPoll\(\)/.test(src));
ok('　　一次最多 6 則，不會洗版', /\.limit\(6\)/.test(src));
ok('　　重入保護（避免上一輪還沒回就再發一輪）', /_deskFeedBusy=true;/.test(src) && /_deskFeedBusy=false;/.test(src));

console.log('\n卡片');
ok('★ 固定在右下角', /#desk-feed\{position:fixed;right:18px;bottom:18px;/.test(src));
ok('★ 由右側滑入', /@keyframes dfeedIn\{from\{opacity:0;transform:translateX\(28px\);\}/.test(src));
ok('　　關閉時滑出', /\.dfeed-card\.out\{animation:dfeedOut/.test(src));
ok('　　同一則不會插兩張', /host\.querySelector\(`\[data-nid="\$\{n\.id\}"\]`\)\) return;/.test(src));
ok('　　滑鼠移上去不會自動收掉', /mouseenter[\s\S]{0,40}clearTimeout/.test(src));
ok('　　三種事件用不同顏色（預約綠／取消紅／改期金）',
   /\.dfeed-cancel\{border-left-color:var\(--danger/.test(src)
   && /\.dfeed-move\{border-left-color:var\(--gold-d/.test(src));
ok('　　尊重系統的減少動態設定', /@media \(prefers-reduced-motion:reduce\)/.test(src));
ok('　　標題與內容都做過跳脫', (src.match(/\.replace\(\/<\/g,'&lt;'\)/g)||[]).length>=2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
