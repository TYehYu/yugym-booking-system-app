/* 2026-09-22 使用者定案：「所以這四位教練無法購買場租 要等他們有辦理會員帳號才可以
     然後其他會員也不能買場租票 只有教練＋會員身份才可以」
   ＋（對做法的顧慮）「如果不會導致其他會員買到場租票 就沒關係」

   ⚠ 使用者原本提議「把教練的會員帳號等級改成一個新的［教練］」—— **沒有這樣做**。
     等級只有 regular／loyal／vip 三值而且每月自動算（effTier），
     加第四值要同步改 tierIsVip／lottoIsVip／抽獎／方案定價多處；
     而且語意錯：等級講「買多少、來多少」，不是「你是誰」。
     改用「姓名＋電話都對得上員工」來認人，不加欄位、不動等級、自己維護。

   ⚠ 這支守的核心就是使用者那句顧慮：**別的會員不可以被放進來**。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const F=new Function(grab('memMatchesStaff')+'\nreturn memMatchesStaff;')();
const E=[
  {name:'曹子安', phone:'0939178450', status:'active'},
  {name:'羅威',   phone:'0912-345-678', status:'active'},
  {name:'林柏灝', phone:'0900000001', status:'active'},
  {name:'離職教練', phone:'0955555555', status:'inactive'},
];

console.log('① 誰買得到');
ok('★★★ 教練＋會員（姓名與電話都對得上）→ 可以',
   F({name:'曹子安',phone:'0939178450'}, E)===true);
ok('★★ 電話格式不同（有無橫線）照樣認得出來 —— 只比數字',
   F({name:'羅威',phone:'0912345678'}, E)===true
   && F({name:'羅威',phone:'(09) 1234-5678'}, E)===true);

console.log('\n② 別的會員不可以被放進來（使用者的顧慮）');
ok('★★★⚠ 同名但電話不同 → 擋掉（這就是「不會導致其他會員買到場租票」）',
   F({name:'曹子安',phone:'0988888888'}, E)===false);
ok('★★★ 電話一樣但不同名 → 擋掉', F({name:'路人甲',phone:'0939178450'}, E)===false);
ok('★★★ 一般會員 → 擋掉', F({name:'陳秀蘭',phone:'0922333444'}, E)===false);
ok('★★★ 離職員工 → 擋掉（status inactive 不算）',
   F({name:'離職教練',phone:'0955555555'}, E)===false);
ok('★★★ 會員沒填電話 → 擋掉（不能讓「兩邊都空」算成對上）',
   F({name:'林柏灝',phone:''}, E)===false && F({name:'林柏灝',phone:null}, E)===false);
ok('★★ 員工沒填電話也不算對上',
   F({name:'無話員工',phone:'0911111111'}, [{name:'無話員工',phone:'',status:'active'}])===false);
ok('★ 空物件／空名單不會爆', F(null,E)===false && F({name:'曹子安',phone:'0939178450'},[])===false);

console.log('\n③ 接線');
{
  const S=grab('salesFacility'), T=grab('submitFacilityTicketSale');
  ok('★★★ 會員下拉只列得出教練會員', /memMatchesStaff\(m,_emps\)/.test(S));
  ok('★★★⚠ 送出端再擋一次（規則不能只寫在畫面上）',
     /if\(!memMatchesStaff\(_m, window\._fvStaffEmps\|\|\[\]\)\)\{/.test(T)
     && /showToast\('場租票只賣給有會員帳號的教練'\); return;/.test(T));
  ok('★★ 一個教練會員都沒有時，講清楚要怎麼辦（不是丟一張空的下拉）',
     /目前沒有任何教練辦過會員帳號/.test(S) && /姓名與電話要與員工資料一致/.test(S));
  ok('★★ 視窗上說明為什麼名單這麼短', /只列得出有會員帳號的教練/.test(S));
}

console.log('\n④ 沒有動到等級（使用者原提議，刻意不採用）');
{
  const codeOnly=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^[ \t]*\/\/.*$/gm,'');
  ok('★★★ 等級沒有多出「教練」這個值', !/level==='教練'|tier_manual==='教練'/.test(codeOnly));
  ok('★★ 不採用的理由寫在原地（免得有人再提一次）',
     /等級只有 regular／loyal／vip 三值而且每月自動算（effTier）/.test(src)
     && /等級講「買多少、來多少」，不是「你是誰」/.test(src));
  ok('★★ 查證數字寫在原地（下次不用重查）',
     /姓名＋電話都對得上的正好 7 位/.test(src)
     && /只有姓名對得上、電話不同的：\*\*0 筆\*\*/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
