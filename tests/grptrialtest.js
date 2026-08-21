/* 2026-08-03 使用者指示：「團體課的預約體驗，幫我新增在銷售，團課體驗600」

   做成銷售視窗裡的固定商品卡：走自訂銷售的殼、預填「團課體驗／團體課票種／
   1 堂／$600／效期 30 天」，之後一樣選業績歸屬；欄位在表單上仍看得到、要調可以調
   （例如當天談了別的價）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 銷售視窗有這張卡');
ok('★ 課程銷售區多了「團課體驗」，副標寫明 1 堂 · $600',
   /card\('var\(--course-trial-accent,#7a4d8c\)','團課體驗','1 堂 · \$600',"slGo\('grptrial'\)"\)/.test(src));
ok('★ slGo 有分流', /if\(kind==='grptrial'\) return salesGrpTrial\(\);/.test(src));
ok('★ 一樣要先選會員才進得去（slGo 開頭的守門沒被繞過）',
   /function slGo\(kind\)\{\n\s*const mid=slMember\(\);\n\s*if\(!mid\|\|mid==='__walkin__'\)\{ showToast\('請先選擇會員'\); return; \}/.test(src));

console.log('\n② 預填值');
ok('★ 固定商品：團體課票種、1 堂、$600、效期 30 天',
   /preset:\{name:'團課體驗', type:'團體課', sessions:1, price:600, valid:30\}/.test(src));
/* 2026-08-21：票種從原生 select 換成挑選視窗，預選改成算出 _ttCur 帶進欄位 */
ok('★ 票種預選團體課',
   /const _ttCur=\(_pre&&_pre\.type&&\(_ttList\.find\(o=>o\.label===_pre\.type\)\|\|\{\}\)\.v\)/.test(src)
   && /ashOptField\('gt-c-type', _ttList, _ttCur, '選擇票種'/.test(src));
ok('★ 方案名稱帶「團課體驗」（不是自訂方案）',
   /id="gt-c-name" value="\$\{\(_pre&&_pre\.name\)\|\|'自訂方案'\}"/.test(src));
ok('★ 堂數／總價／效期吃預設值',
   /id="gt-c-sessions" min="1" value="\$\{\(_pre&&_pre\.sessions\)\|\|10\}"/.test(src)
   && /id="gt-c-price" min="0" value="\$\{\(_pre&&_pre\.price!=null\)\?_pre\.price:0\}"/.test(src)
   && /id="gt-c-valid" min="1" value="\$\{\(_pre&&_pre\.valid\)\|\|365\}"/.test(src));
ok('★ 視窗標題顯示「團課體驗」', /sales\.custom\?\(\(sales\.preset&&sales\.preset\.name\)\|\|'自訂銷售'\)/.test(src));
ok('　　欄位仍可調整，寫在程式裡', /欄位在表單上仍看得到、要調可以調。/.test(src));

console.log('\n③ 不影響原本的自訂銷售');
ok('★ 一般自訂銷售沒有 preset → 預設值照舊（10 堂／$0／365 天／自訂方案）',
   /function salesCustom\(\)\{\n\s*window\._grantSales=\{cat:null, coach_id:null, custom:true\};/.test(src));
ok('★ 單價 0 的預設仍走 price!=null 判斷（0 不會被 || 吃成空）',
   /\(_pre&&_pre\.price!=null\)\?_pre\.price:0/.test(src));
ok('　　流程尾端同一條（業績歸屬 → 發票券），沒有另開路徑',
   /if\(kind==='grptrial'\) return salesGrpTrial\(\);\n\s*if\(kind==='custom'\) return salesCustom\(\);/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
