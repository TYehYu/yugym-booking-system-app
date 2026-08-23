/* 2026-08-02 使用者指示：
   「薪資規則依照該員工的身份顯示內容就好，正職只顯示正職。
     另外店長的津貼從八月開始調整新的模式，依照每個教練達標的課堂支付獎金。
     所以如果該員工有把店長打開，下方要顯示全員工的列表，打勾該員工表示該員工的課堂數
     才有影響該店長的獎金。還有達標課堂跟達標獎金的設定。
     這樣可以在之後有分店的時候，每個店長影響的獎金可以單獨設定。」

   舊制是「全店總堂數 ÷ 每 80 堂 ＝ N 筆 × $4,000」——一個全域數字，全店共用。
   分店之後那組數字就沒辦法分開：兩位店長帶不同的人、給不同的錢。
   新制把名單、門檻、金額都存在「這位店長」自己身上。

   兩件要小心的事：
   ① 七月以前照舊算 —— 回頭看歷史薪資不該整片變動。
   ② 名單沒設就是 0，而且要說出來。新制沒有「全員」這個預設可以猜，
      猜出來的金額是憑空生出來的；畫面上寫「尚未設定計算名單」比默默給一個數字安全。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* 2026-08-02 二修（使用者：「目前獎金門檻是 80 堂 4000、100 堂追加 2000，
   所以給我兩個設定門檻」）—— 單一門檻換成兩段，門檻②是追加。
   兩段的算術細節在 payrulemonthtest.js，這裡看的是名單與分店的分離。 */
const G={leader_per_classes:80, leader_per_amount:4000, leader_t1:60, leader_b1:2000, leader_t2:0, leader_b2:0};
const F=new Function('LEADER_NEW_FROM', grabFn('leaderBonusOf')+'\nreturn leaderBonusOf;')('2026-08');
const ROWS=[{id:'A',name:'小安',classes:70},{id:'B',name:'小柏',classes:60},
            {id:'C',name:'小昌',classes:59},{id:'D',name:'小丁',classes:11}];
const MGR=o=>Object.assign({is_manager:true, leader_t1:60, leader_b1:2000, leader_t2:0, leader_b2:0}, o||{});

console.log('① 新制：逐位教練達標');
{
  const r=F(MGR({leader_members:['A','B','C']}), {leaderRows:ROWS}, G, '2026-08');
  eq('★ 名單三位、兩位達到 60 堂 → 兩筆 $2,000', r.pay, 4000);
  eq('　　達標人數就是筆數', r.units, 2);
  eq('★ 沒被打勾的人不算進來（小丁 11 堂不在名單，也不影響）', r.total, 70+60+59);
  ok('★ 明細寫出誰達標，才對得起帳', /2 \/ 3 位達標/.test(r.detail)
     && /小安 70 堂 \$2,000/.test(r.detail) && /小柏 60 堂 \$2,000/.test(r.detail), r.detail);

  const r0=F(MGR({leader_members:['C','D']}), {leaderRows:ROWS}, G, '2026-08');
  eq('★ 名單裡沒人達標 → 0', r0.pay, 0);
  ok('　　也講清楚是「沒人達標」而不是「沒設定」', /名單 2 位，無人達到 60 堂/.test(r0.detail), r0.detail);

  eq('★ 剛好等於門檻算達標（60 堂＝達標，不是要超過）',
     F(MGR({leader_members:['B']}), {leaderRows:ROWS}, G, '2026-08').units, 1);
}

console.log('\n② 名單沒設 → 0，而且說得出原因');
{
  const r=F(MGR({}), {leaderRows:ROWS}, G, '2026-08');
  eq('★ 從來沒設過名單 → 0（不猜「全員」）', r.pay, 0);
  ok('★ 明細直接指路', /尚未設定計算名單（薪資規則 → 店長獎金）/.test(r.detail), r.detail);
  eq('　　名單存成空陣列也一樣', F(MGR({leader_members:[]}), {leaderRows:ROWS}, G, '2026-08').pay, 0);
  ok('　　為什麼不猜全員，寫在程式裡',
     /新制沒有「全員」這個預設可以猜，\n\s*猜出來的金額是憑空生出來的/.test(src));
}

console.log('\n③ 每位店長自己一組設定（分店之後才分得開）');
{
  const a=F(MGR({leader_members:['A','B','C','D'], leader_t1:60, leader_b1:2000}), {leaderRows:ROWS}, G, '2026-08');
  const b=F(MGR({leader_members:['A'], leader_t1:70, leader_b1:5000}), {leaderRows:ROWS}, G, '2026-08');
  eq('★ 甲店長：4 人名單、滿 60 給 2000 → 2 位達標 ＝ $4,000', a.pay, 4000);
  eq('★ 乙店長：只帶小安、滿 70 給 5000 → 1 位達標 ＝ $5,000', b.pay, 5000);
  eq('　　同一份堂數資料，兩位店長各算各的', [a.units,b.units], [2,1]);
  const c=F({is_manager:true, leader_members:['A']}, {leaderRows:ROWS}, G, '2026-08');
  eq('　　個人沒填門檻／金額 → 退回全域預設（60 堂 / $2,000）', [c.t1,c.b1,c.pay], [60,2000,2000]);
}

console.log('\n④ 七月以前照舊制算（歷史薪資不會整片變動）');
{
  const old=F(MGR({leader_members:['A']}), {leaderRows:ROWS}, G, '2026-07');
  eq('★ 舊制看全店總堂數（200 堂 ÷ 80 ＝ 2 筆 × $4,000）', old.pay, 8000);
  eq('　　舊制不看名單，總數是全部人', old.total, 200);
  ok('　　明細維持舊寫法', /全店 200 堂 ÷ 每 80 堂 ＝ 2 筆 × \$4,000/.test(old.detail), old.detail);
  eq('★ 分界就在 2026-08', F(MGR({leader_members:['A']}), {leaderRows:ROWS}, G, '2026-08').pay, 2000);
  ok('　　分界寫成常數，不是散在各處的字串', /const LEADER_NEW_FROM='2026-08';/.test(src));
}

console.log('\n⑤ 不是店長 / 沒有名單資料時不會爆');
{
  eq('　　不是店長 → 0', F({is_manager:false}, {leaderRows:ROWS}, G, '2026-08').pay, 0);
  eq('　　沒帶 leaderRows（不需要算的呼叫）→ 0，detail 是「—」',
     [F(MGR({}), {}, G, '2026-08').pay, F(MGR({}), {}, G, '2026-08').detail], [0,'—']);
  eq('　　沒給 emp → 0', F(null, {leaderRows:ROWS}, G, '2026-08').pay, 0);
  eq('　　沒給月份 → 當成新制（畫面上算的都是當月以後）',
     F(MGR({leader_members:['A','B']}), {leaderRows:ROWS}, G).pay, 4000);
}

console.log('\n⑥ 四個算薪的地方共用同一份名單');
ok('★ 名單抽成共用函式（不再各寫一套「誰算在內」）',
   /function leaderRowsOf\(staff, bookings, month\)\{/.test(src)
   && /\.filter\(o=>o\.role!=='admin' && o\.role!=='front_desk' && o\.status!=='inactive'\)/.test(src));
eq('★ 四處都改用它', (src.match(/leaderRowsOf\(/g)||[]).length, 5);   // 定義 1 ＋ 呼叫 4
eq('★ 舊的 leaderHeads 全部清乾淨', (src.match(/leaderHeads/g)||[]), []);
ok('★ 月份有傳進去（不然新舊制分不出來）',
   /const extras=\{ renewCount:renewById\[emp\.id\]\|\|0, leaderRows, month \};/.test(src)
   && /\{renewCount, leaderRows, month:ym\}/.test(src)
   && /\{renewCount:renewMap\[c\.id\]\|\|0, leaderRows, month\}/.test(src)
   && /\{renewCount, leaderRows, month\}/.test(src));
ok('　　calcSalary 兩條路徑都把月份帶給 leaderBonusOf',
   (src.match(/leaderBonusOf\(emp,extras,G[c]?,extras\.month\)/g)||[]).length===2);

console.log('\n⑦ 薪資規則的設定畫面');
ok('★ 只顯示這個人的身份（原本是四個模式的按鈕列）',
   /<div class="hr-sec">聘僱類型<\/div>/.test(src)
   && /<select id="hr-ettype" onchange="hrPickEt\(this\.value\)">/.test(src)
   && !/onclick="hrPickEt\('\$\{k\}'\)"/.test(src));
ok('　　但仍改得動（聘僱類型在別的地方沒有編輯入口）',
   /const _et=g\('hr-ettype'\)\|\|HR_SAL_ET;/.test(src));
ok('★ 打開店長才出現下面那塊設定', /onchange="hrToggleMgr\(\)"/.test(src)
   && /<div id="hr-mgr-box" style="display:\$\{c\.is_manager\?'block':'none'\};">/.test(src));
ok('★ 有兩組門檻的欄位（門檻②是追加）',
   /<input type="number" id="hr-ldt1" min="1" value="\$\{t1\}">/.test(src)
   && /<input type="number" id="hr-ldb1" min="0" value="\$\{b1\}">/.test(src)
   && /<input type="number" id="hr-ldt2" min="0" value="\$\{t2\}">/.test(src)
   && /<input type="number" id="hr-ldb2" min="0" value="\$\{b2\}">/.test(src));
ok('★ 下方列出全員工，逐一打勾',
   /function hrLeaderBoxHtml\(c\)\{/.test(src)
   && /<input type="checkbox" class="hr-lm" value="\$\{o\.id\}"/.test(src));
ok('　　名單本身排除老闆與櫃台裝置、離職',
   /window\._hrRoster=\(await dbGetAll\('coaches'\)\.catch\(\(\)=>\[\]\)\)\n\s*\.filter\(o=>o\.role!=='admin' && o\.role!=='front_desk' && o\.status!=='inactive'\)/.test(src));
ok('　　店長本人也在名單裡（他自己帶的課也算）', /\$\{o\.id===c\.id\?'<i>（本人）<\/i>':''\}/.test(src));
ok('　　有全選／全不選（十幾個人一個個點很煩）', /onclick="hrLeaderAll\(true\)"/.test(src) && /onclick="hrLeaderAll\(false\)"/.test(src));
ok('★ 一個都沒選時當場警告（不然要等發薪才發現是 0）',
   /<div class="hr-lm-warn">還沒選任何人 → 這位店長的獎金會算 0。<\/div>/.test(src));
ok('★ 存檔存的是這位店長自己的名單與兩組門檻',
   /c\.leader_members=hrReadLeaderMembers\(\);/.test(src)
   && /c\.leader_t1=Number\(g\('hr-ldt1'\)\)\|\|80;/.test(src)
   && /c\.leader_b2=Number\(g\('hr-ldb2'\)\)\|\|0;/.test(src));
ok('★ 取消店長身分就把名單清掉（免得日後重開沿用沒人記得的舊名單）',
   /c\.leader_members=null; c\.leader_t1=null; c\.leader_b1=null; c\.leader_t2=null; c\.leader_b2=null;/.test(src));

console.log('\n⑧ 薪資明細看得到這一行');
/* 0823：三處都改成「列出來＋帶名單」（leaderListHTML），寫法從 `if(x) h+=row(...)`
   變成帶大括號的區塊，所以斷言跟著改；「只要是店長就列」這件事沒有變。 */
ok('★ 只要是店長就列出來（金額 0 時那句「尚未設定名單」才看得到）',
   /if\(sal\.isLeader\)\{$/m.test(src)
   && /if\(sal\.isLeader\)\{ h\+=row\('店長獎金'/.test(src)
   && /if\(s\.isLeader\)\{ h\+=rowL\('店長獎金'/.test(src));
ok('　　為什麼改成 isLeader 而不是 pay>0，寫在程式裡',
   /但那行「尚未設定計算名單」正是最需要被看到的訊息/.test(src));
ok('★ 全域設定改成「新店長的預設值」，並講明實際計算看各店長自己的',
   /\$\{sec\('④ 店長獎金預設值（2026-08 起：逐位教練達標制）'\)\}/.test(src)
   && /實際計算用的是每位店長自己的名單與金額/.test(src));
ok('　　全域預設就是現行的 80\/4000、100\/追加 2000',
   /leader_t1: 80, leader_b1: 4000,\n\s*leader_t2: 100, leader_b2: 2000,/.test(src));
ok('　　舊制的兩個值沒有編輯欄位了，但原值原樣保留（七月以前還要用）',
   /leader_per_classes:\(\(window\.SALARY_GLOBAL\|\|\{\}\)\.leader_per_classes\)\|\|80,/.test(src));
ok('　　每個月一份規則快照（見 payrulemonthtest.js）',
   /function empAtMonth\(emp, ym\)\{/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
