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

console.log('\n六張課程卡收成一個欄位（2026-08-21 使用者：「六張卡也收成課程欄位 點了跳視窗選」）');
ok('★ 卡片牆退場，改成一個 adp-field 欄位',
   !/<div class="sl-cards sl-cards-3">/.test(src)
   && /<button type="button" class="adp-field" id="sl-course-btn" onclick="slCourseOpen\(\)">/.test(src));
ok('★ 清單本身沒有改：六項、順序與 0803 定版一致',
   /const SL_COURSES=\[/.test(src)
   && /\{k:'pt',       name:'教練課'/.test(src)
   && /\{k:'custom',   name:'自訂'/.test(src)
   /* 只數 SL_COURSES 那一塊 —— 薪資那邊也有一個 {k:'pt'} 的表，會誤計（實測 8） */
   && ((src.match(/const SL_COURSES=\[[\s\S]*?\n\];/)||[''])[0]
        .match(/\{k:'(pt|group|massage|facility|grptrial|custom)',/g)||[]).length===6);
ok('　　副標與課種色一起搬過來（顏色語彙不變）',
   /col:'var\(--course-pt-accent,#1f6f54\)'/.test(src)
   && /col:'var\(--course-trial-accent,#7a4d8c\)'/.test(src)
   && /<span class="adp-sw" style="background:\$\{c\.col\};"><\/span>\$\{c\.name\}/.test(src));
ok('★ 選定要先關掉這一層再走 slGo（後面每條路都是 showModal，它不會清掉 #adp-sheet）',
   /function slCoursePick\(k\)\{ ashDateClose\(\); slGo\(k\); \}/.test(src));
ok('　　「先選會員」的守門沒有被繞過（slGo 開頭那一段原封不動）',
   /function slGo\(kind\)\{\n\s*const mid=slMember\(\);\n\s*if\(!mid\|\|mid==='__walkin__'\)\{ showToast\('請先選擇會員'\); return; \}/.test(src));
ok('　　0801 場地租借→自主訓練、0803 團課體驗 $600 的說明跟著搬（不隨卡片消失）',
   /這邊方案卡場地租借改成自主訓練/.test(src)
   && /團體課的預約體驗，幫我新增在銷售，團課體驗600/.test(src));
/* 2026-08-21 二修：其他收費也收成挑選視窗了（見下一段），這條改驗購物車還在 */
ok('　　購物車仍在（結帳流程沒被動到）', /<div id="sl-cart-box"/.test(src));

console.log('\n其他收費也收成挑選視窗＋視窗收窄（2026-08-21 使用者指示）');
ok('★ 商品卡片牆退場，改成一個欄位',
   /<button type="button" class="adp-field" id="sl-merch-btn" onclick="slMerchOpen\(\)">/.test(src)
   && !/class="sl-card"/.test(src));
ok('★ 品項與價格照舊（蛋白粉 75／筋膜球 200／測量 150／搖搖杯 200／自訂）',
   /const SL_MERCH=\[/.test(src)
   && /\{name:'蛋白粉',       price:75\}/.test(src)
   && /\{name:'筋膜球',       price:200\}/.test(src)
   && /\{name:'測量身體組成', price:150\}/.test(src)
   && /\{name:'搖搖杯',       price:200\}/.test(src)
   && /\{name:'自訂', label:'其他商品', sub:'自訂品名／金額', price:null\}/.test(src));
ok('★ 一次買好幾樣是常態 → 加完不關視窗，只把數量更新上去',
   /function slMerchPick\(name, price\)\{\s*\n\s*slGoMerch\(name, price\);\s*\n\s*if\(name==='自訂'\)\{ ashDateClose\(\); return; \}\s*\n\s*slMerchOpen\(\);/.test(src));
ok('　　已加幾個標在列上（不關視窗，看得到數字才不會重複加）',
   /const n=cart\.filter\(r=>r\.name===m\.name\)\.reduce\(\(a,r\)=>a\+Math\.max\(1,Number\(r\.qty\)\|\|1\),0\);/.test(src)
   && /已加 \$\{n\}/.test(src));
ok('　　自訂品項要回購物車那一列填品名金額 → 關掉視窗',
   /自訂品項要回到購物車那一列填品名與金額，所以關掉/.test(src));
ok('★ 購物車搬到欄位正下方（收窄後排不下兩欄）',
   /<div id="sl-cart-box" style="margin-top:10px;/.test(src)
   && !/<div id="sl-cart-box" style="flex:1;min-width:230px;/.test(src));
ok('★ 視窗收窄成與建立預約同規格（拿掉 modal-wide＝回到 .modal 預設 460px）',
   (()=>{ const body=src.slice(src.indexOf('async function openSalesModal(){'),
                              src.indexOf('function slFilterMembers'));
          return !/classList\.add\('modal-wide'\)/.test(body); })()
   && /\.modal\{background:var\(--surface-3\)[^}]*max-width:460px/.test(src)
   && /拿掉 modal-wide＝回到 \.modal 預設的 460px，與建立預約同一個規格/.test(src));
ok('　　0728 那條「與簽約視窗統一 720px」為什麼不再成立，寫在原地',
   /那條「與簽約視窗統一 720px」是為了排四張卡，卡沒了就不成立/.test(src));

console.log('\n建立預約的課程欄：選完不能還是灰字（使用者：「教練課文字好像被淡化了」）');
ok('★ 回填時一併拿掉 adp-ph（那是「還沒選」的灰字樣式）',
   /if\(btn&&t\)\{ const lb=btn\.firstElementChild; lb\.textContent=t\.name\|\|t\.category\|\|'課程'; lb\.className=''; \}/.test(src));
ok('　　通用挑選欄位早就這樣做（兩支行為一致）',
   /if\(btn\)\{ const lb=btn\.firstElementChild; lb\.textContent=hit\?hit\.label:v; lb\.className=''; \}/.test(src));
ok('　　日期／時間欄沒這個問題的原因寫在旁邊',
   /日期／時間欄沒這個問題（它們的初始\s*\n\s*span 本來就不帶 adp-ph）/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
