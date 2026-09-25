/* 工具／姿勢清單可自己增刪（2026-09-25 使用者：「工具／姿勢的選項要能自己增刪」）

   起因：TL_TOOLS（10 個）與 TL_POSTURES（5 個）寫死在程式裡，
   店裡進了新器材就加不進去。

   ⚠⚠ 設計上只存「差異」，不把整份清單搬進資料庫：
     ① TL_TOOLS 是同步常數，十幾個呼叫端直接讀；改成非同步要動很多地方，
        而且每一處都多一個「還沒載好」的狀態。
     ② 表讀不到時只存差異會**退回內建清單照常能用**；整份搬進去就是清單全空。
   ⚠⚠ 「刪除」內建項目是**隱藏**不是真刪：training_logs 已經有 tool='四角槓'
     的紀錄，真刪會讓歷史的標籤對不上。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)i=src.indexOf('async function '+n+'(');
  if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const TOOLS=['啞鈴','壺鈴','槓鈴','SSB槓鈴','四角槓','史密斯','Cable','TRX','彈力帶','徒手'];
const POS=['站姿','跪姿','坐姿','趴姿','躺姿'];
/* ⚠ 2026-09-25：改成每位教練各一份，所以要餵 SESSION.id 並在資料上帶 coach_id。 */
const ME='C-me';
/* ⚠ SESSION 要當參數餵進去 —— 它在程式裡是 `let SESSION`（不掛 window），
   所以這裡不能塞在 window 物件裡（0925 第一版就是這樣寫錯，測試當場抓到）。 */
const L=(opts,me)=>new Function('window','SESSION','TL_TOOLS','TL_POSTURES',
  grab('tlOptList')+'\nreturn tlOptList;')(
    {_tlOpts:opts},{id:me||ME},TOOLS,POS);
const O=(o)=>Object.assign({coach_id:ME},o);

console.log('① 清單＝內建 − 藏起來的 ＋ 自訂');
{
  eq('★★★ 沒有任何設定 → 就是內建那 10 個', L(null)('tool'), TOOLS);
  eq('★★★ 表是空的 → 一樣退回內建（不是空清單）', L([])('tool'), TOOLS);
  eq('★★★ 隱藏「四角槓」→ 少那一個，其餘順序不動',
     L([O({kind:'tool',name:'四角槓',hidden:true})])('tool'),
     TOOLS.filter(x=>x!=='四角槓'));
  eq('★★★ 新增「飛輪」→ 排在內建後面',
     L([O({kind:'tool',name:'飛輪',hidden:false,sort_order:1})])('tool'),
     TOOLS.concat(['飛輪']));
  eq('★★ 新增多個照 sort_order 排',
     L([O({kind:'tool',name:'B',hidden:false,sort_order:2}),
        O({kind:'tool',name:'A',hidden:false,sort_order:1})])('tool'),
     TOOLS.concat(['A','B']));
  eq('★★ 姿勢是另一個 kind，互不干擾',
     L([O({kind:'tool',name:'飛輪',hidden:false})])('posture'), POS);
  eq('★★ 自訂的名字跟內建重複時不重覆列出',
     L([O({kind:'tool',name:'啞鈴',hidden:false})])('tool'), TOOLS);
  eq('　　空白名字不進清單', L([O({kind:'tool',name:'   ',hidden:false})])('tool'), TOOLS);
  eq('　　壞掉的列不會爆', L([null,undefined,O({kind:'tool'})])('tool').length, 10);
}

console.log('\n①-b 每位教練各一份（2026-09-25 使用者：「教練各自新增刪除應該不會影響彼此吧」）');
{
  const OTHER=[{coach_id:'C-other',kind:'tool',name:'戰繩',hidden:false},
               {coach_id:'C-other',kind:'tool',name:'啞鈴',hidden:true}];
  eq('★★★ 看不到別位教練自訂的「戰繩」', L(OTHER)('tool'), TOOLS);
  eq('★★★ 別位教練藏掉「啞鈴」不影響我', L(OTHER)('tool').indexOf('啞鈴')>=0, true);
  eq('★★★ 我自己的照樣生效（同一批資料，換一個身分看）',
     L(OTHER.concat([O({kind:'tool',name:'飛輪',hidden:false})]))('tool'),
     TOOLS.concat(['飛輪']));
  eq('★★ 換成對方的身分看，就看得到他的',
     L(OTHER,'C-other')('tool'), TOOLS.filter(x=>x!=='啞鈴').concat(['戰繩']));
  ok('★★★ 三支寫入都用 tlOptFind（漏掉 coach_id 就會改到別人的設定）',
     (src.match(/const old=tlOptFind\(kind,/g)||[]).length===3
     && /String\(o\.coach_id\)===me/.test(grab('tlOptFind')));
  ok('★★★ 不可以用 window.SESSION（它是 let，不掛 window）——全檔都不准再出現',
     !/window\.SESSION&&SESSION\.id/.test(src)
     && /不可以寫 window\.SESSION/.test(src));
  ok('★★★ 新增時帶 coach_id', /coach_id:SESSION\.id, kind, name:n, hidden:false/.test(grab('tlOptAdd')));
  ok('★★★ 隱藏內建時也帶 coach_id', /coach_id:SESSION\.id, kind, name:String\(name\),/.test(grab('tlOptDel')));
  ok('★★ 管理視窗的「已藏起來」也只列自己的',
     /const rows=\(window\._tlOpts\|\|\[\]\)\.filter\(o=>o&&o\.kind===kind&&String\(o\.coach_id\)===_me\);/.test(src));
  ok('★★ 為什麼改成各自一份，理由寫在原地',
     /常用動作（coach_exercises）本來就是自己一份/.test(src));
}

console.log('\n② 內建與自訂要分得出來（刪法不同）');
{
  const B=new Function('TL_TOOLS','TL_POSTURES', grab('tlOptIsBuiltin')+'\nreturn tlOptIsBuiltin;')(TOOLS,POS);
  ok('★★★ 內建的認得出來', B('tool','啞鈴')===true && B('posture','站姿')===true);
  ok('★★★ 自訂的認得出來', B('tool','飛輪')===false);
  ok('★★ kind 不能搞混（站姿不是工具）', B('tool','站姿')===false);
}

console.log('\n③ 刪除：內建只藏、自訂真刪');
{
  const D=grab('tlOptDel');
  ok('★★★ 內建 → 寫一筆 hidden=true，不碰既有紀錄',
     /if\(built\)\{/.test(D) && /hidden:true/.test(D) && !/dbDel[\s\S]{0,80}built/.test(D));
  ok('★★★ 自訂 → 真的刪掉那一列', /await dbDel\('training_options', old\.id\);/.test(D));
  ok('★★ 說法要跟行為一致（藏起來 vs 刪除）',
     /showToast\(built\?`已把「\$\{name\}」藏起來`:`已刪除「\$\{name\}」`\)/.test(D));
  ok('★★★ 為什麼不真刪，理由寫在原地',
     /真刪會讓歷史的標籤對不上|真刪會讓歷史紀錄的標籤對不上/.test(src));
  const U=grab('tlOptUnhide');
  ok('★★ 藏起來的可以還原', /hidden:false/.test(U));
}

console.log('\n④ 新增');
{
  const A=grab('tlOptAdd');
  ok('★★★ 同名擋下（清單是給人點的，重複兩列只會讓人挑錯）',
     /if\(tlOptList\(kind\)\.indexOf\(n\)>=0\)\{ showToast/.test(A));
  ok('★★★ 之前藏起來的內建項目，再新增同名＝還原它（不要多一筆同名自訂）',
     /const old=tlOptFind\(kind,n\);/.test(A)
     && /if\(old\)\{ await dbPut\('training_options', Object\.assign\(\{\}, old, \{hidden:false\}\)\); \}/.test(A));
  ok('★★ 空白擋下', /if\(!n\)\{ showToast\('請先輸入名稱'\)/.test(A));
  ok('★★ 新增的排在最後（sort_order 取目前最大＋1）',
     /\.reduce\(\(m,o\)=>Math\.max\(m, Number\(o\.sort_order\)\|\|0\), 0\)\+1/.test(A));
}

console.log('\n⑤ 四個挑選清單都接上了（少一個就會兩種清單）');
{
  ok('★★★ 四處都改吃 tlOptList',
     (src.match(/tlOptList\('?\$?\{?is[PF]/g)||[]).length>=1
     && (src.match(/tlOptList\(/g)||[]).length>=6);
  ok('★★★ 舊的直接讀常數已經收乾淨',
     !/const list=isP\?TL_POSTURES:TL_TOOLS/.test(src)
     && !/list=field==='category'\?CXE_CATS:\(field==='posture'\?TL_POSTURES:TL_TOOLS\)/.test(src));
  ok('★★★ 管理入口只在工具／姿勢出現，分類不給改',
     /field==='category'\?'':`<button type="button" class="tlo-mgr"/.test(src)
     && /分類不給改：它決定動作出現在哪一個頁籤底下/.test(src));
  ok('★★ 四個 async 入口都先載好清單（挑選視窗是同步的）',
     (src.match(/await tlOptLoad\(\);/g)||[]).length===4);
  ok('★★ 管理入口擺在清單底部、虛線淡框，不跟選項搶眼',
     /\.tlo-mgr\{display:block;width:100%;margin-top:8px;background:transparent;\s*\n\s*border:1px dashed var\(--bd\)/.test(src)
     && /挑選是每天在用的路徑，管理一個月一次/.test(src));
}

console.log('\n⑥ migration');
{
  const sql=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260925_training_options.sql','utf8');
  ok('★★★ 有 GRANT（10/30 之後不寫就是不能用）',
     /grant select, insert, update, delete on public\.training_options to authenticated;/.test(sql)
     && /grant select, insert, update, delete on public\.training_options to service_role;/.test(sql));
  ok('★★★ anon 不給', !/to anon/.test(sql));
  ok('★★★ 有開 RLS', /alter table public\.training_options enable row level security;/.test(sql));
  ok('★★★ 只碰得到自己那一份（與 coach_exercises 同一套判準）',
     /for select using \(\(select is_admin\(\)\) or coach_id = \(select current_employee_id\(\)\)\)/.test(sql)
     && /for all using \(\(select is_admin\(\)\) or coach_id = \(select current_employee_id\(\)\)\)/.test(sql));
  ok('★★★ 唯一鍵要含 coach_id（兩位教練各自加「飛輪」是正常的，不該互相擋）',
     /create unique index if not exists training_options_coach_kind_name_idx\s*\n\s*on public\.training_options \(coach_id, kind, name\);/.test(sql));
  ok('★★ coach_id 必填', /coach_id    text not null,/.test(sql));
  ok('★★ kind 只能是 tool／posture', /check \(kind in \('tool','posture'\)\)/.test(sql));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
