/* 整份 index.html 的 JS 真的解析得過嗎（2026-08-28 白畫面事故）

   事故：把註解寫成 `${cond ? A ${/* … *\/''} : B}` —— 範本字串裡的 ${} 是一個完整
   運算式，中間插不進東西。整份 script 語法錯誤，全站只剩頂欄，白畫面。

   ⚠ 真正的問題不是打錯字，是**我原本的檢查是假的**：
       (src.match(/<script>[\s\S]*?<\/script>/g)||[]).forEach(b=>new Function(b))
     這份檔案的字串裡本身就含有 <script> 與 </script>（合約列印、LINE 內嵌等），
     非貪婪比對的切點全落在字串中間，等於拿一段被切壞的程式碼去 new Function，
     它當然「過」了 —— 而且過得毫無意義。

   這一支的作法：只認**行首**的 <script …> 與 </script>（真正的標籤都獨佔一行，
   寫在字串裡的那些前面一定有縮排或別的字元），配對成區塊再逐塊解析。
   並且加三道「檢查本身沒有失效」的護欄：區塊數、總長度、關鍵符號要在裡面。
   ——沒有這三道，這支測試哪天又變成「檢查空字串」都不會有人發現。 */
const fs=require('fs');
const path=process.env.HOME+'/Projects/yugym-booking-system-app/index.html';
const src=fs.readFileSync(path,'utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+x:''));} };

/* 行首、獨佔一行的 script 標籤 */
const starts=[...src.matchAll(/^<script(?:\s[^>]*)?>[ \t]*$/gm)].map(m=>m.index+m[0].length);
const ends=[...src.matchAll(/^<\/script>[ \t]*$/gm)].map(m=>m.index);
const blocks=[];
starts.forEach(a=>{ const b=ends.find(e=>e>a); if(b!=null) blocks.push({a,b,code:src.slice(a,b)}); });

console.log('① 檢查本身沒有失效（這三道就是 0828 事故的教訓）');
ok('★★ 抓得到內嵌 script 區塊（至少 2 塊）', blocks.length>=2, blocks.length);
const totalLen=blocks.reduce((n,b)=>n+b.code.length,0);
ok('★★ 抓到的量對得上（整份 JS 超過 1MB，不是切到一小段）', totalLen>1000000, totalLen);
ok('★★ 關鍵符號真的在抓到的範圍裡（切點沒有歪掉）',
   blocks.some(b=>b.code.includes('async function openGrantApprove(id){'))
   && blocks.some(b=>b.code.includes('function navTo(key, gkey){'))
   && blocks.some(b=>b.code.includes('const APP_VERSION = ')));
ok('★★ 舊的假檢查法會切壞 —— 留一條反例釘住，避免有人改回去',
   (src.match(/<script>[\s\S]*?<\/script>/g)||[]).length !== blocks.length);

console.log('\n② 每一塊都要解析得過');
blocks.forEach((b,i)=>{
  const line=src.slice(0,b.a).split('\n').length;
  let err=null;
  try{ new Function(b.code); }catch(e){ err=e.message; }
  ok(`★★ 區塊 ${i+1}（第 ${line} 行起，${b.code.length.toLocaleString()} 字）解析通過`, !err, err);
});

console.log('\n③ 這支測試抓得到 0828 那種錯（不是只會說 OK）');
{
  const bad='const x=`${1 ? `a` ${/*c*/\'\'} : `b`}`;';
  let caught=false;
  try{ new Function(bad); }catch(_){ caught=true; }
  ok('★★ `cond ? A ${…} : B` 這種寫法確實會被 new Function 抓到', caught);
  const good='const x=`${/*c*/\'\'}${1 ? `a` : `b`}`;';
  let fine=true;
  try{ new Function(good); }catch(_){ fine=false; }
  ok('　 註解放到三元運算子外面就沒事（正確寫法長這樣）', fine);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
