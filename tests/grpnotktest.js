/* 團課名額＝一定有票（2026-08-20 使用者定案：取消教練招待功能）——
   0807 的規則是「票不夠先擋，但可按『仍以教練負責加入』硬加」；
   0820 林婉華案例：硬加的無票名額被請假時又發補課券，變成「退堂＋補課券」雙重補償。
   新規則：① 存檔前票不夠一律擋下（沒有硬加按鈕）
          ② 存檔中扣不到票（競態）→ 名額不寫入名單、當面告知
          ③ 建課精靈：扣到票的會員才進名單，無票的不加入 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const g=(a,b)=>{const i=src.indexOf(a);if(i<0)return '';return src.slice(i,src.indexOf(b,i));};
const save=g('async function _saveGroupMembers(id){','\n/* 警告視窗按「知道了」');

console.log('名單視窗（saveGroupMembers）');
ok('★ 票不夠一律先擋（沒有 _grpNoTkOK 放行旗標）', /if\(added\.length\)\{/.test(save) && !save.includes('_grpNoTkOK'));
ok('★ 「仍以教練負責加入」按鈕退場', !/onclick="[^"]*grpSaveNoTk/.test(src) && !src.includes('>仍以教練負責加入<') && !src.includes('async function grpSaveNoTk'));
ok('★ 擋下視窗只留「回名單修改」', save.includes('請先儲值（或把這幾位移出名單）再存檔'));
ok('★ 存檔中扣不到票（競態）→ 名額不寫入', /if\(!_ded\)\{ \(_noTk\[mid\]=\(_noTk\[mid\]\|\|0\)\+1\); _failed\.add\(String\(mid\)\); continue; \}/.test(save));
ok('　　同人前一格失敗後續格跳過（名額鍵不跳號）', /if\(_failed\.has\(String\(mid\)\)\)\{ \(_noTk\[mid\]=\(_noTk\[mid\]\|\|0\)\+1\); continue; \}/.test(save));
ok('★ 沒扣到票的名額從 next 移除', save.includes('const j=next.map(String).lastIndexOf(String(mid)); if(j>=0) next.splice(j,1);'));
ok('★ 事後視窗改講「沒有寫入名單」', save.includes('沒有寫入名單'));
ok('　　連續預約只帶真的加入的名額', save.includes("Object.keys(_noTk).forEach(m=>{ _addCnt[m]=Math.max(0,(_addCnt[m]||0)-_noTk[m]);"));

console.log('建課精靈（團體課）');
const wiz=g('// ── 團體課：建立一張多會員預約', 'bkAfterSubmit();');
ok('★ 扣到票才進名單（member_ids 從空集合累加）', /member_id:null,member_ids:\[\],trial_name:null/.test(wiz) && wiz.includes('bk.member_ids.push(mid);'));
ok('★ 無票的整格不加入', wiz.includes('else { skipped++; _failedW.add(String(mid)); }'));
ok('★ 建立結果講清楚幾人次未加入', wiz.includes('人次無票未加入（請先儲值再從名單加入）'));
ok('　　選人清單的無票標籤改口', src.includes("'無票（無法加入，請先儲值）'"));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
