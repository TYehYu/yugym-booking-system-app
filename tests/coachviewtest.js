/* 2026-08-22 使用者定版：
   「教練不論桌機端還是手機端應該只能修改自己的課卡 其他課卡只能點開來看
     但不能進一步互動 除非是店長以上」

   沿革（同一個東西改了四次，把理由留著免得又繞回去）：
     0729 pointer-events:none（cag-noint）→ 卡片攔手指，手機頁面滑不動
     0731 改成「點得開唯讀明細」
     0801 收回成「純顯示」：完全不掛點擊 —— 當時別人的課是匿名佔位
          （opts.me ＋ maskOthers），點開也沒東西可看，拿掉才合理
     0821 「所有教練都可以看到簡易課卡」→ 別人的課開始顯示真實內容
     0822 回到「點得開唯讀明細」：前提變了（有內容可看），不是繞圈
   ⚠ 不要再回頭用 pointer-events:none —— 那會攔住觸控捲動。
   ⚠ 0822 同時修掉一個洞：_viewOnly 原本要 opts.me 才成立，而 0821 把教練桌機
     行事曆的 opts.me 拿掉了，於是別人的課卡不再是唯讀 —— 拖得動、也吃得到圓鈕。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('桌機行事曆');
ok('★ 別人的課卡點得開，但只到唯讀明細（不接 onEvClick 那組圓鈕）',
   /_viewOnly \? `onclick="event\.stopPropagation\(\);openBookingDetail\('\$\{b\.id\}'\)"/.test(src));
ok('★★ 判定直接問「這堂是不是我帶的」，不再依賴 opts.me',
   /const _viewOnly = SESSION\.role==='coach' && !SESSION\.is_manager\s*\n\s*&& !\(typeof bkIsCoach==='function' \? bkIsCoach\(b, SESSION\.id\) : isMine\);/.test(src));
ok('★ 自己的課照舊可點（onEvClick 才有圓形按鈕）',
   /: `onclick="onEvClick\(event,'\$\{b\.id\}'\)"`\)\}/.test(src));
ok('★ 櫃檯／管理員／店長不受影響（判定只在 role==coach 且非店長時成立）',
   /SESSION\.role==='coach' && !SESSION\.is_manager/.test(src));
ok('★★ 唯讀卡拖不動（不然拖得動別人的課改期）',
   /if\(ev\.classList\.contains\('cal-ev-view'\)\) return;/.test(src));

console.log('\n手機端 agenda');
ok('★ 別人的課卡不掛任何點擊',
   /\$\{canClick\?` onclick="wtlCardClick\('\$\{b\.id\}',this\)"`:''\}>/.test(src));
ok('★ 仍標 cag-view（樣式用）', /\$\{canClick\?'':' cag-view'\}/.test(src));

console.log('\n樣式');
ok('★ 游標不再暗示可點', /\.cal-ev\.cal-ev-view,\.cag-std\.cag-view\{cursor:default;\}/.test(src));
ok('★ hover 也不再浮起', /\.cal-ev\.cal-ev-view:hover,\.cag-std\.cag-view:hover\{box-shadow:none;transform:none;\}/.test(src));
ok('★ 沒有回頭用 pointer-events:none（那會攔手指）',
   !/\.cag-std\.cag-view\{pointer-events:none/.test(src) && !/\.cal-ev-view\{pointer-events:none/.test(src));
ok('　　來回的沿革寫在程式裡', /0801 收回成「純顯示、完全不掛點擊」/.test(src)
   && /前提變了（有內容可看）才改回來的，不是繞圈/.test(src));

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
/* 2026-08-12 使用者指示「今天營收延伸到視窗底」：10 筆上限退場，名單全列、卡內捲。 */
ok('★ 名單卡可捲，全列不設筆數上限（2026-08-12）',
   /\.mc-revlist-card \.mc-revlist\{overflow-y:auto;/.test(src)
   && /const _revShown=_revRows, _revMore=0;/.test(src));
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
