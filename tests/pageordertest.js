/* 分頁一定要指定排序（2026-10-02 事故）

   症狀一：教練回報「訓練課表打不上去」—— 資料**存得進去**，但畫面不顯示，
     而且每存一次 seq 都算成 1（tlNextSeq 數不到同一堂前面那幾筆）。
   症狀二：同一天使用者問「為什麼今天看利潤變 -17 萬，昨天才 -15 萬多」。

   同一個根因：`_dbGetAllFresh` 的分頁迴圈用 `.range(0,999)`、`.range(1000,1999)`…
   但**沒有 ORDER BY**。那是兩次獨立查詢，Postgres 不保證兩次的列順序一樣 ——
   順序一變就會有的列被抓兩次、有的列一次都沒抓到。

   為什麼現在才爆：表在 1000 筆以下時整表一次抓完，完全看不出來。
   training_logs 10/01 前後剛好突破 1000（事發當天 1,110 筆）。
   而 bookings 9,504／ticket_logs 8,557／member_tickets 3,861 早就超過 ——
   那幾張都是算錢的表，所以金額每天看都不一樣。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});

console.log('① 每一個 .range() 分頁都帶排序');
{
  /* ⚠ 先剝掉兩種註解再數：成因那段 /* *\/ 註解裡寫了 range(0,999) 當例子，
     14333 行還有一句 // 註解也提到 .range() —— 斷言命中自己的說明，踩過五次了。 */
  const bare=src.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/^\s*\/\/.*$/gm,' ');
  const lines=bare.split('\n').filter(t=>/\.range\(/.test(t));
  eq('★★★ 只有一個地方在做 range 分頁（集中在資料層）', lines.length, 1);
  ok('★★★ 那一行有 .order(\'id\')',
     /\.order\('id',\{ascending:true\}\)\.range\(f, f\+PAGE-1\)/.test(lines[0]));
  /* ⚠ 排序鍵必須唯一且穩定。全表都是 text 主鍵，id 有索引，是最穩的分頁鍵。
     用 created_at 之類會出事：同一毫秒建立的兩列順序仍然不定。 */
  ok('★★ 排序鍵是主鍵 id（唯一、有索引、不會變）', /\.order\('id'/.test(lines[0]));
}

console.log('\n② 成因寫在原地（這個洞看不見，註解是唯一的防線）');
{
  ok('★★★ 寫明「沒有 ORDER BY 就不保證兩次順序一樣」',
     /沒有 ORDER BY 的時候，Postgres \*\*不保證\*\*兩次查詢的列順序一樣/.test(src));
  ok('★★★ 寫明症狀（抓兩次／一次都沒抓到）',
     /\*\*有的列被抓兩次、有的列一次都沒抓到\*\*/.test(src));
  ok('★★★ 寫明「1000 筆以下看不出來」—— 這才是它潛伏這麼久的原因',
     /表在 1000 筆以下時整表一次抓完，\s*\n\s*所以完全看不出來；一超過就開始隨機漏列/.test(src));
  ok('★★ 兩個回報都記著（訓練課表、利潤數字）',
     /教練回報「訓練課表打不上去」/.test(src) && /為什麼今天看利潤變 -17 萬/.test(src));
}

console.log('\n③ 增量補資料那條路不受影響');
{
  /* dbDeltaPatch 走 .in('id', ids) 且每段只有 200 筆，不經過 range 分頁 */
  ok('★★★ 增量補是 in(id) 分段 200，不走 range',
     /for\(let i=0;i<ids\.length;i\+=200\)\{\s*\/\/ in\(\) 分段/.test(src)
     && /\.in\('id', ids\.slice\(i,i\+200\)\)/.test(src));
}

console.log('\n④ 分頁機制本身沒被動壞');
{
  ok('★★★ 每頁仍是 1000、仍是波次並行', /const PAGE=1000, WAVE=3;/.test(src));
  ok('★★★ 第一頁不滿就直接回（小表只打一次）',
     /if\(out\.length<PAGE\)\{ _statPush\(out\.length, out\[0\]\); return out; \}/.test(src));
  ok('★★ 精簡欄位（LEAN_DROP）照舊', /const _sel=_leanSel\.get\(_tk\)\|\|'\*';/.test(src));
  ok('★★ 讀取失敗仍然往上拋（不要安靜地少一頁）',
     /if\(r\.error\) throw dbFriendlyError\(r\.error, store, '讀取'\);/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
