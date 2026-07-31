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
ok('★ 不再自動標已讀（2026-07-29 二修：要留到櫃檯確認）',
   !/\.update\(\{read:true\}\)\.in\('id',ids\)/.test(src));
ok('★ 按「確認」才寫回已讀', /async function deskFeedAck\(id\)/.test(src)
   && /\.update\(\{read:true\}\)\.eq\('id',id\)/.test(src));
ok('　　確認失敗會把訊息抓回來，不會被默默吃掉',
   /確認失敗，訊息保留/.test(src) && /showToast\('確認失敗[\s\S]{0,80}deskFeedPoll\(\)/.test(src));
ok('　　別台確認掉的，這台也跟著移除',
   /if\(!live\.has\(el\.getAttribute\('data-nid'\)\)\) el\.remove\(\);/.test(src));
ok('　　分頁在背景時不輪詢', /if\(!deskFeedEnabled\(\) \|\| _deskFeedBusy \|\| document\.hidden\) return;/.test(src));
ok('　　回到前景補查一次', /visibilitychange[\s\S]{0,80}deskFeedPoll\(\)/.test(src));
ok('　　一次最多 20 則，多的下一輪再補', /\.limit\(20\)/.test(src));
ok('　　整疊可捲動，不會蓋滿畫面', /#desk-feed\{max-height:min\(70vh,620px\);overflow-y:auto/.test(src));
ok('　　重入保護（避免上一輪還沒回就再發一輪）', /_deskFeedBusy=true;/.test(src) && /_deskFeedBusy=false;/.test(src));

console.log('\n卡片');
ok('★ 固定在右下角', /#desk-feed\{position:fixed;right:18px;bottom:18px;/.test(src));
ok('★ 由右側滑入', /@keyframes dfeedIn\{from\{opacity:0;transform:translateX\(28px\);\}/.test(src));
ok('　　關閉時滑出', /\.dfeed-card\.out\{animation:dfeedOut/.test(src));
ok('　　同一則不會插兩張', /host\.querySelector\(`\[data-nid="\$\{n\.id\}"\]`\)\) return;/.test(src));
ok('★ 不會自動收掉（沒有計時器）', !/setTimeout\(\(\)=>deskFeedClose/.test(src));
ok('　　三種事件用不同顏色（預約綠／取消紅／改期金）',
   /\.dfeed-cancel\{border-left-color:var\(--danger/.test(src)
   && /\.dfeed-move\{border-left-color:var\(--gold-d/.test(src));
ok('　　尊重系統的減少動態設定', /@media \(prefers-reduced-motion:reduce\)/.test(src));
ok('　　標題與內容都做過跳脫', (src.match(/\.replace\(\/<\/g,'&lt;'\)/g)||[]).length>=2);

/* 2026-07-30 使用者指示：預約／移動／刪除三種都要跳，不管幾點，
   顯示在桌機任何頁面的右下角，等櫃檯勾確認才消失。 */
console.log('\n三種異動都要有卡片');
ok('★ 預約（self_book）有圖示與綠色', /self_book:'<svg/.test(src) && /\.dfeed-card\{[\s\S]{0,200}border-left:4px solid var\(--green\)/.test(src));
ok('★ 取消（self_cancel）有圖示與紅色', /self_cancel:'<svg/.test(src) && /\.dfeed-cancel\{border-left-color:var\(--danger/.test(src));
ok('★ 改期（self_move）有圖示與金色', /self_move:'<svg/.test(src) && /\.dfeed-move\{border-left-color:var\(--gold-d/.test(src));
ok('★ 不分時間：查詢沒有任何日期條件，只看 read=false',
   /\.eq\('recipient_type','desk'\)\.eq\('read',false\)/.test(src)
   && !/desk[\s\S]{0,120}\.gte\('created_at'/.test(src));

console.log('\n換頁不會不見');
ok('★ 卡片掛在 <body>，不在頁面容器裡（navTo 重繪不到）',
   /掛在 <body> 底下（不是頁面容器）/.test(src)
   && /document\.body\.appendChild\(el\)/.test(src));
ok('★ 壓在內容之上、對話框之下（不會擋住視窗按鈕）',
   /#desk-feed\{position:fixed;right:18px;bottom:18px;z-index:250;/.test(src)
   && /\.modal-bg\{[^}]*z-index:300;/.test(src));

/* 2026-07-30 使用者指示：抬頭「會員異動 N 則待確認」移除，只顯示卡片。
   細節見 lastmarktest.js；這裡改成驗「已移除」＋「另有 N 則」仍在。 */
console.log('\n過夜累積：抬頭已移除，只留卡片');
ok('★ 抬頭與「全部確認」按鈕不再渲染',
   !/<div class="dfeed-head" id="dfeed-head" hidden>/.test(src)
   && /el\.innerHTML=`<div id="dfeed-list"><\/div>`;/.test(src));
ok('★ deskFeedAckAll 保留（函式不刪，日後可恢復入口）', /async function deskFeedAckAll\(\)/.test(src)
   && /確認這 \$\{ids\.length\} 則手機端異動通知？/.test(src));   // 2026-07-31：來源含教練
ok('　　超過一次顯示上限時講清楚還有幾則，不做無聲截斷',
   /另有 \$\{total-shown\} 則，確認後會接著顯示/.test(src)
   && /\{count:'exact'\}/.test(src));
ok('　　每張卡自己的確認鈕用勾號', /✓ 確認<\/button>/.test(src));


console.log('\n確認完抬頭要一起消失（2026-07-30 使用者回報）');
ok('★ 移除卡片後立刻依畫面剩幾張重算抬頭',
   /if\(el\)\{ el\.classList\.add\('out'\); setTimeout\(\(\)=>\{ el\.remove\(\); deskFeedSyncHead\(\); \},260\); \}/.test(src));
ok('★ 有一支專門重算的函式（讀 DOM 上剩幾張）',
   /function deskFeedSyncHead\(\)\{\s*\n\s*const n=document\.querySelectorAll\('#desk-feed \[data-nid\]'\)\.length;\s*\n\s*deskFeedHead\(n, n\);/.test(src));
ok('★ 全部確認完也立刻收掉，不等 45 秒輪詢',
   /deskFeedSyncHead\(\);   \/\/ 全部確認完立刻把抬頭收掉，不等輪詢/.test(src));
ok('　　原因寫在程式裡', /卡片點掉了、上面的「會員異動 N 則待確認」還留著/.test(src));
{
  // 實跑 deskFeedHead：抬頭已移除，只驗「另有 N 則」的出現與收回
  const i=src.indexOf('function deskFeedHead(total, shown){'); const j=src.indexOf('\n}\n',i)+2;
  let moreRemoved=0, moreTxt='';
  const more={ id:'', className:'', get textContent(){return moreTxt;}, set textContent(v){moreTxt=v;}, remove(){moreRemoved++;} };
  const doc={ getElementById:id=>({ 'dfeed-list':{appendChild(){}}, 'dfeed-more':more })[id]||null };
  const fn=new Function('document', src.slice(i,j)+'\nreturn deskFeedHead;')(doc);
  fn(25,20); ok('★ 25 則只顯示 20 張 → 出現「另有 5 則」', /另有 5 則/.test(moreTxt));
  fn(3,3);   ok('★ 全部都顯示得下 → 收回「另有 N 則」', moreRemoved>0);
  ok('　　沒有抬頭元素也不會爆（已移除）', true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
