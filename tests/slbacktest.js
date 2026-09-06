/* 銷售流程按「← 返回」要保留第一步選好的會員（2026-09-06 使用者回報：
   「我在[運動按摩銷售] 按返回後　第一步的會員姓名沒有保留　要重新選」）。
   0728 定案「銷售第一步＝先選會員，帶入所有後續流程」，退回來重選一次等於把第一步作廢。
   商品那條路早就用 _slKeepCart 保住購物車，但三條返回路徑沒有一條保住會員。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

/* 抽真正的 slBackToStep1 出來跑，用假的 DOM 餵它 */
const run=(fields)=>{
  const win={};
  let opened=0;
  const doc={ getElementById:(id)=> (id in fields) ? {value:fields[id]} : null };
  new Function('window','document','openSalesModal',
    g('function slBackToStep1(','\n}')+'\nslBackToStep1();')(win, doc, ()=>{opened++;});
  return {win, opened};
};

console.log('① 會員要被帶回去');
let r=run({'gt-member':'MEM-1'});
ok('★★ 課程那一步（gt-member）的會員帶得回去', r.win._salesPreMember==='MEM-1', r.win._salesPreMember);
r=run({'ms-member':'MEM-2'});
ok('★★ 商品結帳（ms-member）的會員也帶得回去', r.win._salesPreMember==='MEM-2', r.win._salesPreMember);
r=run({});
ok('★  場租沒有會員欄位 → 不設，也不會炸', r.win._salesPreMember===undefined && r.opened===1);
r=run({'ms-member':'__walkin__'});
ok('★★ 散客不當成會員帶回去（帶回去會在第一步選到不存在的人）',
   r.win._salesPreMember===undefined, r.win._salesPreMember);
r=run({'gt-member':''});
ok('★  沒選人時不設', r.win._salesPreMember===undefined);

console.log('\n② 購物車也要留著');
r=run({'gt-member':'MEM-1'});
ok('★★ 一律帶 _slKeepCart（課程那條路原本會把加好的商品清掉）', r.win._slKeepCart===1);
ok('★  真的有回到第一步（openSalesModal 被呼叫一次）', r.opened===1);

console.log('\n③ 三條返回路徑都改用它了');
ok('★★ 課程銷售', /onclick="\$\{sales\?'slBackToStep1\(\)':'closeModal\(\)'\}">← 返回/.test(src));
ok('★★ 商品結帳', /onclick="slBackToStep1\(\)">← 返回/.test(src));
ok('★★ 場地租借', /_backFn=window\._facilityFromSales\?'slBackToStep1\(\)'/.test(src));
ok('★  舊的「只清購物車不管會員」寫法已經沒有殘留',
   !/window\._slKeepCart=1;openSalesModal\(\)/.test(src));

console.log('\n④ 兩個旗標讀完就清（不能殘留到下一次真的重新開窗）');
const open=g('async function openSalesModal(','slCartRender();');
ok('★★ _slKeepCart 用完歸零', /if\(window\._slKeepCart\)\{ window\._slKeepCart=0; \}/.test(open));
ok('★★ _salesPreMember 用完清掉', /window\._salesPreMember=null;/.test(open));
ok('★  帶回來的會員真的會被選起來', /pre===m\.id\?'selected':''/.test(open));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
