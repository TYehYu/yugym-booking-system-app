/* 套用課表不會變成兩份（2026-10-02 使用者回報）：
   「按了套用畫面沒反應就再按一次 結果被套用相同課表兩次 同一個動作出現兩筆」

   正式庫查到三次：蘇月華 9/21（相隔 17 秒）、蘇月華 9/29（1 秒，9 個動作全重複）、
   呂宜庭 9/29（1 秒）。

   ⚠ 防連點（onceAct）只擋得住「執行中又按一次」—— 上面那幾次都是第一輪已經寫完
     才按的，擋不到。真正的修法是**同名動作跳過**：這一堂已經記過的就不寫第二次，
     連按十次也只會有一份。
   ⚠ 讓人按第二次的是「沒有反應」—— 一次寫 7 筆要一兩秒，畫面完全不動。
     所以按鈕也要立刻變成「套用中…」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};
const bare=src.replace(/\/\*[\s\S]*?\*\//g,' ');

console.log('① 兩支套用都會跳過已經記過的動作');
{
  const H=g('async function _tlDoApplyHist(srcBid){','\n}');
  const P=g('async function _tlPlanApply(pid,useLast){','\n}');
  for(const [nm,F] of [['套用上次',H],['套用方案',P]]){
    ok(`★★★ ${nm}：先撈這一堂已經有哪些動作`,
       /const _have=new Set\(\(window\._tlAllLogs\|\|\[\]\)/.test(F)
       && /\.filter\(x=>x && x\.booking_id===b\.id/.test(F));
    ok(`★★★ ${nm}：同名就跳過、不寫第二次`, /_have\.has\(_nm\)\)\{ skip\+\+; continue; \}/.test(F));
    ok(`★★ ${nm}：寫進去的也要記起來（同一批裡有重複名稱時）`, /_have\.add\(_nm\)/.test(F));
    /* 1V2 的兩份課表各自獨立：第二位記了「深蹲」，不該擋住第一位記「深蹲」 */
    ok(`★★★ ${nm}：只比同一位（slot）`,
       /const _sl=\(Number\(window\._tlSlot\)===2\)\?2:1;/.test(F)
       && /\(\(Number\(x&&x\.slot\)===2\?2:1\)===_sl\)/.test(F));
    ok(`★★ ${nm}：比對前去空白`, /\.map\(x=>String\(\(x&&x\.exercise_name\)\|\|''\)\.trim\(\)\)\.filter\(Boolean\)/.test(F));
  }
}

console.log('\n② 跳過幾個要講出來');
{
  ok('★★★ 套用上次：有略過就寫在 toast 上',
     /已套用 \$\{n\} 個動作\$\{skip\?`（\$\{skip\} 個已經記過，略過）`:''\}/.test(src));
  ok('★★★ 全部都記過時換一句話（不要說「已套用 0 個」）',
     /: `這 \$\{skip\} 個動作都已經記過了`/.test(src));
  ok('★★ 套用方案也一樣', /，\$\{skip\} 個已經記過略過/.test(src));
  ok('★★ 有略過時 toast 停久一點（4 秒）', /, skip\?4000:3000\);/.test(src));
}

console.log('\n③ 防連點與「按下去有反應」');
{
  ok('★★★ 套用上次補上 onceAct（套用方案 0925 就有了，這支漏了）',
     /async function tlDoApplyHist\(srcBid\)\{ return onceAct\('tlhist:'\+srcBid, \(\)=>_tlDoApplyHist\(srcBid\)\); \}/.test(src));
  ok('★★★ 按鈕立刻鎖住並改成「套用中…」',
     /_btn\.disabled=true; _btn\.style\.opacity='\.6'; _btn\.textContent='套用中…';/.test(src));
  /* ⚠ 要在第一個 await 之前做，不然那一兩秒還是沒有反應 */
  ok('★★★ 鎖按鈕在第一個 await 之前',
     (()=>{ const H=g('async function _tlDoApplyHist(srcBid){','\n}');
       return H.indexOf("textContent='套用中…'") < H.indexOf('await dbPut'); })());
  ok('★★ 失敗時解鎖（不要卡在「套用中…」）', /\}catch\(e\)\{ _unlock\(\); closeModal\(\);/.test(src));
}

console.log('\n④ 畫面上的說明講實話');
{
  /* 原本寫「已存在的今日紀錄不會被覆蓋」—— 只說對一半：確實沒覆蓋，但會多新增一筆。 */
  ok('★★★ 改成「已經記過的會自動略過」', /<b>這一堂已經記過的動作會自動略過<\/b>，按兩次也不會變成兩份。/.test(src));
  ok('★★★ 舊的誤導文案已經收掉', !/已存在的今日紀錄不會被覆蓋/.test(bare));
}

console.log('\n⑤ 套用本身沒被改壞');
{
  const H=g('async function _tlDoApplyHist(srcBid){','\n}');
  ok('★★★ 單位與重量仍然跟著複製（0925 修過的洞不要再開）',
     /weight:s\.weight, weight_unit:s\.weight_unit,/.test(H));
  ok('★★ seq 仍然一筆一筆往上加', /seq:\(_sq!=null\?_sq\+\+:null\),/.test(H));
  ok('★★ 仍然落在當前那一位', /slot:\(Number\(window\._tlSlot\)===2\)\?2:null,/.test(H));
  ok('★★ 舊的「(套用 MM/DD)」標記仍然剝掉', /replace\(\/\\s\*\[（\(\]套用\[\^\)）\]\*\[\)）\]\\s\*\/g,' '\)/.test(H));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
