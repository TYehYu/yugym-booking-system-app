/* 待審核卡的簽署方式標籤（2026-10-13 使用者：「這邊我已經選了簽署方式了，
   但這個頁面還是顯示尚未選簽署方式」）

   成因：卡片裡寫的是 `c.sign_type`，但那個 `c` 是**這一頁的 context 物件**
   （c.myGR／c.ctSigned／c.myLogs 都是從它來的），不是合約 —— 永遠 undefined，
   三態判斷固定掉到最後一格「尚未選」。
   正式庫 73 份紙本、66 份電子、3 份真的未決，等於**過半的單都被標錯**。
   使用者那一筆（陳智傑 CT-mv6hhr2884p8）實際是 remote、未簽回，
   應該顯示「等會員簽回」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 簽署方式要真的從合約來');
ok('★★★ context 帶出 ctSignType（與 ctSigned 同一份 contractsAll，不多查一次）',
   /c\.ctSignType=\{\}; \(contractsAll\|\|\[\]\)\.forEach\(x=>\{ if\(x&&x\.id\) c\.ctSignType\[x\.id\]=String\(x\.sign_type\|\|''\); \}\);/.test(src));
/* ⚠ 負面斷言要限定在待審核卡那一段 —— 別處（例如 contracts.filter(c=>...)）
   的 c 本來就真的是合約，整份檔案掃會誤判（見「斷言會命中自己的註解」那條教訓）。 */
const GRCARD=src.slice(src.indexOf('const grCard=r=>{'), src.indexOf("<span class=\"gr-item-when\">送出"));
ok('★★★ 卡片改讀 ctSignType[r.contract_id]，不再讀不存在的 c.sign_type',
   /const _st=\(c\.ctSignType\|\|\{\}\)\[r\.contract_id\]\|\|'';/.test(GRCARD)
   && !/c&&c\.sign_type/.test(GRCARD));
ok('★★ 成因寫在原地（那個 c 是 context 不是合約）',
   /那個 c 是\*\*這一頁的\s*\n?\s*context 物件\*\*/.test(src.replace(/\r/g,'')) || /c 是\*\*這一頁的/.test(src));

console.log('\n② 四態：紙本是「已經選過」，不能跟「還沒選」混在一起');
/* 把那段判斷抽出來實跑 */
const i=src.indexOf("const _st=(c.ctSignType||{})[r.contract_id]||'';");
const seg=src.slice(src.lastIndexOf('(()=>{', i), src.indexOf('})()}', i)+5);
const label=new Function('signed','c','r', seg.replace(/^\(\(\)=>\{/,'').replace(/\}\)\(\)\}$/,'')+'')
  ;
const run=(signed,st)=>label(signed,{ctSignType:{CT:st}},{contract_id:'CT'});
eq('★★★ 已簽回', run(true,'remote'), '✓ 合約已簽回');
eq('★★★ 電子、未簽回 → 等會員簽回（使用者那一筆就是這個）', run(false,'remote'), '等會員簽回');
eq('★★★ 紙本 → 紙本簽署・等收回（改版前被誤標成「尚未選」）', run(false,'paper'), '紙本簽署・等收回');
eq('★★★ 真的還沒選 → 尚未選簽署方式', run(false,'undecided'), '◻ 尚未選簽署方式');
eq('★★ 沒有合約／讀不到也走「尚未選」（不要憑空說已選）', run(false,''), '◻ 尚未選簽署方式');
eq('★★ 簽回優先於任何方式', run(true,'paper'), '✓ 合約已簽回');

console.log('\n③ 綠／灰的樣式沒改壞');
ok('★★ 只有簽回才是 ok，其餘都是 wait', /class="gr-sign \$\{signed\?'ok':'wait'\}"/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
