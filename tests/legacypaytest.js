/* 2026-08-02 使用者指示（附薪資 Excel）：
   ①「因為系統從 7 月才正式開始使用，6 月以前的薪資可以用我匯入的這個內容嗎」
   ②「6 月份的就不用列公式了」
   ③「單純紀錄課堂數、值班數、續約數、實領薪資」
   ④「對了還有生日禮金 1000 元」

   六月以前系統裡沒有預約、沒有打卡，任何公式算出來的數字都是憑空生出來的 ——
   所以那些月份一律顯示匯入的紀錄（salary_history），只列使用者要的那幾個數字，
   而且明講「不重新計算」，免得有人以為那是系統算出來的。

   生日禮金則相反：它是規則，可以自動 —— 從員工資料的生日推，只比月份不比日，
   整個生日月都算，發薪時不用去管人是月初還月底生日。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 分界：系統從 2026-07 開始');
{
  const F=new Function("const SYS_PAY_FROM='2026-07';"+grabFn('isLegacyPayMonth')+'\nreturn isLegacyPayMonth;')();
  eq('★ 六月以前 → 用匯入的', [F('2026-06'), F('2026-01'), F('2025-12')], [true,true,true]);
  eq('★ 七月起 → 系統自己算', [F('2026-07'), F('2026-08')], [false,false]);
  ok('　　分界寫成常數', /const SYS_PAY_FROM='2026-07';/.test(src));
  ok('　　原因寫在程式裡',
     /六月以前系統裡沒有預約與打卡資料，任何公式算出來的都是憑空生出來的數字/.test(src));
}

console.log('\n② 匯入的紀錄怎麼取');
ok('★ 一次載入、用 emp|ym 當索引', /function salaryHistoryMap\(\)\{/.test(src)
   && /m\[String\(r\.emp_id\)\+'\|'\+String\(r\.ym\)\]=r;/.test(src));
ok('　　載不到不會炸（新環境還沒有這張表）', /dbGetAll\('salary_history'\)\.catch\(\(\)=>\[\]\)/.test(src));
ok('　　查詢有共用函式', /function salHistOf\(map, empId, ym\)\{/.test(src));

console.log('\n③ 只列使用者要的四個數字，不列公式');
{
  const F=new Function(grabFn('legacyPayRowsHtml')+'\nreturn legacyPayRowsHtml;')();
  const row=(lb,f,v,o)=>`[${lb}|${f}|${v}${o&&o.sum?'|SUM':''}]`;
  const h={pt:63, grp:7, duty:64, renew:1, net:42054, source:'薪資表 PAY 分頁'};
  const out=F(h,row);
  eq('★ 四個數字都在，順序固定',
     out.match(/\[(教練課|團體課|值班|續約|實領薪資)\|/g).map(x=>x.slice(1,-1)),
     ['教練課','團體課','值班','續約','實領薪資']);
  ok('★ 實領是重點（標成合計列）', /\[實領薪資\|[^\]]*\|SUM\]/.test(out), out);
  ok('★ 金額有千分位', /\$42,054/.test(out), out);
  ok('★ 寫出來源，讓人知道這不是系統算的', /來源：薪資表 PAY 分頁/.test(out));
  ok('★ 沒有任何「公式」欄位（使用者：6 月份的就不用列公式了）',
     !/×|÷|每滿|取數字高者/.test(out), out);

  const h2={duty:55, net:10265};
  const out2=F(h2,row);
  eq('★ 只有值班的人就只列值班（沒有的欄位不會列 0）',
     out2.match(/\[([^|]+)\|/g).map(x=>x.slice(1,-1)), ['值班','實領薪資']);
  const out3=F({net:73751},row);
  eq('　　只有實領（2025 以前只匯了金額）也成立',
     out3.match(/\[([^|]+)\|/g).map(x=>x.slice(1,-1)), ['實領薪資']);
  eq('　　沒有紀錄時不會爆', typeof F(null,row), 'string');
  ok('　　小數點的值班時數不會變一長串', /80\.5|64/.test(F({duty:80.5,net:1},row)));
}

console.log('\n④ 三個看得到薪資的地方都改了');
ok('★ 月結彙總：舊月份直接用匯入的實領', /const _legacy=isLegacyPayMonth\(month\);/.test(src)
   && /return \{ emp, countSalary:!!h, legacy:true, hist:h,/.test(src));
ok('　　沒有匯入紀錄的人記 0，不會憑空算一個出來',
   /const net=Math\.round\(Number\(h&&h\.net\)\|\|0\);/.test(src));
ok('★ 月結的展開明細也不列公式', /if\(r\.legacy\)\{/.test(src)
   && /系統從 2026 年 7 月開始使用，這個月份是匯入的紀錄，不重新計算。/.test(src));
ok('★ 薪資單（含彈窗）：舊月份走匯入版面', /if\(isLegacyPayMonth\(month\)\)\{/.test(src)
   && /const _lh=salHistOf\(await salaryHistoryMap\(\), empId, month\);/.test(src));
ok('　　舊月份仍可翻月、挑月份（不是死路）',
   /const _lpick=withHead\?'salaryPickMonth\(this\.value\)':'salarySheetPickMonth\(this\.value\)';/.test(src));
ok('　　沒有紀錄時給空狀態並說明原因',
   /2026 年 7 月以前的薪資由匯入資料提供。/.test(src));
ok('★ 營運分析點進去的表現視窗：舊月份走另一個視窗',
   /if\(isLegacyPayMonth\(ym\)\)\{ return openLegacyPerfDetail\(emp, ym\); \}/.test(src)
   && /async function openLegacyPerfDetail\(emp, ym\)\{/.test(src));
/* note 是給「推算／待確認」的資料用的欄位。2026-08-02 使用者回覆「羅威跟 eric 不用扣勞健保」
   之後，目前沒有任何一筆帶 note —— 但欄位與顯示要留著，下次匯入還會用到。 */
ok('　　有 note 的紀錄會把說明標出來（推算或待確認的資料）',
   /\$\{h\.note\}/.test(src) && /\$\{_lh\.note\}/.test(src)
   && /if\(r\.hist\.note\)/.test(src));

console.log('\n⑤ 生日禮金');
{
  const G={birthday_bonus:1000};
  const code=`const G=${JSON.stringify(G)};
    const emp=EMP, extras=EX;
    const _bd=String((emp&&(emp.birthday||emp.birth_date))||'');
    const isBday=!!(extras.month && _bd.length>=7 && _bd.slice(5,7)===String(extras.month).slice(5,7));
    const bdayPay=isBday?(Number(G.birthday_bonus)||0):0;
    const bdayDetail=isBday?\`\${_bd.slice(5,7)}/\${_bd.slice(8,10)} 生日\`:'';
    return {isBday, bdayPay, bdayDetail};`;
  const f=(emp,month)=>new Function('EMP','EX',code)(emp,{month});
  eq('★ 生日當月 +1000', f({birthday:'2001-05-29'},'2026-05').bdayPay, 1000);
  eq('★ 其他月份 0', f({birthday:'2001-05-29'},'2026-06').bdayPay, 0);
  eq('★ 只比月份不比日：月底生日也是整個月都算',
     [f({birthday:'1988-04-30'},'2026-04').bdayPay, f({birthday:'2003-12-01'},'2026-12').bdayPay], [1000,1000]);
  eq('　　明細寫出是哪天生日', f({birthday:'2001-05-29'},'2026-05').bdayDetail, '05/29 生日');
  eq('　　沒填生日 → 不給（不會誤發）', f({},'2026-05').bdayPay, 0);
  eq('　　舊欄位 birth_date 也認', f({birth_date:'1987-09-08'},'2026-09').bdayPay, 1000);
  eq('　　沒帶月份時不判定（避免不知道在算哪個月就發錢）', f({birthday:'2001-05-29'},undefined).bdayPay, 0);
}
ok('★ 生日禮金算進應發', /const grossPay = ptIncome \+ bonus \+ groupPay \+ dutyPay \+ renewPay \+ mgmtPay \+ bdayPay;/.test(src));
ok('★ 金額是全域設定，不寫死在計算裡', /birthday_bonus: 1000,/.test(src)
   && /const bdayPay=isBday\?\(Number\(G\.birthday_bonus\)\|\|0\):0;/.test(src));
ok('　　設定畫面改得到', /<input type="number" id="sg-bday" value="\$\{G\.birthday_bonus\?\?1000\}">/.test(src)
   && /birthday_bonus:gv\('sg-bday'\)\?\?1000,/.test(src));
ok('　　全域制度卡看得到這一條', /\$\{grow\('生日禮金',money\(G\.birthday_bonus\?\?1000\)\+'（生日當月自動加給）'\)\}/.test(src));
ok('★ 三處薪資明細都列得出來（月結表格、月結卡片、個人薪資頁）',
   (src.match(/生日禮金'/g)||[]).length>=3);
ok('　　為什麼只比月份，寫在程式裡',
   /只比月份不比日：整個生日月都算，發薪時不用去care是月初還月底生日。/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
