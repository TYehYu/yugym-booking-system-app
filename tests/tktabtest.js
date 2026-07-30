/* 會員票券分頁：新增「運動按摩」，各分頁旁顯示可用票券張數（2026-07-30 使用者指示） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('分頁');
ok('★ 五個分頁：教練課／團體課／自主訓練／運動按摩／折抵券',
   /const _tkTabs=\[\['pt','教練課'\],\['group','團體課'\],\['self','自主訓練'\],\['massage','運動按摩'\],\['voucher','折抵券'\]\];/.test(src));
ok('★ cls() 認得運動按摩', /if\(\(tt\.category\|\|''\)==='運動按摩'\|\|\/按摩\/\.test\(t\.plan_name\|\|''\)\) return 'massage';/.test(src));
ok('★ 折抵券的判定排在最前面（按摩折抵券不能被歸進按摩分頁）', (()=>{
   const i=src.indexOf("        const cls=t=>{ const tt=typeMap[t.ticket_type_id]||{};");
   const seg=src.slice(i, src.indexOf("return 'pt'; };",i));
   return seg.indexOf("return 'voucher';") < seg.indexOf("return 'massage';");
})());
ok('　　原因寫在程式裡', /運動按摩折抵券的 category 也是「運動按摩」，\s*\n\s*不先攔下來就會被歸進按摩分頁/.test(src));

console.log('\n可用張數');
ok('★ 每個分頁後面帶可用張數', /return `<button class="tkf-btn\$\{tab===k\?' active':''\}" onclick="ppTkTab\('\$\{k\}'\)">\$\{l\}\$\{n\?`<i class="tkf-n">\$\{n\}<\/i>`:''\}<\/button>`;/.test(src));
ok('★ 「可用」＝沒被收進歷史紀錄的（與畫面同一個判準）',
   /\(c\.myTk\|\|\[\]\)\.forEach\(t=>\{ const k=cls\(t\); if\(!isHist\(t\)\) _liveCnt\[k\]=\(_liveCnt\[k\]\|\|0\)\+1; \}\);/.test(src));
ok('★ 分頁字串搬到 isHist 之後才組（不然算不到）',
   src.indexOf('const isHist=t=>{') < src.indexOf('const _tkTabs=['));
ok('　　0 張的分頁不顯示數字（不用一排 0 干擾）', /\$\{n\?`<i class="tkf-n">\$\{n\}<\/i>`:''\}/.test(src));
ok('　　數字樣式：選中的分頁用半透明白底', /\.tkf-btn\.active \.tkf-n\{background:rgba\(255,255,255,\.24\);color:#fff;\}/.test(src));

console.log('\n順手修掉的舊 bug');
ok('★ 團課比對補上「小班肌力」（票種的 category 實際是小班肌力，團體課從來沒對上）',
   /if\(\(tt\.category\|\|''\)==='小班肌力'\|\|\(tt\.category\|\|''\)==='團體課'\|\|\/團\/\.test\(t\.plan_name\|\|''\)\) return 'group';/.test(src));
ok('　　原因寫在程式裡', /'團體課' 從來沒對上過/.test(src));

// 實跑分類
console.log('\n實跑 cls()');
{
  const i=src.indexOf("        const cls=t=>{ const tt=typeMap[t.ticket_type_id]||{};");
  const j=src.indexOf("return 'pt'; };",i)+15;
  const TM={ pt:{name:'教練課',category:'私人教練'}, fr:{name:'友善教練課',category:'私人教練'},
             grp:{name:'團體課',category:'小班肌力'}, self:{name:'自主訓練',category:'自主訓練'},
             ms:{name:'運動按摩',category:'運動按摩'},
             vpt:{name:'教練課折抵300',category:'私人教練'}, vms:{name:'運動按摩折抵300',category:'運動按摩'} };
  const cls=new Function('typeMap', src.slice(i,j)+'\nreturn cls;')(TM);
  const T=(ttid,plan)=>({ticket_type_id:ttid,plan_name:plan||''});
  eq('★ 運動按摩 1 堂 → massage', cls(T('ms','運動按摩')), 'massage');
  eq('★ 運動按摩折抵券 → voucher（不是 massage）', cls(T('vms','運動按摩折抵300')), 'voucher');
  eq('★ 教練課折抵券 → voucher', cls(T('vpt','教練課折抵券 $300')), 'voucher');
  eq('★ 團體課（category 小班肌力）→ group', cls(T('grp','四週優惠方案')), 'group');
  eq('　　教練課 → pt', cls(T('pt','私人教練課 1V1')), 'pt');
  eq('　　友善教練課 → pt', cls(T('fr','友善教練課 1V2')), 'pt');
  eq('　　自主訓練 → self', cls(T('self','自主訓練點數')), 'self');
  eq('　　plan_name 帶「按摩」但票種未知 → massage', cls(T('??','運動按摩體驗')), 'massage');
  eq('　　認不出來 → pt（維持原行為）', cls(T('??','某方案')), 'pt');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
