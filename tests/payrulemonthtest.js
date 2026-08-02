/* 2026-08-02 使用者指示（附截圖，薪資規則的店長獎金區）：
   ①「目前獎金門檻是 80 堂 4000、100 堂追加 2000，所以給我兩個設定門檻」
   ②「每個員工的薪資規則每個月都要獨立，有可能七月跟八月的薪資條件會有所不同，
      但是要先沿用上個月的條件」

   ② 是這次真正要緊的一件事：原本規則只存「現在」一份，八月一調薪，回頭看七月的
   薪資單也會變成新條件 —— 跟當時實際發出去的錢對不上。改成一個月一份快照。
   「先沿用上個月」＝ 沒設過的月份往前找最近一份，不是留白也不是回到預設。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const grabConst=n=>{const i=src.indexOf('const '+n+'=');return src.slice(i, src.indexOf('];', i)+2);};

const M=new Function(grabConst('PAY_RULE_KEYS')+'\n'
  +['payRulesMap','empRuleAt','empAtMonth','payRuleSnapshot','prevYm'].map(grabFn).join('\n')
  +'\nreturn {empRuleAt,empAtMonth,payRuleSnapshot,prevYm};')();

console.log('① 一個月一份快照，沒設過就沿用上個月');
{
  const EMP={id:'E1', base_salary:29500, pt_rate:600, is_manager:false,
    pay_rules:{ '2026-06':{base_salary:29500, pt_rate:600},
                '2026-08':{base_salary:35000, pt_rate:650} }};
  eq('★ 八月有自己的版本 → 用八月的', [M.empAtMonth(EMP,'2026-08').base_salary, M.empAtMonth(EMP,'2026-08').pt_rate], [35000,650]);
  eq('★ 七月沒設過 → 沿用六月（使用者：「要先沿用上個月的條件」）',
     [M.empAtMonth(EMP,'2026-07').base_salary, M.empAtMonth(EMP,'2026-07').pt_rate], [29500,600]);
  eq('★ 九月也沿用八月（最近一份，不是回到預設）', M.empAtMonth(EMP,'2026-09').base_salary, 35000);
  eq('★ 比最早的版本還早的月份 → 用員工資料上的現值（沒有快照可用）',
     M.empAtMonth(EMP,'2026-01').base_salary, 29500);
  eq('　　完全沒有 pay_rules 的員工照舊（不會壞）',
     M.empAtMonth({base_salary:1234},'2026-08').base_salary, 1234);
  eq('　　pay_rules 是壞資料時當成沒有', M.empAtMonth({base_salary:1,pay_rules:[]},'2026-08').base_salary, 1);
  eq('　　挑的是哪一份看得出來', M.empRuleAt(EMP,'2026-07').ym, '2026-06');

  eq('★ 快照只覆蓋規則欄位，不會蓋掉姓名等其他資料',
     M.empAtMonth(Object.assign({name:'小曾'},EMP),'2026-08').name, '小曾');
  eq('　　也不動原本的物件（回傳的是複本）',
     (()=>{ const e=JSON.parse(JSON.stringify(EMP)); M.empAtMonth(e,'2026-08'); return e.base_salary; })(), 29500);
}

console.log('\n② 快照存了哪些欄位');
{
  const snap=M.payRuleSnapshot({id:'E1', name:'小曾', base_salary:35000, pt_tiers:[{min:1,rate:600}],
    is_manager:true, leader_members:['A'], leader_t1:80, leader_b1:4000, leader_t2:100, leader_b2:2000,
    phone:'0912', hire_date:'2026-08-01'});
  ok('★ 收薪資相關欄位', snap.base_salary===35000 && snap.is_manager===true
     && JSON.stringify(snap.leader_members)===JSON.stringify(['A']) && snap.leader_t2===100, snap);
  ok('★ 不收人事欄位（姓名、電話、到職日不是薪資規則）',
     snap.name===undefined && snap.phone===undefined && snap.hire_date===undefined, snap);
  eq('　　上個月怎麼算', [M.prevYm('2026-08'), M.prevYm('2026-01')], ['2026-07','2025-12']);
}

console.log('\n③ 店長獎金：兩個門檻');
{
  const G={leader_t1:80, leader_b1:4000, leader_t2:100, leader_b2:2000};
  const F=new Function('LEADER_NEW_FROM', grabFn('leaderBonusOf')+'\nreturn leaderBonusOf;')('2026-08');
  const ROWS=[{id:'A',name:'甲',classes:120},{id:'B',name:'乙',classes:85},
              {id:'C',name:'丙',classes:79},{id:'D',name:'丁',classes:100}];
  const MGR=o=>Object.assign({is_manager:true, leader_members:['A','B','C','D'],
    leader_t1:80, leader_b1:4000, leader_t2:100, leader_b2:2000}, o||{});
  const r=F(MGR(), {leaderRows:ROWS}, G, '2026-08');
  eq('★ 門檻②是「追加」不是取代：120 堂 ＝ 4000＋2000', r.hitRows.length, 3);
  eq('★ 合計 ＝ 甲6000 ＋ 乙4000 ＋ 丁6000（丙 79 堂不到門檻）', r.pay, 16000);
  ok('　　明細逐位寫出堂數與金額', /甲 120 堂 \$6,000/.test(r.detail) && /丁 100 堂 \$6,000/.test(r.detail), r.detail);
  eq('★ 剛好等於門檻算達標（80 與 100 都是含）',
     F(MGR({leader_members:['B','D']}), {leaderRows:ROWS}, G, '2026-08').pay, 4000+6000);
  eq('★ 門檻②填 0 ＝ 不用第二段（只有一個門檻的店長）',
     F(MGR({leader_t2:0, leader_b2:0}), {leaderRows:ROWS}, G, '2026-08').pay, 4000*3);
  eq('　　個人沒填就用全域預設（80/4000、100/2000）',
     F({is_manager:true,leader_members:['A']}, {leaderRows:ROWS}, G, '2026-08').pay, 6000);
  eq('★ 名單沒設仍是 0（先前定的規則沒被改掉）',
     F({is_manager:true}, {leaderRows:ROWS}, G, '2026-08').pay, 0);
  eq('★ 七月仍走舊制（全店總堂數）', F(MGR(), {leaderRows:ROWS}, G, '2026-07').pay,
     Math.floor((120+85+79+100)/80)*4000);
}

console.log('\n④ 算薪的四個入口都換成「那個月的員工」');
ok('★ 月結薪資彙總', /calcSalary\(empAtMonth\(emp,month\), ptDone/.test(src));
ok('★ 薪資單／薪資頁', /calcSalary\(empAtMonth\(me,month\), ptDone/.test(src));
ok('★ 員工資料的本月薪資摘要', /calcSalary\(empAtMonth\(emp,ym\), ptDone/.test(src));
ok('★ 營運分析的教練總薪資', /calcSalary\(empAtMonth\(c,month\), ptD/.test(src));
eq('　　沒有漏掉的呼叫點（每一個 =calcSalary( 都吃 empAtMonth）',
   (src.match(/=\s*calcSalary\((?!empAtMonth)/g)||[]), []);
ok('　　門檻②填 0 不會被 || 吃掉而退回預設',
   /用 !=null 而不是 \|\|：門檻②填 0 就是「不用第二段」/.test(src));
ok('　　為什麼只在計算入口換一次，寫在程式裡',
   /只要在計算入口換一次，底下的 empPayConfig \/ calcSalary \/ leaderBonusOf 就全都是月份版/.test(src));

console.log('\n⑤ 設定畫面：一次編一個月');
ok('★ 視窗上方可以挑月份', /<select onchange="openHrSalary\('\$\{id\}',this\.value\)">\$\{monthOptions\(window\._hrSalYm,''\)\}<\/select>/.test(src));
ok('　　未來月份也挑得到（先排下個月的條件）', /monthOptions\(window\._hrSalYm,''\)/.test(src));
ok('★ 畫面帶出「那個月適用的條件」', /const c=empAtMonth\(c0, window\._hrSalYm\);/.test(src));
ok('★ 講清楚現在看的是自己的版本還是沿用來的',
   /這個月還沒有自己的條件，畫面上是\$\{_hit\?`沿用 <b>\$\{_hit\.ym\.replace\('-','\/'\)\}<\/b> 的設定`:'目前的設定'\}/.test(src)
   && /這個月有自己的條件（\$\{window\._hrSalYm\.replace\('-','\/'\)\} 版本）/.test(src));
ok('★ 儲存寫成那個月的快照', /_map\[_ym\]=payRuleSnapshot\(c\);/.test(src) && /c\.pay_rules=_map;/.test(src));
ok('★ 第一次建版本時，把編輯前的樣子凍結到前一個月',
   /if\(!Object\.keys\(_map\)\.some\(k=>k<_ym\)\) _map\[prevYm\(_ym\)\]=payRuleSnapshot\(window\._hrSalRaw\|\|\{\}\);/.test(src));
ok('　　為什麼要凍結，寫在程式裡',
   /否則改了八月，沒有版本的七月會跟著讀到新條件，回頭看七月的薪資單就對不上當時發的錢。/.test(src));
ok('★ 回頭改過去的月份，不會動到員工資料上的現值',
   /if\(_ym < ymd\(TODAY\)\.slice\(0,7\)\)\{\n\s*const _now=window\._hrSalRaw\|\|\{\};\n\s*PAY_RULE_KEYS\.forEach\(k=>\{ c\[k\]=_now\[k\]; \}\);/.test(src));
ok('　　吐司說出存的是哪個月', /showToast\(`\$\{_ym\.replace\('-','\/'\)\} 的薪資規則已儲存`\)/.test(src));

console.log('\n⑥ 兩個門檻的欄位與全域預設');
ok('★ 設定畫面有兩組門檻', /id="hr-ldt1"/.test(src) && /id="hr-ldb1"/.test(src)
   && /id="hr-ldt2"/.test(src) && /id="hr-ldb2"/.test(src));
ok('★ 說明寫明第二段是「追加」，並舉出實際金額',
   /門檻②是<b>追加<\/b>不是取代/.test(src) && /該教練上滿 \$\{t2\} 堂就是 \$\$\{\(b1\+b2\)\.toLocaleString\(\)\}/.test(src));
ok('　　也講了填 0 就是不用第二段', /門檻②填 0 ＝ 不用第二段/.test(src));
ok('★ 存的是四個欄位', /c\.leader_t1=Number\(g\('hr-ldt1'\)\)\|\|80;/.test(src)
   && /c\.leader_b2=Number\(g\('hr-ldb2'\)\)\|\|0;/.test(src));
ok('　　取消店長把四個都清掉', /c\.leader_members=null; c\.leader_t1=null; c\.leader_b1=null; c\.leader_t2=null; c\.leader_b2=null;/.test(src));
ok('★ 全域預設就是使用者現行的 80\/4000、100\/追加 2000',
   /leader_t1: 80, leader_b1: 4000,\n\s*leader_t2: 100, leader_b2: 2000,/.test(src));
ok('　　全域設定畫面也是兩組', /id="sg-ldt1"/.test(src) && /id="sg-ldb2"/.test(src));
eq('　　舊的單門檻欄位清乾淨', (src.match(/leader_target|leader_bonus/g)||[]), []);

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
