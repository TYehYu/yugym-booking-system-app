/* 壞快取會自己修好（2026-10-02 事故的第二層）

   10/02 修掉「分頁沒有 ORDER BY 會漏列」之後（見 pageordertest），
   教練更新到新版**仍然**看不到自己的訓練紀錄。

   原因是本機還存著漏列時期的快取，而那份快取記著的是「當時從資料庫拿到的**正確**簽章」
   —— 簽章與資料是分開查的，資料漏了、簽章卻是對的。於是兩條路都回不去：
     ・簽章相符 → 直接沿用那份漏列的快取，永遠不重抓
     ・簽章不符 → 走增量補，但 change_log 只記「最近變動的那幾列」，
       當初漏掉的舊列沒有變動紀錄，補一百次也補不回來，
       而補完卻把新簽章蓋上去 —— 那份短的快取就一直被當成最新的

   修法：簽章本來就帶著筆數（「筆數:整列雜湊和」，見 fn_table_sigs），
   拿它跟快取的長度比一下。對不上就當成這份快取不可信、整表重抓。
   這一道很便宜，而且能自動修好所有人手上的壞快取 —— 不必請每個人清瀏覽器。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 從簽章讀出筆數');
{
  const F=new Function('return '+g('function sigRows(sig){','\n}'))();
  /* fn_table_sigs 回的格式：count(*)||':'||sum(hashtext(整列)) */
  eq('★★★ 1110 筆的簽章', F('1110:-8812345678'), 1110);
  eq('★★ 雜湊和是 0 也讀得到筆數', F('0:0'), 0);
  eq('★★ 正的雜湊和', F('9504:123456789'), 9504);
  eq('★★ 格式不對就回 null（不做判斷，維持原本行為）',
     [F(''), F(null), F('abc'), F(':123'), F(undefined)], [null,null,null,null,null]);
}

console.log('\n② 快取可不可信');
{
  const F=new Function('sigRows','return '+g('function cacheRowsOk(sig, data){','\n}'))
    (s=>{const m=/^(\d+):/.exec(String(s||'')); return m?Number(m[1]):null;});
  const rows=n=>Array.from({length:n},(_,i)=>({id:'x'+i}));
  eq('★★★ 筆數一樣 → 可信', F('1110:-99', rows(1110)), true);
  /* 這就是教練那台的狀況：快取 1,043 筆、資料庫 1,110 筆 */
  eq('★★★ 快取比資料庫少 → 不可信', F('1110:-99', rows(1043)), false);
  eq('★★ 快取比資料庫多（重複抓到）→ 也不可信', F('1110:-99', rows(1180)), false);
  eq('★★★ 讀不到筆數就不判斷（維持原本行為，不要因為格式變了就整天重抓）',
     [F('', rows(5)), F(null, rows(5)), F('abc', rows(5))], [true,true,true]);
  eq('★★ 空表也要對得上', [F('0:0', []), F('0:0', rows(1))], [true,false]);
  eq('★★ data 不是陣列就不可信', F('3:1', null), false);
}

console.log('\n③ 兩條路都接上了');
{
  const D=g('async function dbGetAll(store,opts){','\n}');
  /* 路一：簽章相符 —— 不驗的話會一直沿用那份短的 */
  ok('★★★ 簽章相符也要驗筆數，不符就清掉重抓',
     /if\(sigs && sigs\[key\] && sigs\[key\]===hit\.sig && !cacheRowsOk\(sigs\[key\], hit\.data\)\)\{/.test(D)
     && /dbWhy\(key,'簽章相符但筆數不符→整表重抓',/.test(D)
     && /dbCacheClear\(store\);/.test(D));
  /* 路二：增量補 —— 壞快取每次都走這條，這才是真正救回來的那一道 */
  ok('★★★ 增量補完也要驗筆數，不符就不採用',
     /if\(patched && !cacheRowsOk\(sigs\[key\], patched\.data\)\)\{/.test(D)
     && /dbWhy\(key,'增量補完筆數仍不符→整表重抓',/.test(D));
  ok('★★★ 不符時走的是 else if，會落到下面的整表重抓（不是直接回傳壞資料）',
     /\}\n\s*else if\(patched && _dbCache\.get\(key\)===hit\)\{/.test(D));
  ok('★★ 筆數相符時行為完全不變（簽章相符仍然直接沿用、不重抓）',
     /dbWhy\(key,'簽章相符'\);/.test(D)
     && /return hit\.data\.slice\(\); \}/.test(D));
}

console.log('\n④ 成因寫在原地');
{
  ok('★★★ 寫明「簽章與資料是分開查的」這個關鍵',
     /簽章與資料是分開查的，\s*\n\s*資料漏了、簽章卻是對的/.test(src));
  ok('★★★ 寫明增量補為什麼補不回來',
     /change_log 只記「最近變動的那幾列」，\s*\n\s*當初漏掉的舊列沒有變動紀錄/.test(src));
  ok('★★ 寫明這一道能自動修好別人手上的壞快取',
     /能自動修好所有人手上的壞快取/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
