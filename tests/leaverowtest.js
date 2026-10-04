/* 班表請假列收成一列 ＋ 新增喪假（2026-09-30 使用者）：
   「班表更新 統一列出一列是請假 在這一列上顯示請假的員工縮寫
     減少下方因為某員工請假一天卻要多一整列」
   「用教練各自代表的色號顯示 前面可以多一個[事][特][病][喪] 代表假別」
   「假別可以放在左邊嗎 跟員工姓名同一列 這樣可以減少一列」
   「B 喪假要加 不扣薪」

   0929 是「一個教練就一列」—— 9 月五個人請過假就多五列 175px，大半是空格子。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 縮寫：中文一個字、英文兩個字母');
{
  const F=new Function('return '+g('function shLvAbbr(c){','\n}'))();
  /* ⚠ 為什麼中文只能一個字：量過「小曾」那一枚 51px，格子可用寬只有 48px，會被切掉。 */
  eq('★★★ 英文名取前兩個字母大寫', [F({name_en:'Randy'}),F({name_en:'Sandy'}),F({name_en:'Mango'}),F({name_en:'Ann'})],
     ['RA','SA','MA','AN']);
  eq('★★★ name_en 放中文暱稱 → 取最後一個字（小曾→曾、石頭→頭）',
     [F({name_en:'小曾',name:'曾邦宏'}), F({name_en:'石頭',name:'翁立安'}), F({name_en:'羅威',name:'羅威'})],
     ['曾','頭','威']);
  eq('★★ 沒有 name_en 就取中文名最後一個字', F({name:'黃美蓉'}), '蓉');
  eq('★★ 都沒有也不會爆', [F(null), F({}), F({name:'',name_en:''})], ['—','—','—']);
  /* ⚠ 與課卡的 coachAbbr 刻意不同（那支中文取兩個字）—— 別為了「統一」改過去 */
  ok('★★★ coachAbbr 沒有被一起改掉（課卡那邊的格子寬得多）',
     /if\(zh\)\{ return zh\.length<=3 \? zh : zh\.slice\(-2\); \}/.test(src));
  ok('★★ 理由寫在原地（量過的數字）',
     /量過\*\*中文兩個字會爆\*\*/.test(src) && /格子可用寬只有 48px/.test(src));
}

console.log('\n② 假別取一個字');
{
  const F=new Function('shIsClassLeave','return '+g('function shLvKind(s){','\n}'))
    (s=>!!(s&&s.leave_type==='教練請假'));
  eq('★★★ 特／病／事／喪／其', ['特休','病假','事假','喪假','其他'].map(t=>F({leave_type:t})),
     ['特','病','事','喪','其']);
  eq('★★★ 教練請假寫「假」（取第一個字是「教」，看不懂）', F({leave_type:'教練請假'}), '假');
  eq('★★ 沒有假別就不畫', [F(null), F({}), F({leave_type:''})], ['','','']);
}

console.log('\n③ 收成一列');
{
  const R=g('  + (()=>{\n    const _lv=shDropDupLeave(monthShifts.filter(s=>s&&s.leave_type&&!shIsSub(s)));','  })();');
  ok('★★★ 整個請假區只畫一個 <tr>', (src.match(/<tr class="sh-lvrow">/g)||[]).length===1);
  ok('★★★ 左欄固定寫「請假」，不再是某個人的名字',
     /<span class="shn-name">請假<\/span>/.test(R) && /\$\{_n\} 位・滑過去看全名/.test(R));
  ok('★★★ 一格裡多人就直向堆（同一天兩位以上）',
     /<span class="sh-lvwrap">\$\{list\.map\(s=>\{/.test(R));
  /* 同一個人同一天可能有兩筆（上午特休、晚上那堂又標教練請假）—— 各畫一枚 */
  ok('★★ 同一天同一人的兩筆各畫一枚（假別不一樣，合併就看不出是哪種）',
     /同一個人同一天可能有兩筆/.test(R) && !/new Set\(list\.map/.test(R));
  ok('★★ 同一格內照姓名排（不然每次重畫順序會跳）',
     /\.sort\(\(a,b\)=>String\(_nameOf\(a\.emp_id\)\)\.localeCompare\(String\(_nameOf\(b\.emp_id\)\),'zh-Hant'\)\)/.test(R));
  ok('★★★ 沒有人請假就整列不畫', /if\(!_lv\.length\) return '';/.test(R));
  ok('★★ 天數與人數分開寫（N 天是筆數、N 位是人頭）',
     /\$\{_lv\.length\} 天/.test(R)
     && /const _n=\[\.\.\.new Set\(_lv\.map\(s=>String\(s\.emp_id\|\|''\)\)\)\]\.filter\(Boolean\)\.length;/.test(R));
}

console.log('\n④ 膠囊：假別在左、縮寫在右（使用者挑的 B 案）');
{
  const R=g('  + (()=>{\n    const _lv=shDropDupLeave(monthShifts.filter(s=>s&&s.leave_type&&!shIsSub(s)));','  })();');
  ok('★★★ 一枚章分兩段，假別段在前', /<span class="sh-lvk\$\{shIsClassLeave\(s\)\?' k-cls':''\}">/.test(R)
     && R.indexOf('sh-lvk')<R.indexOf('sh-lvnm'));
  ok('★★★ 縮寫用教練自己的代表色（行事曆課卡同一組 coachTagColor）',
     /coachTagColor\(s\.emp_id\)/.test(R)
     && /<span class="sh-lvnm" style="background:\$\{col\.bg\};color:\$\{col\.fg\};">/.test(R));
  ok('★★ 拿不到色時退回中性灰，不要整枚不見',
     /:\{bg:'#EAE6DE',fg:'#6a655c'\};/.test(R));
  ok('★★★ 教練請假的假別段畫淡一階（那天他值班照上）',
     /\.sh-lvk\.k-cls\{background:rgba\(45,36,28,\.3\);\}/.test(src));
  ok('★★ 全名與時數寫進 title，不佔格子寬度',
     /const _t=`\$\{_nameOf\(s\.emp_id\)\}　\$\{s\.leave_type\|\|'請假'\}\$\{s\.leave_hours\?` \$\{s\.leave_hours\} 小時`:''\}`;/.test(R));
  /* ⚠ 尺寸是量出來的（Playwright），不是心算 —— 動之前先量 */
  ok('★★★ CSS 尺寸就是量出來那一組', /\.sh-lvk\{font-size:9px;font-weight:800;color:#fff;background:rgba\(45,36,28,\.55\);/.test(src)
     && /\.sh-lvnm\{font-size:9\.5px;font-weight:800;padding:3px;/.test(src)
     && /這組數值下最寬的一枚 47px/.test(src));
  ok('★★ 膠囊要 overflow:hidden（兩段才會被圓角切齊）',
     /\.sh-lv1\{display:inline-flex;align-items:stretch;line-height:1;border-radius:4px;overflow:hidden;\}/.test(src));
}

console.log('\n⑤ 喪假：新的假別，不扣薪');
{
  const F=new Function('return '+g('function leaveSummary(shifts, empId, month){','\n}'))();
  const sh=(t,h)=>({emp_id:'E1',date:'2026-09-05',leave_type:t,leave_hours:h,hours:8});
  const r=F([sh('喪假',8), sh('特休',6), sh('事假',4), sh('病假',2), sh('其他',3)], 'E1', '2026-09');
  eq('★★★ 喪假自己一桶', [r.喪假, r.特休, r.事假, r.病假, r.其他], [8,6,4,2,3]);
  eq('★★★ 喪假算進請假總時數', r.leaveTotal, 23);
  /* ⚠ 不扣薪＝不進事假／病假那兩桶，calcSalary 只從那兩桶扣錢 */
  ok('★★★ calcSalary 只扣事假（全扣）與病假（半薪），喪假碰不到',
     /const leavePersonal = \(L\.事假\|\|0\); \/\/ 事假時數/.test(src)
     && /const leaveSick = \(L\.病假\|\|0\);/.test(src)
     && /const baseLeaveDeduct = baseLeavePersonalDed \+ baseLeaveSickDed;/.test(src)
     && !/L\.喪假/.test(src));
  ok('★★★ 排班視窗選得到「喪假（不扣薪）」',
     /<option value="喪假"\$\{cur\.leave_type==='喪假'\?' selected':''\}>喪假（不扣薪）<\/option>/.test(src));
  ok('★★★ 兩張薪資單都列得出來（管理員的、教練自己的）',
     /r\.leave\.喪假>0/.test(src) && /myLeave\.喪假>0/.test(src));
  ok('★★ 預設桶也補上喪假（沒有請假的人不會變成 undefined）',
     (src.match(/\{特休:0,病假:0,事假:0,喪假:0,其他:0\}/g)||[]).length===2);
  ok('★★ 法源與「系統不管上限」寫在原地',
     /勞工請假規則第 3 條/.test(src) && /系統不自動管上限/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
