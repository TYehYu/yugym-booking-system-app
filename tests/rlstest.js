/* RLS 寫入路徑防呆（2026-07-29）
   dbPut 是 upsert，PostgREST 會同時要求該表的 INSERT 權限。
   employees / members 的 INSERT 只開放管理員，所以「本人改自己的資料」這類
   非管理員路徑一律不能用 dbPut，必須用 sb.from(...).update()。
   實測：以教練 JWT 對自己那筆做 upsert → 42501 new row violates RLS；改 update 則通過。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,extra)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(extra?'  → '+extra:''));} };

// 以大括號配對抓出整個函式本體
function bodyOf(name){
  const i=src.indexOf('function '+name+'(');
  if(i<0) throw new Error('找不到函式 '+name);
  let d=0, started=false;
  for(let k=src.indexOf('{',i);k<src.length;k++){
    const ch=src[k];
    if(ch==='{'){ d++; started=true; }
    else if(ch==='}'){ d--; if(started&&d===0) return src.slice(i,k+1); }
  }
  throw new Error('抓不到 '+name+' 的結尾');
}

console.log('非管理員自助寫入不可走 upsert');
[
  ['submitStaffSetup','員工首次登入設定'],
  ['saveCoachProfile','教練改自己的個人資料'],
  ['submitMemberSetup','會員首次登入設定'],
].forEach(([fn,label])=>{
  let b=null;
  try{ b=bodyOf(fn); }catch(e){ ok(`${label}（${fn}）存在`, false, e.message); return; }
  ok(`${label} 不使用 dbPut（upsert 會被 INSERT 權限擋住）`, !/\bdbPut\s*\(/.test(b));
  ok(`${label} 走 .update() 並自行清快取`, /\.update\s*\(/.test(b) && /dbCacheClear\s*\(/.test(b));
});

console.log('\n寫入後必須清快取');
ok('dbPut 內建 dbCacheClear', /async function dbPut\([\s\S]{0,2000}?dbCacheClear/.test(src));   // 2026-08-04 dbPut 加了精簡欄位護欄，視窗放寬

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
