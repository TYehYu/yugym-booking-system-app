/* 2026-08-03 櫃檯回報：「櫃檯登入後資料都不見了？」

   查證：資料庫完好（會員 456／預約 4019／票券 2578）。真兇是櫃檯分頁的
   refresh token 換發失敗（auth log 連串 refresh_token_not_found，同帳號多分頁/
   多裝置互相撤銷所致），supabase-js 丟掉登入後所有查詢改以匿名送出 ——
   匿名查得到表（200）但 RLS 一列都不給，每張表回空陣列，畫面像被清空。
   app 的 SESSION 只在記憶體，對底下登入已死毫無知覺。

   防線（authExpired）：登入死掉就直接跳「登入已逾時」全版說明＋一鍵重新登入，
   不讓櫃檯對著空畫面猜資料是不是不見了。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① authExpired 的觸發條件（實跑）');
{
  const calls=[];
  const mkDoc={createElement:()=>({style:{},set innerHTML(v){},appendChild:()=>{}}),body:{appendChild:()=>calls.push('shown')}};
  const run=(win,sess)=>{ calls.length=0;
    new Function('window','SESSION','document', grabFn('authExpired')+'\nauthExpired();')(win,sess,mkDoc);
    return calls.length>0; };
  ok('★ 登入死了（有 SESSION）→ 跳出說明', run({},{role:'front_desk'})===true);
  ok('★ 還沒登入 → 不跳', run({},null)===false);
  ok('★ 自己按登出的過程 → 不跳', run({_loggingOut:true},{role:'front_desk'})===false);
  ok('★ 已經跳過 → 不重複跳', run({_authExpShown:true},{role:'front_desk'})===false);
}

console.log('\n② 三個偵測入口都接上');
ok('★ supabase-js 換發失敗的 SIGNED_OUT 事件',
   /sb\.auth\.onAuthStateChange\(\(ev\)=>\{ if\(ev==='SIGNED_OUT'\) authExpired\(\); \}\)/.test(src));
ok('★ 每 60 秒摸一次本地 session（getSession 不打網路）',
   /setInterval\(async\(\)=>\{ if\(!SESSION\|\|window\._authExpShown\) return;\n\s*try\{ const\{data\}=await sb\.auth\.getSession\(\); if\(!data\|\|!data\.session\) authExpired\(\); \}catch\(_\)\{\}\n\},60000\);/.test(src));
ok('★ 資料層撞到 JWT 失效（dbFriendlyError 的登入逾期分支）',
   /msg = '登入已逾期，請重新登入後再試';\n\s*\/\/ 讀取層撞到憑證失效[^\n]*\n\s*try\{ if\(typeof authExpired==='function'\) authExpired\(\); \}catch\(_\)\{\}/.test(src));
ok('★ doLogout 先立旗標，自己登出不會誤觸發',
   /async function doLogout\(\)\{ window\._loggingOut=true; try\{await sb\.auth\.signOut\(\);\}catch\(_\)\{\}/.test(src));

console.log('\n③ 給櫃檯看的話');
ok('★ 明講資料都在、沒有遺失', /<b>資料都在，沒有遺失<\/b>，重新登入即可。/.test(src));
ok('★ 說明常見成因（同帳號其他分頁/裝置重新登入）', /在其他分頁或裝置重新登入）。/.test(src));
ok('★ 一鍵重新登入', /onclick="location\.reload\(\)">重新登入<\/button>/.test(src));
ok('　　為什麼會看到空畫面，寫在程式裡（RLS 空陣列的機制）',
   /每張表都回空陣列，畫面看起來就是「資料全被清空」，其實資料好好的。/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
