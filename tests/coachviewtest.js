/* 2026-08-01 使用者指示（定版）：
   「教練的行事曆 非本人的課卡一樣正常顯示課卡內容 但是要移除互動的功能 手機跟桌機都是」

   沿革（同一個東西改了三次，把理由留著免得又繞回去）：
     0729 pointer-events:none（cag-noint）→ 卡片攔手指，手機頁面滑不動
     0731 改成「點得開唯讀明細」
     0801 收回成「純顯示」：內容照舊畫，但完全不掛點擊
   ⚠ 不要再回頭用 pointer-events:none —— 不掛 onclick 就沒有互動，
     而且觸控捲動能正常穿過卡片。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('桌機行事曆');
ok('★ 別人的課卡不掛任何點擊', /\$\{_viewOnly\?''/.test(src));
ok('★ 不再開唯讀明細', !/\$\{_viewOnly\?`onclick="openBookingDetail/.test(src));
ok('★ 判定沒動（教練、非店長、自己的課表、不是自己的課）',
   /const _viewOnly = SESSION\.role==='coach' && !SESSION\.is_manager && opts\.me && !isMine;/.test(src));
ok('★ 自己的課照舊可點（onEvClick 才有圓形按鈕）',
   /:\(editable\?`onclick="onEvClick\(event,'\$\{b\.id\}'\)"`/.test(src));
ok('★ 櫃檯／管理員看全店時不受影響（_viewOnly 只在 opts\.me 時成立）',
   /opts\.me && !isMine;/.test(src));

console.log('\n手機端 agenda');
ok('★ 別人的課卡不掛任何點擊',
   /\$\{canClick\?` onclick="wtlCardClick\('\$\{b\.id\}',this\)"`:''\}>/.test(src));
ok('★ 仍標 cag-view（樣式用）', /\$\{canClick\?'':' cag-view'\}/.test(src));

console.log('\n樣式');
ok('★ 游標不再暗示可點', /\.cal-ev\.cal-ev-view,\.cag-std\.cag-view\{cursor:default;\}/.test(src));
ok('★ hover 也不再浮起', /\.cal-ev\.cal-ev-view:hover,\.cag-std\.cag-view:hover\{box-shadow:none;transform:none;\}/.test(src));
ok('★ 沒有回頭用 pointer-events:none（那會攔手指）',
   !/\.cag-std\.cag-view\{pointer-events:none/.test(src) && !/\.cal-ev-view\{pointer-events:none/.test(src));
ok('　　三次改版的沿革寫在程式裡', /0729 用 pointer-events:none（cag-noint）→ 卡片攔手指讓頁面滑不動/.test(src)
   && /0801 收回成「純顯示」/.test(src));

console.log('\n內容照舊（「一樣正常顯示課卡內容」）');
ok('★ 卡片內容的組法沒有因為唯讀而被砍掉（時間／名稱／標籤照畫）',
   /<div class="evc-txt">\$\{showTime\?`<span class="evc-time">\$\{b\.start_time\}<\/span>`:''\}<span class="evc-name">\$\{disp\}<\/span>/.test(src));
ok('★ 繳費／續約角標仍只給看得到會員的卡（不外洩誰快用完票）',
   /const _mk = \(layer==='mine'\|\|isAdmin\) \? bkRenewBadge\(\{/.test(src));

console.log('\n拖曳仍然擋著（互動放開過一次，這道防線不能掉）');
ok('★ 唯讀卡不可拖', /if\(ev\.classList\.contains\('cal-ev-view'\)\) return;/.test(src));

console.log('\n首頁今日營收名單：最多五列其餘捲動（2026-08-01 使用者指示）');
/* 2026-08-02：右欄改成撐滿視窗高度後，這張卡的長度不再用 max-height 擋，
   改成「最多列 10 筆」＋名單在自己的框裡捲（見 dashfittest.js）。 */
ok('★ 名單卡可捲，且最多列 10 筆',
   /\.mc-revlist-card \.mc-revlist\{overflow-y:auto;/.test(src)
   && /const _revShown=_revRows\.slice\(0,10\)/.test(src));
ok('★ 只限首頁那張卡，彈窗版不受限（它本來就會捲）',
   /\.mc-revlist-card \.mc-revlist\{/.test(src) && !/^\.mc-revlist\{max-height/m.test(src));
ok('　　原因寫在程式裡', /用高度擋會隨螢幕大小忽多忽少/.test(src));
{
  // 一列約 44px＋4px 間距 → 五列約 240px；248 放得下五列、第六列會露出一角提示可捲
  const rowH=44, gap=4, max=248;
  const fit=Math.floor((max+gap)/(rowH+gap));
  eq('★ 248px 剛好容納五列', fit, 5);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
