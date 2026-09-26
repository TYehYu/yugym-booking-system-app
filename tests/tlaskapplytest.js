/* 2026-09-21 使用者：「感覺第二列的 1 2 + 應該可以移除　幫我新增一個功能
     每次開課表詢問是否套用上次課表　或者套用方案的時候如果該會員之前有練過該動作
     也要套用之前的紀錄」

   三件事，但只有兩件要做：
   ①「開課表時問要不要套用上次課表」—— 新功能，這支主要守它。
   ②「套用方案帶入之前的紀錄」—— **0912 就已經做好了**（tlOpenPlanPick 算 _tlLastByEx、
      tlPlanAsk 問「要沿用上次的數字嗎？」、_tlPlanApply(pid,true) 套用）。
      這支只補守一個當天發現的漏洞：那條路**沒有濾 slot**，
      1V2 切到「會員 B」去套方案，帶進來的是「會員 A」的重量。
   ③ 課表張數退場 —— 見 tests/tlprbar0911test.js 的 ③ 區。

   ⚠ 為什麼「問要不要套用上次」會取代「兩張課表」：當初要兩張紙，
     真正的需求是「這堂要記的內容跟上次很像」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 開課表時問「要不要套用上次的課表」');
{
  const R=grab('renderTrainingLogSheet');
  ok('★★★ 只在「這堂這位學員一個動作都還沒記」且「有上一次」時才問',
     /if\(!logs\.length && hist\.length && window\._tlAskedApply!==_viewKey\)\{/.test(R), 'render');
  ok('★★★ 同一次開啟只問一次（key 含 booking＋slot）—— 存完一筆重畫不能再跳',
     /window\._tlAskedApply=_viewKey;/.test(R)
     && /const _viewKey=\[b\.id,_slot\]\.join\('\|'\);/.test(R));
  ok('★★★ 關掉抽屜再開要重新問（使用者要的是「**每次**開課表詢問」）',
     /window\._tlAskedApply='';/.test(grab('openTrainingLog')));
  ok('★★★ 1V2 切到另一位學員要重新問（key 含 slot，那是另一個人的課表）',
     /\[b\.id,_slot\]/.test(R));
  ok('★★ 套的是最近那一次（hist 是依時間降冪排的，所以取 [0]）',
     /const _bid=hist\[0\]\.bid;/.test(R)
     && /\.sort\(\(a,b2\)=>String\(b2\.t\)\.localeCompare\(String\(a\.t\)\)\)\.slice\(0,3\)/.test(R));
  ok('★★★ 中途反悔就不要打擾：抽屜被關掉、或已經有別的視窗開著，就不跳',
     /if\(!document\.getElementById\('tl-sheet'\)\) return;/.test(R)
     && /if\(document\.getElementById\('modal-bg'\)\) return;/.test(R));
  ok('★★ 等抽屜畫完再疊視窗（同一個同步任務裡 showModal 會看到抽屜閃一下就被蓋住）',
     /\}, 260\);/.test(R) && /setTimeout\(\(\)=>\{/.test(R));
  /* 自動跳出來的那一次，措辭要跟「自己按套用」不一樣 —— 教練沒按任何東西，
     「取消」讀起來像出錯了。 */
  const A=grab('tlApplyHist');
  ok('★★★ 自動那次的標題直接問「要套用上次的課表嗎？」',
     /\$\{auto\?'要套用上次的課表嗎？':'套用歷史課表'\}/.test(A), 'tlApplyHist');
  ok('★★★ 取消那顆改寫「這次自己記」（沒人按過按鈕時，「取消」像是出錯）',
     /\$\{auto\?'這次自己記':'取消'\}/.test(A)
     && /\$\{auto\?'套用上次':'確認套用'\}/.test(A));
  ok('★★ 自動那次先說「為什麼你會看到這個」', /這堂課還沒有任何紀錄。上次/.test(A));
  ok('★★ 自動那次找不到來源就安靜結束（不要無端跳 toast）',
     /if\(!srcLogs\|\|!srcLogs\.length\)\{ if\(!auto\) showToast\('找不到該次課表'\); return; \}/.test(A));
  ok('★ 套用走的還是同一支（沒有另外複製一份寫入邏輯）',
     /onclick="tlDoApplyHist\('\$\{srcBid\}'\)"/.test(A));
}

console.log('\n② 套用方案帶入之前的紀錄（0912 就有；這裡補 1V2 的漏洞）');
{
  const P=grab('tlOpenPlanPick'), K=grab('tlPlanAsk'), Y=grab('_tlPlanApply');
  /* 2026-09-26 排版改成「右邊一直欄」後，那一段字從「N 個做過」變成右欄的「做過 N」 */
  ok('★★ 功能本來就在：方案卡寫出做過幾個',
     /const hit=items\.filter\(it=>it&&last\[it\.name\]\)\.length;/.test(P)
     && /做過 \$\{hit\}/.test(P));
  ok('★★ 有做過才問「要沿用上次的數字嗎？」；一個都沒做過就直接套',
     /if\(!hits\.length\) return tlPlanApply\(pid,false\);/.test(K)
     && /要沿用上次的數字嗎？/.test(K));
  ok('★★ 視窗上並排「方案 …　→　上次 …」，看得出差在哪', /方案 \$\{_nums\(it\)\}　→　上次 \$\{tlLogHtml\(l\)\}/.test(K));
  ok('★★ 沿用時三個數字都換（次數／組數／重量），單位也跟著上次那筆',
     /const L=useLast\?tlLogNums\(last\[it\.name\]\):null;/.test(Y)
     && /const unit  =L&&L\.weight!==''  \? wpUnitOf\(L\.unit\) : wpUnitOf\(it\.unit\);/.test(Y));
  /* ⚠⚠ 當天發現的漏洞：常用動作那條路（tlLoadQuickEx）0915 就濾 slot 了，
     套用方案這條路漏掉 —— 同一個坑兩條路只補了一條。 */
  ok('★★★⚠ 「上次的數字」要濾 slot：1V2 的會員 B 不能帶到會員 A 的重量',
     /const _sl = Number\(window\._tlSlot\)===2 \? 2 : 1;/.test(P)
     && /const _slOf = l => Number\(l&&l\.slot\)===2 \? 2 : 1;/.test(P)
     && /&& _slOf\(l\)===_sl\)/.test(P));
  ok('★★ 兩條路用同一套判準（常用動作那條 0915 就這樣寫）',
     /const _sl = Number\(window\._tlSlot\)===2 \? 2 : 1;/.test(grab('tlLoadQuickEx')));
  ok('★★ 漏洞的成因寫在原地',
     /tlLoadQuickEx（常用動作那條路）0915 就濾了，/.test(src));
  ok('★ 只看別堂課的紀錄（這堂自己的不算「上次」）', /l\.booking_id!==b\.id/.test(P));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
