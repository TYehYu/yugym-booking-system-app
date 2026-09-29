/* 生日禮金的開關（2026-09-29）

   使用者：「生日禮金可以手動調整嗎　我要取消rocky的」→ 選「每位員工一個開關」。
   Rocky（林柏灝）是合作教練，10/17 生日，9 月薪資單（10/5 發）本來會自動加 1,000。

   ⚠ 欄位存的是**關掉**（birthday_bonus_off，預設 false＝照發）——
     這樣既有員工一個都不用回填。畫面上那一格是「發生日禮金」，所以讀寫要反過來。 */
const fs=require('fs');
const P=process.env.HOME+'/Projects/yugym-booking-system-app/';
const src=fs.readFileSync(P+'index.html','utf8');
const mig=fs.readFileSync(P+'docs/migrations/20260929_employees_birthday_bonus_off.sql','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 資料庫：預設照發，既有員工不必回填');
ok('★★★ 欄位預設 false（＝照發）', /add column if not exists birthday_bonus_off boolean not null default false;/.test(mig));
ok('★★ 既有的表不需要 GRANT，理由寫在檔裡', /不需要 GRANT：employees 是既有的表/.test(mig));
ok('★★ 欄位有註解（日後查得到為什麼有這一欄）', /comment on column public\.employees\.birthday_bonus_off/.test(mig));
/* ⚠ 使用者選的是「每位員工一個開關」，不是「合作教練一律不發」——
   不可以偷偷在程式裡按 employment_type 判斷。 */
ok('★★★ 沒有偷偷按員工類型判斷（規則由人決定）',
   !/contractor[^\n]*birthday|birthday[^\n]*contractor/.test(src.replace(/\/\*[\s\S]*?\*\//g,' ')));

console.log('\n② 薪資計算吃這個開關');
{
  const m=src.match(/const isBday=[^\n]*\n\s*const bdayPay=[^\n]*/);
  const code=m?m[0]:'';
  ok('★★★ 關掉的人不算生日禮金', /&& !\(emp&&emp\.birthday_bonus_off\)/.test(code), code);
  /* 實跑：把那兩行抽出來，四種組合各驗一次 */
  const run=(bd,payMM,off)=>{
    const emp={birthday:bd, birthday_bonus_off:off};
    const G={birthday_bonus:1000};
    return new Function('emp','G','_bd','_payMM', code+'\nreturn bdayPay;')(emp,G,bd,payMM);
  };
  eq('★★★ 10 月壽星、開關開著 → 1000', run('1991-10-17','10',false), 1000);
  eq('★★★ 10 月壽星、開關關掉 → 0（Rocky 這一位）', run('1991-10-17','10',true), 0);
  eq('★★ 不是生日月 → 0', run('1991-10-17','09',false), 0);
  eq('★★ 沒設過這個欄位的人照發（undefined 視同照發）', run('1991-10-17','10',undefined), 1000);
}

console.log('\n③ 畫面：工作規則那一格');
ok('★★★ 開關在「工作規則」視窗，與需打卡那幾格同一區',
   /<span>🎂　發生日禮金<\/span><input type="checkbox" id="sch-bday" \$\{c\.birthday_bonus_off\?'':'checked'\}/.test(src));
/* ⚠ 欄位存「關掉」、畫面問「發不發」，兩邊是反的 —— 寫錯方向會變成一按就關掉所有人。 */
ok('★★★ 存檔時反過來寫（勾著＝照發）',
   /c\.birthday_bonus_off=!document\.getElementById\('sch-bday'\)\.checked;/.test(src));
ok('★★ 員工列表的 🎂 不再亮金，也不寫「會發放」',
   /const _off=!!\(c&&c\.birthday_bonus_off\);/.test(src)
   && /const hit=!!payMM && payMM===bd\.slice\(5,7\) && !_off;/.test(src)
   && /這位不發生日禮金/.test(src));
ok('★★ 生日本身照樣顯示（只是不發禮金）', /🎂 \$\{md\}/.test(src));
/* ⚠ 2026-09-29 使用者附截圖「這邊還有紅包」—— 薪資那邊不算了，紅包還亮著就是在騙人。
   三處要吃同一個開關：calcSalary 的 bdayPay、stBdayTag 的 🎂、員工列表那一枚 🧧。 */
ok('★★★ 員工列表的 🧧 紅包也不掛',
   /if\(c&&c\.birthday_bonus_off\) return '';/.test(src)
   && /st-l-red/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
