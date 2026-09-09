/* 跑步機的「台」改成「人」（2026-09-09 使用者：「預約跑步機的地方　目前是1台2台
   可以改成1人2人嗎　只要有用到的地方都改」）——
   數的是「這一堂有幾個人一起用」，不是機器編號。資料結構完全沒動。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 四個入口的選擇列');
ok('★★★ 建立預約：標籤與按鈕都改人', /<span style="font-size:12px;color:var\(--t2\);">人數<\/span>/.test(src)
   && /onclick="bkTmPick\(\$\{n\}\)">\$\{NUM\[n\]\|\|n\}人<\/button>/.test(src));
ok('★★★ 換場地（自主訓練）：1 人／2 人', /onclick="svPickUnits\(1\)">1 人<\/button>/.test(src)
   && /onclick="svPickUnits\(2\)">2 人<\/button>/.test(src)
   && /<span style="font-size:12\.5px;color:var\(--t2\);">人數<\/span>/.test(src));
ok('★★★ 會員端預約：標籤與按鈕都改人',
   /<span style="color:var\(--t2\);">人數<\/span>/.test(src)
   && /onclick="msbChooseUnits\(\$\{n\}\)">\$\{n\} 人<\/button>/.test(src));
ok('★★★ 課卡明細的一人／兩人按鈕', /onclick="bkSetVenueUnits\('\$\{b\.id\}',\$\{n\}\)">\$\{NUM\[n\]\|\|n\}人<\/button>/.test(src));

console.log('\n② ★★★ 拿按鈕文字比對選中狀態的那兩行也要跟著改');
/* 按鈕文字改了、比對字串沒改 → 選中狀態整個失效（按了沒反應的那種壞法） */
ok('★★★ 會員端選中比對吃「人」', /b\.textContent\.trim\(\)===`\$\{s\.pickUnits\} 人`/.test(src));
ok('★★★ 會員端重置比對吃「人」', /b\.textContent\.trim\(\)==='1 人'/.test(src));
ok('★★ 全檔沒有殘留「N 台」的比對字串', !/textContent\.trim\(\)[^\n]*台/.test(src));

console.log('\n③ 顯示與吐司');
ok('★★ 日程列／課卡的場地標籤（兩處同一句）',
   (src.match(/\$\{Math\.max\(1,Number\(b\._units\)\|\|1\)\}人`/g)||[]).length===2);
ok('★★ 課卡提示與場地文字', /`　·　\$\{n\} 人`/.test(src) && /const NUM=\['','一人','兩人','三人'\];/.test(src)
   && /return '跑步機・'\+\(NUM\[n\]\|\|\(n\+' 人'\)\)/.test(src));
ok('★★ 櫃檯預約成功的吐司', /\$\{_tmN\} 人，第 2 人起不扣點/.test(src));
ok('★★ 會員端預約成功的吐司', /跑步機 \$\{_got\} 人，已扣 1 點（第 2 人不扣）/.test(src));
ok('★★ 「至少要留 1 人」兩處都改', (src.match(/至少要留 1 人/g)||[]).length===2);
ok('★★ 說明頁那一行', /<li>跑步機可以選擇一次預約 1 人或 2 人<\/li>/.test(src));
ok('★★ 同行第二筆的三處文案', /同行的第 2 人還掛著/.test(src)
   && /同行的第 2 人一併取消/.test(src) && /同行的第 2 人已取消/.test(src));

console.log('\n④ 該留「台」的地方沒有被亂改');
/* 這幾句講的是**機器本身**的狀況，改成「人」會變成「另一人已被其他預約佔用」那種鬼話 */
ok('★★★ 講機器不夠／被約走的句子仍講台',
   /跑步機不夠了（另一台已被其他預約佔用）/.test(src)
   && /這一台跑步機剛被別人約走了/.test(src)
   && /沒有多的跑步機，只保留 1 人/.test(src));
ok('★★ 「已少一人（釋出一台…）」把兩件事都講到（人是結果、台是機器）',
   /已少一人（釋出一台\$\{venueName\(vid\)\}）/.test(src)
   && /已多一人（再開一台\$\{venueName\(vid\)\}・同行使用，不扣點）/.test(src));
ok('★★★ 資料結構一個字都沒動（venue_unit 仍是一台一筆、sibling_of 仍串同行）',
   /venue_unit 一筆只存得下一台/.test(src) && /sibling_of:root,/.test(src));
ok('★  「櫃台設備帳號」沒被誤傷', /櫃 台 設 備 帳 號/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
