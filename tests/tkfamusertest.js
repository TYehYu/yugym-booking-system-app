/* 2026-08-04 使用者指示：「會員票券也新增一項家庭成員，該票券預設由該成員使用，方便預約」

   member_tickets.family_user：票券指定預設使用人（家庭成員稱呼）。
   預約扣到這張票、沒另外指定使用人時，trial_name 自動帶入 → 課卡顯示「王小明（爸爸）」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

console.log('① 設定入口（會員資料的票券卡）');
{
  /* 2026-08-04 使用者回報「團體課點不進去」：初版誤用表頭的 r（此函式沒這個變數）
     → ReferenceError 整個票券分頁掛掉。要用 PP.rec，而且要驗到這件事。 */
  ok('★ 持有中票券卡有「使用人」鈕（用 PP.rec，不是表頭的 r）',
     /PP\.rec&&Array\.isArray\(PP\.rec\.family_members\)&&PP\.rec\.family_members\.length\)\?`<button[^`]*ppTkFamUser\('\$\{t\.id\}'\)/.test(src)
     && !/Array\.isArray\(r\.family_members\)&&r\.family_members\.length\)\?`<button[^`]*ppTkFamUser/.test(src));
  ok('★ 已設定的顯示「使用人：稱呼」', /使用人：'\+t\.family_user/.test(src));
  const f=grabFn('ppTkFamUser');
  ok('★ 選項＝本人＋家庭成員清單', /btn\('','本人（'\+\(m\?m\.name:'—'\)\+'）'\)/.test(f)
     && /fam\.map\(f=>btn\(f,f\)\)\.join\(''\)/.test(f));
  ok('　　沒設定家庭成員先指路', /會員資料表頭 → ＋家庭成員/.test(f));
  ok('　　寫入走 dbPut、可改回本人', /t\.family_user=v\|\|null;/.test(grabFn('ppTkFamUserSet'))
     && /已改回本人使用/.test(grabFn('ppTkFamUserSet')));
}

console.log('\n② 三條預約路徑都自動帶入（指定的使用人優先）');
{
  ok('★ 櫃檯單筆／連續（原路徑）三態取值：null＝依票券、\'\'＝明確本人、名字＝成員',
     /trial_name:\(o\.trial_name==null \? \(\(tk&&tk\.family_user\)\|\|null\) : \(o\.trial_name\|\|null\)\),/.test(src));
  ok('★ RPC 路徑：建完補寫（同一套取值）',
     /const _fam=\(o\.trial_name==null \? \(\(tk&&tk\.family_user\)\|\|null\) : \(o\.trial_name\|\|null\)\);/.test(src)
     && /update\(\{trial_name:_fam\}\)\.eq\('id',data\.booking_id\)/.test(src));
  /* 2026-08-04 使用者指示（截圖）：「這一步可以新增選擇家庭成員，如果該會員有設定的話」 */
  ok('★ 步驟 2 有使用人選單（會員有家庭成員才出現）',
     /Array\.isArray\(preInfo\.family_members\)&&preInfo\.family_members\.length\)\?`<div class="form-row"><label>使用人<\/label>/.test(src)
     && /bkFamSel\(this\.value\)/.test(src));
  /* 2026-08-04 使用者回報（蕭育筑）：票設定了媽媽，步驟 2 的使用人沒預設帶出 ——
     選定票券後把票上的預設使用人同步進選單（顯示用；寫入本來就吃 null＝依票券）。 */
  ok('★ 選定票券後同步預設使用人到選單', /function bkFamSyncFromTicket\(tk\)\{/.test(src)
     && (src.match(/bkFamSyncFromTicket\(/g)||[]).length>=4
     && /if\(window\._bkFamUser!=null\) return;/.test(src));
  ok('★ 明確選本人可蓋過票券預設（\'\' 哨兵）',
     /function bkFamSel\(v\)\{ window\._bkFamUser = v==='__self__' \? '' : \(v\|\|null\); \}/.test(src));
  ok('★ 會員自助：沒特別選使用人時帶票券預設',
     /s\.famOpts\[s\.pickFam\]:\(\(tk&&tk\.family_user\)\|\|null\);/.test(src));
}

console.log('\n②b 團課票的家庭功能（2026-08-04 使用者指示：「包含預約的地方」）');
{
  ok('★ 團課選會員名單：將被扣的票有預設使用人 → 名字旁標出',
     /const _pk=tks\.find\(t=>t\.id===picked\);/.test(src) && /使用人：\$\{_pk\.fam\}/.test(src)
     && (src.match(/fam:t\.family_user\|\|null/g)||[]).length===2);
  ok('★ 明細名單：該名額扣到的票有預設使用人 → 標稱呼',
     /_sl&&_sl\.t&&_sl\.t\.family_user\)\?`<span class="tag"[^`]*使用人：\$\{_sl\.t\.family_user\}/.test(src));
  ok('★ 課卡快捷簽到名單也標（wallet 逐名額對票）',
     /_famOf=\(mid,n\)=>\{ const W=_wc\[mid\]\|\|\(_wc\[mid\]=buildWallet\(mid,_wctx\)\);/.test(src));
}

console.log('\n③ 課卡顯示（bkName 只在自主訓練加註）');
{
  ok('★ 條件用 bkTag 排除（體驗／場租／待簽約）＋同名保險',
     /!bkTag\(b\) && b\.trial_name!==v/.test(grabFn('bkName')));   // 2026-08-04 蕭育筑案例：教練課也要顯示
  ok('★ 桌機行事曆一般會員課走 bkName', /memName=bkName\(b,id=>memMap\[id\]\);/.test(src));
  ok('★ 手機 agenda 也走 bkName', /if\(b\.member_id\) return bkName\(b,id=>memMap\[id\]\);/.test(src));
  ok('　　migration 留檔', fs.existsSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260804_member_tickets_family_user.sql'));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
