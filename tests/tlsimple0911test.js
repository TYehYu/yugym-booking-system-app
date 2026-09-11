/* 課表（訓練紀錄抽屜）2026-09-11 使用者四件事（附截圖）
   ①「上面還是填滿的」—— 手機的抽屜從最上面蓋下去，頂欄被遮住
   ②「新增動作要讓教練自己輸入名稱　不要在用設定好的模板」
   ③「這個頁面可以簡化　留下必要的資訊跟按鈕」
   ④「套用方案這個頁面看起來太平面　沒有可以互動的感覺」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const fn=name=>{ const i=src.indexOf('function '+name+'('); let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){ d--; if(!d) return src.slice(i,k+1); } } };

console.log('① 手機讓出頂欄');
{
  const T=new Function('document', fn('tlSheetTop')+'return tlSheetTop;');
  const mk=(mc,rect)=>({ body:{classList:{contains:c=>c==='mc-mode'&&mc}}, querySelector:()=>rect?{getBoundingClientRect:()=>rect}:null });
  const run=(mc,rect)=>{ const h={style:{top:'x'}}; T(mk(mc,rect))(h); return h.style.top; };
  eq('★★★ 手機、頂欄在最上面（高 64）→ 抽屜從 64px 開始', run(false,{top:0,bottom:64,height:64}), '64px');
  eq('★★ 頂欄被捲走（看不見）→ 不讓，照舊整片蓋滿', run(false,{top:-64,bottom:0,height:64}), '');
  eq('★★ 桌機（mc-mode）→ 清掉 inline，交給 0909 那條 CSS', run(true,{top:0,bottom:64,height:64}), '');
  eq('　　找不到頂欄 → 不讓', run(false,null), '');
}
ok('★★★ 課表抽屜與新增動作兩張都呼叫',
   /host\.id='tl-sheet'; document\.body\.appendChild\(host\); \}\s*\n\s*tlSheetTop\(host\);/.test(src)
   && /host\.id='tl-add-sheet'; document\.body\.appendChild\(host\); \}\s*\n\s*tlSheetTop\(host\);/.test(src));
ok('★★ 桌機那條 CSS 還在（tlprtest 也在守）', /body\.mc-mode #tl-sheet,body\.mc-mode #tl-add-sheet\{top:60px;\}/.test(src));

console.log('\n② 新增動作：教練自己打名稱');
const R=fn('renderAddExerciseSheet');
ok('★★★ 第一頁就是名稱輸入框（自動聚焦、Enter 直接開始記錄、IME 組字中的 Enter 放行）',
   /<input id="ae-name"/.test(R) && /i\.focus\(\)/.test(R) && /event\.key==='Enter'&&!event\.isComposing/.test(R));
ok('★★★ 七個訓練方向與「快速套用」的預設動作全部退場',
   /* 看畫面標記，不看字 —— 說明註解裡本來就會提到「快速套用」這些舊名稱 */
   !/const TL_DIRECTIONS=/.test(src) && !/class="ae-dir"/.test(src) && !/<div class="ms-title">選擇訓練方向<\/div>/.test(src)
   && !/<div class="ae-label">快速套用<\/div>/.test(src)
   && !/function tlPickDir\(/.test(src) && !/function tlPickExAuto\(/.test(src));
ok('★★ 第一頁不再撈動作庫（不用模板就不需要）', !/dbGetAll\('exercises'\)/.test(R));
ok('★★ 「新增自訂動作」那張要填部位／工具／姿勢的表單退場',
   !/function tlAddCustomExercise\(/.test(src) && !/function saveCustomExercise\(/.test(src));
{
  const G=new Function('document','showToast','renderAddExerciseSheet','window', fn('tlGoPage2')+'return tlGoPage2;');
  const run=(name)=>{ const w={_tlState:{page:1,exercise_name:'',body_part:null,tool:null,posture:null}}; let toast='';
    G({getElementById:()=>({value:name,focus(){}})}, t=>{toast=t;}, ()=>{}, w)(); return [w._tlState.page, toast]; };
  eq('★★★ 只要有名稱就能開始記（部位／工具／姿勢都不必選）', run('保加利亞分腿蹲'), [2,'']);
  eq('★★ 沒打名稱（或只打空白）→ 擋下並提示', run('   '), [1,'請輸入動作名稱']);
}
ok('★★ 存檔時名稱去頭尾空白；部位／工具／姿勢沒選就存 null',
   /exercise_name:String\(st\.exercise_name\|\|''\)\.trim\(\), body_part:st\.body_part\|\|null, posture:st\.posture\|\|null, tool:st\.tool\|\|null,/.test(src));

console.log('\n③ 抽屜簡化');
const S=fn('renderTrainingLogSheet');
ok('★★★ 標題就是會員，副標是時間與第幾堂（會員色塊卡退場）',
   /<div class="ms-title">\$\{escH\(window\._tlMemName\|\|'會員'\)\}/.test(S) && !/class="tlh-member /.test(S));
ok('★★ 「訓練堂數／最近訓練」兩格與常練／部位退場；三大項紀錄有才畫',
   !/<div class="tlh-ov-l">訓練堂數<\/div>/.test(S) && !/<div class="tlh-ov-l">最近訓練<\/div>/.test(S)
   && !/<span class="tlh-ov-k">常練<\/span>/.test(S) && !/<span class="tlh-ov-k">部位<\/span>/.test(S)
   && /const overview=!prTop\.length \? '' :/.test(S));
ok('★★ 沒有歷史課表 → 整區（含標題與動作查詢）不畫', /\$\{hist\.length\?`<div class="tlh-label"/.test(S) && !/尚無歷史課表/.test(S));
ok('★ 空狀態一行', /'<div class="tls-empty">還沒有紀錄<\/div>'/.test(S));

console.log('\n④ 套用方案看得出點得下去');
ok('★★★ 每張方案卡右邊一顆「套用 ›」', /<div class="wp-item tlpp-card" onclick="tlPlanAsk\('\$\{p\.id\}'\)">\s*\n\s*<span class="tlpp-go">套用 ›<\/span>/.test(src));
ok('★★ 白底浮起來、按下去縮一下', /\.wp-item\.tlpp-card\{background:#fff;/.test(src) && /\.wp-item\.tlpp-card:active\{transform:scale\(\.98\);/.test(src));
ok('★★ 只掛在挑選視窗 —— 訓練方案編輯器的 .wp-item 規則沒動', /\.wp-item\{position:relative;background:var\(--card2\);/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
