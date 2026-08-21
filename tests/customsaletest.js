/* 自訂銷售的兩處修改（2026-08-21 使用者指示）
   ① 「這邊單價改成總價」—— 櫃檯談的是整包多少錢，單價是回推出來的。
   ② 「這邊也改成我們的新風格 課程點選跳視窗選擇」—— 票種的原生 <select> 換成挑選視窗。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('單價 → 總價');
ok('★ 欄位標籤改成總價', /<label>總價 \*<\/label><input type="number" id="gt-c-price"/.test(src)
   && !/<label>單價 \*<\/label>/.test(src));
ok('★ 填的是整包價，單價由堂數回推',
   /const totalPrice=Math\.max\(0,Number\(v\('gt-c-price'\)\.value\)\|\|0\);/.test(src)
   && /unit_price:sessions>0\?Math\.round\(totalPrice\/sessions\):0, list_price:totalPrice,/.test(src));
ok('★ 整包價另外帶著走，不靠單價乘回去（10000÷3 再乘回來只有 9999）',
   /凡是要「整包多少錢」的地方一律讀 list_price/.test(src));
ok('★ 預覽卡的定價優先吃 list_price',
   /const listPrice=\(plan\.list_price!=null\)\?\(Number\(plan\.list_price\)\|\|0\):\(\(plan\.unit_price\|\|0\)\*plan\.sessions_base\);/.test(src));
ok('★ 送出時的定價（也是總金額沒填時的預設）同一套',
   /const listPrice=\(plan\.list_price!=null\)\?\(Number\(plan\.list_price\)\|\|0\):\(unitPrice\*plan\.sessions_base\);/.test(src));
ok('　　總價底下即時標出回推的單價（櫃檯要對帳）',
   /function grantCustomUnitHint\(p\)\{/.test(src)
   && /平均單堂 \$\$\{\(Math\.round\(t\/n\)\)\.toLocaleString\(\)\}　·　\$\{n\} 堂共 \$\$\{t\.toLocaleString\(\)\}/.test(src)
   && /grantCustomUnitHint\(p\);/.test(src));

console.log('\n回推的算術（不能讓整包價被四捨五入吃掉）');
{
  const plan=(sessions,total)=>({unit_price:sessions>0?Math.round(total/sessions):0, list_price:total, sessions_base:sessions});
  const listOf=p=>(p.list_price!=null)?(Number(p.list_price)||0):((p.unit_price||0)*p.sessions_base);
  eq('★ 10 堂 $30,000 → 單堂 3000、整包 30000', [plan(10,30000).unit_price, listOf(plan(10,30000))], [3000,30000]);
  eq('★ 3 堂 $10,000 → 單堂 3333，但整包仍是 10000（乘回去會是 9999）',
     [plan(3,10000).unit_price, listOf(plan(3,10000))], [3333,10000]);
  eq('　　舊的模板方案沒有 list_price → 照舊由單價乘堂數',
     listOf({unit_price:1600, sessions_base:12}), 19200);
  eq('　　團課體驗 1 堂 $600：新舊解讀一致', [plan(1,600).unit_price, listOf(plan(1,600))], [600,600]);
}

console.log('\n票種改成挑選視窗（使用者：課程點選跳視窗選擇）');
ok('★ 不再是原生 select', !/<select id="gt-c-type"/.test(src)
   && /\$\{ashOptField\('gt-c-type', _ttList, _ttCur, '選擇票種', 'grantCustomValidate\(\)'\)\}/.test(src));
ok('★ 通用挑選欄位與課程挑選同一個殼（隱藏 input＋adp-field 按鈕）',
   /function ashOptField\(id, list, cur, ph, onchange\)\{/.test(src)
   && /<button type="button" class="adp-field" id="\$\{id\}-btn" onclick="ashOptOpen\('\$\{id\}'\)">/.test(src));
ok('★ 不能用 showModal（欄位長在別張 showModal 開出來的表單裡）',
   /function ashOptOpen\(id\)\{[\s\S]{0,400}?host\.id='adp-sheet'/.test(src)
   && !/function ashOptOpen\(id\)\{[\s\S]{0,600}?showModal\(/.test(src));
ok('　　選定後回填標籤、關窗、照舊發 change（呼叫端的 onchange 不用動）',
   /function ashOptPick\(id, v\)\{/.test(src)
   && /inp\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\);/.test(src)
   && /ashDateClose\(\);\s*\n\s*try\{ inp\.dispatchEvent/.test(src));
ok('　　目前這一項標起來（與課程挑選同一個 class）',
   /class="ash-eirow\$\{String\(o\.v\)===cur\?' ash-ei-co':''\}"/.test(src));
ok('　　每一列帶課種色塊',
   /color:\(typeof bkCcOfType==='function'&&typeof BK_ACCENT!=='undefined'\)/.test(src));
ok('★ 預設值要自己補（原生 select 會自動選第一項，換掉後不補會鎖住「下一步」）',
   /const _ttCur=\(_pre&&_pre\.type&&\(_ttList\.find\(o=>o\.label===_pre\.type\)\|\|\{\}\)\.v\)\s*\n\s*\|\| \(\(_ttList\[0\]\|\|\{\}\)\.v\|\|''\);/.test(src));
ok('　　讀值端一行都不用改（隱藏 input 也有 .value）',
   /ticket_type_id:\(v\('gt-c-type'\)\.value\|\|null\)/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
