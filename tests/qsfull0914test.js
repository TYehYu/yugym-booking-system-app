/* 快速預約視窗全螢幕之後的三件事（2026-09-14 使用者附截圖）：
   「時段格子可以再放大點　關閉跟確認可以凍結在視窗底　字體可以再大點」
   ⚠ 全部只吃帶 .qs-mtop 標記的那一支，其他彈窗與桌機不受影響。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const Q='\\.modal-bg:not\\(\\.modal-side\\):has\\(\\.qs-mtop\\)';
const has=p=>new RegExp(p).test(src);

console.log('① 關閉／確認凍結在視窗底');
ok('★★★ 時段區吃掉剩餘高度並自己捲（footer 才會被推到底）',
   has(Q+' \\.cag-slots\\{\\s*\\n?\\s*max-height:none;flex:1 1 auto;min-height:0;overflow-y:auto;\\}'));
ok('★★★ min-height:0 不能省（預設 min-height:auto 會把 footer 推出畫面）',
   /min-height:0 不能省：flex 子項預設 min-height:auto/.test(src));
ok('★★ 標題與日期列不參與伸縮（flex:0 0 auto）', has(Q+' \\.qs-head\\{flex:0 0 auto;\\}'));
ok('★★ footer 補上底色，捲動時時段不會透在按鈕後面',
   has(Q+' \\.modal-foot\\{\\s*\\n?\\s*background:var\\(--card2\\);'));
ok('★★ 成因寫在原地（原本 .cag-slots 自己有 max-height:52vh，footer 才浮在中間）',
   /真正在捲的是 \.cag-slots/.test(src) && /footer 跟在內容流末端浮在中間/.test(src));

console.log('\n② 時段格放大、字放大');
ok('★★★ 格子內距與字級都用 clamp+cqw（不寫死、不加斷點）',
   has(Q+' \\.cag-slots \\.cag-slot\\{\\s*\\n?\\s*padding:clamp\\(16px,4\\.6cqw,24px\\) 6px;font-size:clamp\\(17px,4\\.6cqw,22px\\);'));
ok('★★★ 容器要先宣告 container-type，cqw 才有意義',
   has(Q+' \\.cag-slots\\{container-type:inline-size;\\}'));
ok('★★ 場地標籤（團課教室／跑步機）跟著放大', has(Q+' \\.cag-slot-tag\\{font-size:clamp\\(12px,3\\.2cqw,15px\\);'));
ok('★★ 標題、當日摘要、按鈕都升一階',
   has(Q+' \\.modal-title\\{font-size:21px;font-weight:900;\\}')
   && has(Q+' \\.qs-head-t\\{font-size:15px;\\}')
   && has(Q+' \\.modal-foot \\.btn\\{min-height:54px;font-size:17px;'));

console.log('\n③ 範圍控制');
ok('★★★ 全部掛在 .qs-mtop 底下，沒有動到全域 .modal／.cag-slot',
   !/^\.modal \.cag-slots \.cag-slot\{[^}]*font-size:clamp/m.test(src)
   && /^\.cag-slot\{border:none;border-radius:12px;padding:9px 0;font-size:13\.5px;/m.test(src));
ok('★★ 只在手機全螢幕那段裡（桌機維持置中視窗）',
   /@media\(max-width:600px\),\(orientation:portrait\) and \(max-width:1024px\)\{[\s\S]{0,3000}?\.cag-slots \.cag-slot\{/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
