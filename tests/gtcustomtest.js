/* 自訂銷售視窗（2026-10-14 使用者：「這邊也給我優化建議　尤其是〔票種說明框〕」）——
   那格的「一般教練課」吃 .gt-unitbox b 的 14px 等寬粗體，夾在 12.5px 的句子中間，
   「簽到送一般自主訓練點數」因此斷行、「點數」單獨掉到下一行。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('票種說明框');
ok('★★★ 票種名稱自己一行（小標籤），不再夾在句子裡',
   /\.gt-unitbox\.gt-tt>b\{display:inline-block;align-self:flex-start;font-family:inherit;/.test(src)
   && /el\.className='gt-unitbox gt-tt';/.test(src));
ok('★ 說明的字級與本文一致（不會再因為字級不同而斷在奇怪的地方）',
   /\.gt-unitbox\.gt-tt>i b\{font-family:inherit;font-size:12\.5px;color:var\(--text\);\}/.test(src));
ok('★ 一般教練課的句子重寫（贈點名稱整串不拆）',
   /<b>一般教練課<\/b><i>簽到送<b>一般自主訓練點數<\/b>　·　沒有時段限制<\/i>/.test(src));
ok('★ 友善教練課的限制拆成兩行（本來擠成一長串）',
   /<b>友善教練課<\/b><i>簽到送<b>友善自主訓練點數<\/b>　·　限平日、18:00 前上完<br>這張票本身也只能約平日 18:00 前的課。<\/i>/.test(src));
ok('　　沒選票種時還是清空成原本的框', /if\(!tt\)\{ el\.innerHTML=''; el\.className='gt-unitbox'; return; \}/.test(src));
ok('★★ 沒有動到 .gt-unitbox b（堂數上限與單價回推要的就是等寬數字）',
   /\.gt-unitbox b\{color:var\(--text\);font-family:var\(--num\),inherit;font-size:14px;\}/.test(src));

console.log('\n欄位小注：紅色只留真正的警示（紅>金>綠）');
ok('★★★ 「整包金額，不是單堂」維持紅色（0826 真的打錯過）',
   /<label>總價 \*<span class="lb-warn">整包金額，不是單堂<\/span><\/label>/.test(src));
ok('★ 其餘三處改灰（只是在說明這一格是什麼）',
   /<label>票種 \*<span class="lb-note">決定可約課程與簽到贈點<\/span><\/label>/.test(src)
   && /<label>授課類型<span class="lb-note">1V2 才設得了同行會員<\/span><\/label>/.test(src)
   && /<label>堂數 \*<span class="lb-note">上限 \$\{GT_SESSIONS_MAX\} 堂<\/span><\/label>/.test(src));
ok('　　灰版用自己的 class，沒有去改 .lb-warn',
   /\.lb-note\{display:inline-block;[\s\S]{0,160}color:var\(--t3\);background:var\(--card2\);/.test(src)
   && /\.lb-warn\{[\s\S]{0,200}color:var\(--danger,#b5372e\);background:#fbeceb;/.test(src));

console.log('\n版面');
ok('★ 效期天數收成半欄（原本自己佔滿一整列）',
   /<div class="form-row"><label>效期天數 \*<span class="lb-note">365 天＝一年<\/span><\/label><input type="number" id="gt-c-valid"/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
if(fail) process.exit(1);
