/* 今日紀錄可以修改（2026-09-11 使用者附截圖：「套用方案沒辦法修改內容」）
   套用方案的視窗寫著「套進來之後每一項都還可以改」，但今日紀錄只有 ✕ 能刪。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const fn=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('找不到 '+name); let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){ d--; if(!d) return src.slice(i,k+1); } } };

console.log('① 入口');
/* 2026-09-23：這張動作卡抽成共用的 tlLogCardHtml(l, editable)，
   教練端傳 true（可點可刪）、會員端傳 false（唯讀）。斷言跟著搬到那支裡。 */
ok('★★★ 點今日紀錄那一列就是修改（editable 才掛 onclick）',
   /\$\{editable\?` onclick="tlEditLog\('\$\{l\.id\}'\)"`:''\}/.test(src)
   && /<div class="tlh-log\$\{editable\?'':' tlh-log-ro'\}"/.test(src));
ok('★★★ ✕ 擋住冒泡（刪之前不會先跳出修改視窗），而且只有可編輯時才畫',
   /\$\{editable\?`<button class="tl-del" onclick="event\.stopPropagation\(\);delTrainingLog\('\$\{l\.id\}'\)">✕<\/button>`:''\}/.test(src));
ok('★★★ 教練端傳 editable=true', /tlLogCardHtml\(l, true\)/.test(src));
ok('★★ 看得出點得下去：標題旁一句提示（有紀錄才畫）＋按壓回饋',
   /今日訓練紀錄\$\{logs\.length\?'<span class="tlh-hint">點一下可修改<\/span>':''\}/.test(src) && /\.tlh-log:active\{background:#e3efe9;\}/.test(src));

console.log('\n② 一組一列，姿勢與工具在上方（2026-09-16 改版）');
/* 使用者：「這邊應該要改成一列一列的　才可以單獨修改每一組的次數跟重量　然後站姿坐姿·工具
   可以設定按鈕在上方　所以就會是第一列動作　第二列姿勢按鈕　第三列工具按鈕
   再來是第一組次數x重量　下面[+]可以新增另外一組」
   ⚠ 級距鈕（.wpe-* 的 ±1／±5）隨「組數」欄位一起退場：現在每一組直接打數字。
     單位切換仍沿用 .wpe-unit 那組樣式。 */
const R=fn('tleRender');
/* 2026-09-16 二修（使用者：「姿勢跟工作改成一列兩個按鈕 點進去跳視窗選 不然太佔畫面了
   然後重量單位改到上方標題組 次數 重量kg 這邊可以少一列」）——
   姿勢 5 顆＋工具 10 顆平鋪佔掉 7 列，把逐組輸入擠出畫面；收成一列兩顆摘要鈕。
   單位切換本來自己佔一列，搬進表頭的「重量」欄。 */
ok('★★★ 版面順序：動作 → 姿勢/工具兩顆摘要鈕 → 逐組 → [+]',
   (()=>{ const i=[R.indexOf('id="tle-name"'), R.indexOf("pickBtn('posture'"), R.indexOf("pickBtn('tool'"),
          R.indexOf('class="ae-sets-head"'), R.indexOf('tleAddSet()')];
      return i.every(x=>x>0) && i.every((x,k)=>k===0||x>i[k-1]); })());
ok('★★★ 姿勢／工具收成摘要鈕，點了開挑選視窗（鈕上要顯示目前選的，沒選寫「未設定」）',
   /class="ae-opt tle-pick" onclick="tlePick\('\$\{field\}'\)"/.test(R)
   && /<i>\$\{E\[field\]\?escH\(E\[field\]\):'未設定'\}<\/i>/.test(R)
   && /function tlePick\(field\)\{/.test(src));
ok('★★★ 挑選視窗的「返回」是 tleRender（不是 closeModal —— 關掉就什麼都沒了）',
   /<button class="btn btn-ghost" onclick="tleRender\(\)">返回<\/button>/.test(src)
   && /function tlePick\(field\)\{\s*\n\s*tleReadSets\(\);/.test(src));
/* 2026-09-16 使用者附截圖：「目前選的這一個卡片可以給綠色底」——
   ⚠ 綠底的樣式全是 .lot-row.lot-row-cur 這種雙類別選擇器，按鈕要**同時**帶兩個類別；
     第一版只掛了 lot-row-cur，整組規則一條都沒生效，看起來就跟沒選一樣。
   ⚠ 抽獎那支選中後是死的（cursor:default 還加 disabled），這裡不行 ——
     再點一次目前選的那一項是「取消選擇」，加了 disabled 就永遠取消不掉。
   ⚠ 只在 tlePick 函式體內找 disabled，不掃全檔：別處的挑選視窗本來就有死列。 */
{
  const P=fn('tlePick');
  ok('★★★ 目前選的那一項＝品牌綠底（lot-row 與 lot-row-cur 要同時掛）',
     /class="ash-eirow ash-ei-2c lot-row\$\{x===cur\?' lot-row-cur':''\}"/.test(P)
     && /\.tle-picklist \.lot-row\.lot-row-cur\{cursor:pointer;\}/.test(src));
  ok('★★★ 綠底那一列仍按得動（不能加 disabled，否則取消不掉）', !/disabled/.test(P));
}
ok('★★ 單位切換在表頭的重量欄，不再自己佔一列',
   /<span class="ae-head-unit">重量<span class="wpe-unit">/.test(R)
   && !/class="ae-unit-row"/.test(R));
/* 2026-09-21：逐組列改由 tlStepFieldHTML 畫（多了 ± 兩顆），
   id 從行內樣板變成參數傳入。這一條守的本意沒變：每一組都要有自己的輸入框。 */
ok('★★★ 每一組都是輸入框（不是只有最後一組可改）',
   /id:'tle-r-'\+i/.test(R) && /id:'tle-w-'\+i/.test(R)
   && /sets\.map\(\(s,i\)=>\{/.test(R) && /<div class="ae-set-cur">/.test(R));
/* 2026-09-16 二修：平鋪的 optRow 退場（姿勢工具改成兩顆摘要鈕），
   所以不再有 ae-opt${E[field]===x…} 與 ae-grid-${cols} 這兩個動態字串。
   這一條守的本意沒變：逐組列仍用那套四欄 grid，摘要鈕仍是 .ae-opt 白底卡，不另做一套樣式。 */
ok('★★ 沿用逐組列那套四欄 grid 與 .ae-opt 白底卡（不另做一套樣式）',
   /class="ae-sets-head"/.test(R) && /class="ae-cur-fields"/.test(R)
   && /class="ae-opt tle-pick"/.test(R)
   && /class="ae-grid ae-grid-2"/.test(R));
ok('★★ 每一組可以單獨刪掉；刪到一組不剩補一組空的',
   /onclick="tleDelSet\(\$\{i\}\)"/.test(R)
   && /if\(!E\.sets\.length\) E\.sets\.push\(\{reps:'',weight:''\}\);/.test(src));
ok('★★★ 重畫前一定先把輸入框收回 state（否則剛打的數字會被洗掉）',
   /function tleReadSets\(\)\{/.test(src)
   && ['tleUnit','tleSetOpt','tleAddSet','tleDelSet'].every(f=>new RegExp('function '+f+'\\([^)]*\\)\\{\\s*\\n?\\s*tleReadSets\\(\\);').test(src)));

console.log('\n③ 存檔');
const S=fn('_tleSave');
/* 2026-09-21 使用者回報：「只有第一個項目可以修改　後面的項目修改儲存都沒有變」——
   根因不是「第幾個項目」，是 _tleSave **沒有先呼叫 tleReadSets()**：
   逐組的次數／重量輸入框沒有 oninput，打完直接按儲存，寫回去的是開視窗時展開的舊值。
   動作名稱與備註有 oninput，所以那兩欄一直改得動 —— 才會像是「有的行、有的不行」。
   ⚠ 上面 ② 那條只守了「會重畫視窗的動作」有收值，獨獨漏掉儲存；這條補的就是那個缺口。
   ⚠ 順序也要守：收值必須在 await dbGet 之前 —— await 之後視窗可能已關，輸入框就沒了。 */
ok('★★★ 存檔前先把輸入框收回 state（漏掉＝逐組數字改了存不進去）',
   /\btleReadSets\(\);/.test(S));
ok('★★★ 收值要在第一個 await 之前（await 之後視窗可能已經關掉，讀不到輸入框）',
   S.indexOf('tleReadSets();')>=0
   && S.indexOf('tleReadSets();') < S.indexOf('await dbGet('), 
   {read:S.indexOf('tleReadSets();'), get:S.indexOf('await dbGet(')});
ok('★★ 使用者的原話與成因寫在原地（下次有人想精簡這行時看得到）',
   /只有第一個項目可以修改/.test(src) && /逐組的次數／重量輸入框\*\*沒有 oninput\*\*/.test(src));
ok('★★★ 一律寫 sets_detail（不再有「數字沒動就不碰」那條分支）',
   /sets_detail:JSON\.stringify\(valid\.map\(s=>\(\{reps:String/.test(S)
   && !/sets_detail:null/.test(S));
ok('★★★⚠ 彙總欄位要跟著同步 —— 三大項 PR 是從 l.weight 推導的，只寫逐組明細會讓 PR 停在舊數字',
   /weight:ws\.length\?Math\.max\.apply\(null,ws\):null,/.test(S)
   && /sets:valid\.length,/.test(S)
   && /reps:\(rf!=null&&isFinite\(rf\)\)\?rf:null,/.test(S));
ok('★★ 徒手（沒有任何重量）存 null，連單位也不留', /weight_unit:ws\.length\?_su:null,/.test(S));
ok('★★ 姿勢與工具也要存回去（原本視窗裡根本沒得改）',
   /posture:E\.posture\|\|null, tool:E\.tool\|\|null,/.test(S));
ok('★★ 一組都沒填就擋下', /if\(!valid\.length\)\{ showToast\('請至少記錄一組的次數或重量'\); return; \}/.test(S));
ok('★★ 名稱必填', /if\(!name\)\{ showToast\('請填動作名稱'\); return; \}/.test(S));
ok('★★ 防連點', /async function tleSave\(\)\{ return onceAct\('tlesave', _tleSave\); \}/.test(src));

/* 2026-09-21 使用者：「每次更新一個項目　儲存後畫面又會回到最上面　又要重新往下拉　有點麻煩」
   ⚠ 這不是存檔的 bug，是 renderTrainingLogSheet 整塊 innerHTML 重建：.tl-scroll 換了新節點。
   ⚠ 守「用 viewKey 判斷」而不是守「某幾個呼叫端有還原」—— render 有十個入口，
     靠旗標的寫法遲早漏一個，而且新增入口的人不會知道要加。 */
console.log('\n④ 存檔後停在原處（2026-09-21）');
{
  const R2=src.slice(src.indexOf('async function renderTrainingLogSheet()'),
                     src.indexOf('// ── P1-2 一鍵套用歷史課表'));
  ok('★★★ 重畫前先記下 .tl-scroll 的捲動位置',
     /const _keepTop=\(window\._tlViewKey===_viewKey\)\s*\n?\s*\? \(\(\(host\.querySelector\('\.tl-scroll'\)\|\|\{\}\)\.scrollTop\)\|\|0\) : 0;/.test(R2));
  ok('★★★ 重畫後還原（這一行沒了就會回到最上面）',
     /if\(_keepTop>0\)\{ const _sc=host\.querySelector\('\.tl-scroll'\); if\(_sc\) _sc\.scrollTop=_keepTop; \}/.test(R2));
  /* 2026-09-21：課表張數（sheet）退場，viewKey 只剩 booking+slot */
  ok('★★★ 判準是「同一堂課＋同一位學員」，不是旗標',
     /const _viewKey=\[b\.id,_slot\]\.join\('\|'\);/.test(R2));
  ok('★★ 切學員要回到頂端（換內容本來就該從頭看）',
     /切到別位是換內容，本來就該從頭看/.test(src)
     /* tlSetSlot 改的是 window._tlSlot，viewKey 就跟著變 → _keepTop=0 */
     && /function tlSetSlot\(s\)\{\s*\n\s*window\._tlSlot=/.test(src));
  ok('★★★ 記錄點要在 innerHTML **之前**、還原要在**之後**（順序反了就永遠是 0）',
     R2.indexOf('const _keepTop=') < R2.indexOf('host.innerHTML=')
     && R2.indexOf('host.innerHTML=') < R2.indexOf('_sc.scrollTop=_keepTop'));
  ok('★★ 還原不可以丟進 setTimeout（會先畫出捲到頂那一格，看起來閃一下）',
     !/setTimeout\([^)]*scrollTop=_keepTop/.test(R2)
     && /丟進 setTimeout\(\.\.\.,0\) 的話瀏覽器會先把「捲到頂」那一格/.test(src));
  ok('★ 使用者的原話寫在原地', /儲存後畫面又會回到最上面/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
