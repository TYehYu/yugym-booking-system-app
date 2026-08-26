/* 自訂銷售的兩個坑（2026-08-26 使用者回報）

   ① 「今天陳英鴻儲值的方案　櫃檯金額打錯了　應該是11000　因為之前那格是單價　現在變總價」
      10 堂打成 1,100（實際 11,000）。欄位語意換過，而舊習慣是打單價。
   ② 「自訂方案 有辦法區分一般教練課跟友善教練課嗎？差別在給的自主訓練點數的限制」
      「所以自訂方案要新增一個一般跟友善的項目」
      —— 不用新增：票種清單本來就有兩項（_CUSTOM_TT）。真正的問題是
      **選了之後會怎樣沒有寫出來**，而且發點端根本沒讀票種（見下）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=(sig)=>{ const i=src.indexOf(sig); if(i<0) throw new Error('找不到 '+sig);
  let d=0,k=src.indexOf('{',i);
  for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) break;} }
  return src.slice(i,k+1); };

/* ── 實跑兩支提示 ─────────────────────────────── */
const boxes={};
const doc={ getElementById:id=>(boxes[id]=boxes[id]||{innerHTML:'',className:''}) };
const W={_ttCache:[
  {id:'tt-pt',   name:'教練課',    category:'私人教練', benefit_type:'coaching_session'},
  {id:'tt-fr',   name:'友善教練課', category:'私人教練', benefit_type:'friendly_session', time_restricted:true},
  {id:'tt-self', name:'自主訓練',  category:'自主訓練', benefit_type:null},
  {id:'tt-vch',  name:'教練課折抵300', category:'私人教練', benefit_type:null},
]};
const escH=t=>String(t==null?'':t);
const mk=new Function('window','document','escH',
  grab('const GT_UNIT_MIN=')+'\n'+grab('function grantCustomUnitHint(p){')+'\n'
  +grab('function grantCustomBenefitHint(p){')
  +'\nreturn {grantCustomUnitHint,grantCustomBenefitHint,GT_UNIT_MIN};');
const {grantCustomUnitHint,grantCustomBenefitHint,GT_UNIT_MIN}=mk(W,doc,escH);
const U=()=>boxes['gt-c-unit'], B=()=>boxes['gt-c-bt'];

console.log('① 總價那一格：把「填錯一個 0」講出來');
grantCustomUnitHint({sessions_base:10,list_price:11000,ticket_type_id:'tt-pt'});
ok('★ 正常：寫出總價與平均單堂', /10 堂共 \$11,000/.test(U().innerHTML) && /平均單堂 \$1,100/.test(U().innerHTML)
   && !/gt-unitbox-bad/.test(U().className));
grantCustomUnitHint({sessions_base:10,list_price:1100,ticket_type_id:'tt-pt'});
ok('★★ 陳英鴻那一筆：單堂只有 $110 → 轉紅並算給他看該填多少',
   /gt-unitbox-bad/.test(U().className)
   && /單堂只有 \$110，確定嗎？/.test(U().innerHTML)
   && /應該填 \$11,000/.test(U().innerHTML));
grantCustomUnitHint({sessions_base:2,list_price:0,ticket_type_id:'tt-self'});
ok('★ 沒填價格就整塊不畫（不要一開視窗就紅一片）', U().innerHTML==='');
grantCustomUnitHint({sessions_base:2,list_price:100,ticket_type_id:'tt-self'});
ok('★★ 自主訓練點數／折抵券不跳警示（本來就可能很低或是 0）',
   !/gt-unitbox-bad/.test(U().className));
grantCustomUnitHint({sessions_base:2,list_price:100,ticket_type_id:'tt-vch'});
ok('★★ 折抵券也不跳 —— 它掛在「私人教練」category 底下，但 100 元 2 張很正常',
   !/gt-unitbox-bad/.test(U().className)
   && /判準用 benefit_type 而不是 category/.test(src));
ok('　　門檻寫成常數，之後要調只改一個地方', GT_UNIT_MIN===300);

console.log('\n② 票種那一格：選了會影響簽到送哪一種點數');
grantCustomBenefitHint({ticket_type_id:'tt-fr'});
ok('★★ 友善教練課 → 講明送友善點數，而且限平日 18:00 前',
   /<b>友善教練課<\/b>/.test(B().innerHTML)
   && /簽到送<b>友善<\/b>自主訓練點數/.test(B().innerHTML)
   && /限平日、且要在 18:00 前上完/.test(B().innerHTML));
grantCustomBenefitHint({ticket_type_id:'tt-pt'});
ok('★★ 一般教練課 → 一般點數、沒有時段限制',
   /<b>一般教練課<\/b>/.test(B().innerHTML) && /沒有時段限制/.test(B().innerHTML));
grantCustomBenefitHint({ticket_type_id:'tt-self'});
ok('★ 自主訓練本身不發贈點', /自主訓練本身不發贈點/.test(B().innerHTML));
grantCustomBenefitHint({ticket_type_id:'tt-vch'});
ok('★ 其他票種明講不發', /這個票種不發簽到贈點/.test(B().innerHTML));
grantCustomBenefitHint({ticket_type_id:'nope'});
ok('　　還沒選票種就不畫', B().innerHTML==='');

console.log('\n③ 清單本來就有兩項，不用新增');
ok('★★ _CUSTOM_TT 已含「教練課」與「友善教練課」',
   /const _CUSTOM_TT=\['教練課','友善教練課','團體課','自主訓練'\];/.test(src));
ok('　　欄位標題講出它決定什麼', /<label>票種 \*（決定可約課程與簽到贈點）<\/label>/.test(src));
ok('　　為什麼不是「新增一般／友善兩個項目」寫在原地',
   /不用新增：這個票種清單本來就有「教練課」與「友善教練課」兩項/.test(src));

console.log('\n④ 發點端要讀票種，不能只看方案名稱');
ok('★★ 前端：ticket_types.benefit_type 擺第一',
   /const friendly = ttBt==='friendly_session'/.test(src)
   && /if\(tt\)\{ ttName=tt\.name\|\|''; ttColor=tt\.color\|\|''; ttBt=tt\.benefit_type\|\|''; \}/.test(src));
ok('　　為什麼（自訂方案的 plan_name 就叫「自訂方案」）寫在原地',
   /自訂方案的 plan_name 是「自訂方案」，\s*\n\s*只靠名字含「友善」會判成一般課/.test(src));
ok('★ 總價那一格的標題把話講死（整包金額，不是單堂）',
   /<label>總價 \*<span class="lb-warn">整包金額，不是單堂<\/span><\/label>/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
