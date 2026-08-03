/* 2026-08-03 使用者回報（截圖：會員「陳詠菱0976157559」）：
   「為什麼出現這個名字？電話掛在姓名也不應該通過吧」

   對，五個會建/改會員姓名的入口原本都只驗手機格式、不驗姓名 ——
   姓名欄貼進「名字＋電話」照樣建檔。共用 memNameErr：連續 6 位以上數字
   ＝電話黏進姓名，擋下並指路。不全面禁數字（外文名/暱稱帶 1、2 個數字不誤殺）。
   正式庫那筆已改回「陳詠菱」（電話欄本來就有號碼）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 判定（實跑 memNameErr）');
{
  const f=new Function('return '+grabFn('memNameErr'))();
  ok('★ 截圖的案例被擋', !!f('陳詠菱0976157559'));
  ok('★ 純電話當姓名被擋', !!f('0976157559'));
  ok('★ 正常中文名通過', f('陳詠菱')===null);
  ok('★ 外文名通過', f('Mango Huang')===null);
  ok('★ 暱稱帶少量數字通過（不誤殺）', f('小明2號')===null && f('Amy123')===null);
  ok('★ 錯誤訊息有指路（電話填手機欄）', /請把電話填在手機欄位/.test(f('王0912345678')));
}

console.log('\n② 五個入口都掛上');
ok('★ 後台新增會員', /if\(memNameErr\(name\)\)\{showErr\(memNameErr\(name\)\);return;\}/.test(src));
ok('★ 待簽約卡位建會員（客戶姓名）', /if\(memNameErr\(tname\)\)\{showToast\(memNameErr\(tname\)\);return;\}/.test(src));
ok('★ 會員首次登入設定', /if\(memNameErr\(v\('ms-name'\)\)\)\{err\.textContent=memNameErr\(v\('ms-name'\)\);/.test(src));
ok('★ 會員資料編輯（統一版，只驗會員不驗員工）',
   /if\(PP\.kind==='member' && typeof memNameErr==='function' && memNameErr\(d\.name\)\)\{ showToast\(memNameErr\(d\.name\)\); return; \}/.test(src));
ok('★ 會員自助註冊＋自助申辦',
   /if\(memNameErr\(name\)\)\{showErr\(memNameErr\(name\)\);return;\}/.test(src)
   && /if\(memNameErr\(name\)\)\{ showToast\(memNameErr\(name\)\); return; \}/.test(src));
ok('　　案例寫在程式裡', /「陳詠菱0976157559」/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
