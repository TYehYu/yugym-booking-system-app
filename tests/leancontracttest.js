/* 2026-08-09 使用者升級 Supabase Pro 之後的整理（超量的是 Egress／傳出流量）——
   合約表是「現在還小、但會線性長大」的那一種：
     24 份合約 677 kB，其中 652 kB（96%）是 body_snapshot（合約全文）、
     fill_snapshot（購買內容表）、signature（簽名圖 base64）。
   而櫃檯每點開一位會員的資料就會 dbGetAll('contracts') 整張表搬一次。

   這三欄與 bookings 那九欄不同 —— 它們**有人用**，只是只在「打開某一份合約」時用，
   而那條路徑走的是 dbGet 單筆（一律 select('*')）。所以清單讀取可以不搬。

   ⚠ 這支測試要守住的就是那個前提：
     所有「整張表讀進來」的地方都不碰這三欄；碰它們的地方都是單筆讀取。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 清單讀取不搬合約全文與簽名圖');
{
  const m=/contracts:\['([^\]]*)'\]/.exec(src);
  ok('★ LEAN_DROP 有 contracts 這一組', !!m);
  eq('★★ 三個重欄位都在', m[1].split("','"), ['body_snapshot','fill_snapshot','signature']);
  ok('★ bookings 那一組沒被動到',
     /bookings:\['is_substitute','original_coach_id','space_id','resource_id',\n\s*'checkin_source','actor_user_id','operator_employee_id','makeup_status','import_ref'\]/.test(src));
  ok('★★ 為什麼與 bookings 那組理由不同，寫在原地',
     /\*\*是有人用的\*\*，但只在「打開某一份合約」時用，而那條路徑走的是 dbGet 單筆（全欄位）。/.test(src));
  ok('★ 數字有記下來（日後回頭看知道當初多大）',
     /這三欄佔了整張表的 96%（24 份合約 677 kB，其中 652 kB 是它們），/.test(src));
}

console.log('\n② 用得到全文的地方都是單筆讀取');
{
  ok('★★ 合約檢視走 dbGet 單筆', /async function openContractView\(id\)\{\n\s*const c=await dbGet\('contracts',id\)/.test(src));
  ok('★★ 會員手機簽署走 dbGet 單筆', /async function memSignContract\(id\)\{\n\s*const c=await dbGet\('contracts',id\)/.test(src));
  ok('★ 單筆讀取一律全欄位（沒有被精簡）',
     /單筆 `dbGet` 仍是 `select\('\*'\)`/.test(fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/CLAUDE.md','utf8'))
     || /const\{data,error\}=await sb\.from\(tbl\(store\)\)\.select\('\*'\)/.test(src));
}

console.log('\n③ 整張表讀進來的地方，只用得到輕欄位');
{
  /* 逐一檢查每個 dbGetAll('contracts') 呼叫點附近有沒有碰到重欄位 */
  const HEAVY=['body_snapshot','fill_snapshot','signature'];
  const lines=src.split('\n');
  const hits=[];
  lines.forEach((l,i)=>{ if(l.indexOf("dbGetAll('contracts')")>=0) hits.push(i); });
  ok('★ 找得到整表讀取的呼叫點（目前 6 處）', hits.length>=5, hits.length);
  hits.forEach(i=>{
    /* 只看「呼叫點所在的那一支函式」——看到下一個 function 宣告就停。
       用固定行數會掃進下一支（memSignBannerCheck 後面就是 memSignContract，
       那一支是單筆讀取、本來就會用到重欄位）。 */
    let j=i+1;
    while(j<lines.length && !/^(async )?function /.test(lines[j])) j++;
    const seg=lines.slice(i,j).join('\n');
    const bad=HEAVY.filter(h=>new RegExp('\\.'+h+'\\b').test(seg));
    ok(`　　第 ${i+1} 行那一支沒有用到重欄位`, bad.length===0, bad);
  });
}

console.log('\n④ 寫入不會因為精簡而掉資料');
{
  const F=grabFn('dbPut');
  ok('★★ 物件缺了被精簡的欄位 → 先撈單筆補齊再寫',
     /const _lean=obj&&obj\.id\?LEAN_DROP\[tbl\(store\)\]:null;/.test(F)
     && /if\(_lean && _lean\.some\(c=>!\(c in obj\)\)\)\{/.test(F)
     && /try\{ const full=await dbGet\(store,obj\.id\); if\(full\) obj=Object\.assign\(\{\},full,obj\); \}catch\(_\)\{\}/.test(F));
  ok('★ 新建的合約本來就帶齊三欄（不會多撈一次）',
     /signature:\(window\._ctSignature\|\|null\),body_snapshot:window\._ctBody,/.test(src)
     && /sign_type:'remote',signature:null,body_snapshot:window\._ctBody,/.test(src));
  ok('★ 快取就地更新時也把重欄位剝掉（與清單同形）',
     /if\(drop && !del\)\{ r=Object\.assign\(\{\},row\); drop\.forEach\(c=>\{ delete r\[c\]; \}\); \}/.test(src));
}

console.log('\n⑤ 順帶：security definer 函式固定 search_path');
{
  const mig=process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260809_fn_line_uid_fix_search_path.sql';
  ok('★ migration 有進版控', fs.existsSync(mig));
  const sql=fs.readFileSync(mig,'utf8');
  ok('★ 固定 search_path', /alter function public\.fn_line_uid_fix\(text\) set search_path = public, pg_temp;/.test(sql));
  ok('　　為什麼要固定，寫在 migration 裡',
     /search_path 可變時，\n-- 呼叫端有機會把它導向自己控制的 schema 裡的同名物件，等於借用了較高的權限。/.test(sql));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
