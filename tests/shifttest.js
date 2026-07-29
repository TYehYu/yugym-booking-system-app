/* 班別配色（2026-07-29 使用者指示：全班品牌紅、早班品牌金、晚班品牌綠） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,a===e,`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const i=src.indexOf('function shiftCodeCls(code, isWeekend){');
const j=src.indexOf('\n}', i)+2;
const cls=new Function(src.slice(i,j)+'\nreturn shiftCodeCls;')();

console.log('班別 → 顏色');
eq('★ 全班 → 品牌紅', cls('全',false), ' sh-code-full');
eq('★ 早班 → 品牌金', cls('早',false), ' sh-code-am');
eq('★ 晚班 → 品牌綠', cls('晚',false), ' sh-code-pm');
eq('　　假日的全班仍是紅（班別優先於平假日）', cls('全',true), ' sh-code-full');
eq('　　假日的早班仍是金', cls('早',true), ' sh-code-am');
eq('　　假日的晚班仍是綠', cls('晚',true), ' sh-code-pm');
eq('　　含班別字的複合代號也認得（早1）', cls('早1',false), ' sh-code-am');
console.log('\n自訂代號退回原本規則');
eq('自訂代號・平日 → 預設綠（無 class）', cls('A',false), '');
eq('自訂代號・假日 → 金', cls('A',true), ' sh-code-wkd');
eq('空代號不炸', cls('',false), '');
eq('null 不炸', cls(null,false), '');

console.log('\n顏色定義');
ok('★ 全班用 danger', /\.sh-code\.sh-code-full\{background:var\(--danger,#b5372e\);\}/.test(src));
ok('★ 早班用品牌金', /\.sh-code\.sh-code-am\{background:var\(--gold-d,#b48a56\);\}/.test(src));
ok('★ 晚班用品牌綠', /\.sh-code\.sh-code-pm\{background:var\(--green\);\}/.test(src));
ok('　　月曆兩處都改用同一支判定', (src.match(/const _ccls=shiftCodeCls\(_cd,isWk\);/g)||[]).length===2);
ok('　　排班視窗的快捷鈕同一套配色', /const _qcol=c=>String\(c\)\.indexOf\('全'\)>=0/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
