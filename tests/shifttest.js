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

/* 常用時段對不上時的保險：涵蓋整個營業時間 → 全班（2026-07-29 小曾案例） */
console.log('\n代號推導的保險');
const bi=src.indexOf('function shiftCode(start,end,dateStr){');
const bj=src.indexOf('\n}', bi)+2;
const BH={ 0:['09:00','15:00'], 1:['10:00','22:00'], 2:['10:00','22:00'], 3:['10:00','22:00'],
           4:['10:00','22:00'], 5:['10:00','22:00'], 6:['09:00','21:00'] };
const t2m=t=>{const p=String(t).split(':');return (+p[0])*60+(+p[1]||0);};
const pymd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(x||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const mk=(quick)=>new Function('SHIFT_QUICK','BUSINESS_HOURS','timeToMin','parseYmd','TODAY',
  src.slice(bi,bj)+'\nreturn shiftCode;')(quick,BH,t2m,pymd,new Date(2026,6,29));
// 正式庫的實際設定：早 9-15、中 12-18、晚 16-22、假晚 15-21、全 9-17、ALL 9-21
const QUICK=[['早','09:00','15:00'],['中','12:00','18:00'],['晚','16:00','22:00'],
             ['假晚','15:00','21:00'],['全','09:00','17:00'],['ALL','09:00','21:00']];
const code=mk(QUICK);
eq('★ 小曾 7/29（週三）10:00–22:00 → 全（原本對不上任何常用時段）',
   code('10:00','22:00','2026-07-29'), '全');
eq('　　鄭百益 16:00–22:00 → 晚（常用時段直接命中）',
   code('16:00','22:00','2026-07-29'), '晚');
eq('　　沒涵蓋整個營業時間就不亂猜（12:00–18:00 命中「中」）',
   code('12:00','18:00','2026-07-29'), '中');
eq('　　半天班對不上也不硬推（11:00–17:00 → 無代號）',
   code('11:00','17:00','2026-07-29'), '');
// 週日只營業到 15:00，09:00–15:00 雖然涵蓋整天，但常用時段「早」是精準命中 → 以常用時段優先
eq('★ 常用時段精準命中時優先（週日 09:00–15:00 → 早，不覆寫成全）',
   code('09:00','15:00','2026-08-02'), '早');
eq('　　週日 09:00–21:00 超出營業時間也算全班',
   code('08:00','16:00','2026-08-02'), '全');
eq('　　沒帶日期時維持原行為（只查常用時段）',
   code('10:00','22:00'), '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
