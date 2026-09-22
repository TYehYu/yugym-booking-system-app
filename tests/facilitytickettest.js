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

/* ⚠⚠ 2026-09-22 使用者回報：「我前一頁選了魚先森　這邊跑出來變曹子安」——
   把名單濾成「只有教練」之後生出來的 bug：魚先森不是教練 → 沒有任何 option 帶 selected
   → 瀏覽器預設顯示**第一個**（曹子安）。櫃檯可能就這樣賣給錯的人，
   而且金額與發票都已經填好了。
   ⚠ 這個坑在濾名單之前就存在（原本列全部會員，所以幾乎踩不到），濾完變成常態。
   ⚠ 另外兩條銷售路徑（團課體驗／自訂）用的 memOpts 本來就有空白首項，
     只有場租這張漏了 —— 0728 定的規矩是「不預設會員，避免沒注意賣給名單第一位」。 */
console.log('\n④ 前一頁選的人不在名單裡，不可以靜靜換成別人');
{
  const S=grab('salesFacility');
  ok('★★★ 不合格的預選 → 直接擋下，不畫表單',
     /if\(_fpre && !members\.some\(m=>m\.id===_fpre\)\)\{/.test(S));
  ok('★★★ 要講出**是誰**、以及為什麼不行（不是一句「不能買」）',
     /const _who=\(\(_mAll\|\|\[\]\)\.find\(m=>m\.id===_fpre\)\|\|\{\}\)\.name\|\|'這位會員';/.test(S)
     && /\$\{escH\(_who\)\}不能買場租票/.test(S)
     && /場租票只賣給有會員帳號的教練（姓名與電話與員工資料一致）/.test(S));
  ok('★★★ 沒有預選時，下拉第一項是空的（不要拿名單第一位當預設）',
     /<option value="" \$\{_fpre\?'':'selected'\}>— 請選擇 —<\/option>/.test(S));
  ok('★★ 與 0728「不預設會員」同一條規矩（另外兩條銷售路徑本來就有）',
     /不預設會員——空白首選項，避免沒注意賣給名單第一位/.test(src));
  ok('★★ 成因寫在原地（濾名單之後這個坑從「幾乎踩不到」變成常態）',
     /瀏覽器預設顯示\*\*第一個\*\*（曹子安）/.test(src));
}

/* 2026-09-22 使用者：「或者銷售不能購買也要顯示但是要暗化　副標說明」——
   就是 yugym-disabled-with-reason 那條語彙，跟課卡「調整課程」同一套（.ash-ei-off）。
   原本我做成「點進去才擋一張視窗」，使用者要的是**在選單上就看得出來**。 */
console.log('\n⑤ 買不到的項目在選單上暗化＋寫原因');
{
  const S=grab('slCourseOpen');
  ok('★★★ 暗化那一項點不動（onclick 是空的）',
     /onclick="\$\{off\?'':`slCoursePick\('\$\{c\.k\}'\)`\}"/.test(S)
     && /class="ash-eirow\$\{off\?' ash-ei-off':''\}"/.test(S));
  ok('★★★ 副標換成原因（不是留著原本那句沒用的副標）',
     /<span class="ash-eisub">\$\{off\|\|c\.sub\}<\/span>/.test(S));
  ok('★★★ 原因要講出**是誰**不能買', /\$\{_memNm\|\|'這位會員'\}不是教練 —— 場租票只賣給有會員帳號的教練/.test(S));
  ok('★★ 還沒選會員時講的是另一件事（不要誤說他不是教練）',
     /if\(!_mid\|\|_mid==='__walkin__'\) return '請先在上方選擇會員';/.test(S));
  ok('★★ 只有場租有條件，其他項目一律可買', /if\(c\.k!=='facility'\) return '';/.test(S));
  ok('★★★ 畫面擋掉之後，salesFacility 那道檢查仍然留著（規則不能只寫在畫面上）',
     /if\(_fpre && !members\.some\(m=>m\.id===_fpre\)\)\{/.test(src)
     && /showToast\('場租票只賣給有會員帳號的教練'\); return;/.test(src));
}

/* 2026-09-22 使用者：「上方說明是不是可以優化一下」——
   那段四行說明三句話各有各的問題：
   ・「1 次…效期 7 天」是寫死的，而下面的方案欄位已經寫著「10 堂・效期 180 天」→ 互相打架
   ・「只列得出有會員帳號的教練」在上一層（選擇課程）已經暗化＋寫原因了
   ・「使用時在『新增預約』選場地租借…」是操作說明，賣票當下用不到
   取代它的是「效期 X ～ Y」一行 —— **與其解釋規則，不如把結果算出來**。 */
console.log('\n⑥ 上方說明收掉，改成算出實際效期');
{
  const S=grab('salesFacility'), T=grab('fvSyncTerm');
  const codeOnly=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^[ \t]*\/\/.*$/gm,'');
  ok('★★★ 那段寫死「1 次…效期 7 天」的說明已移除',
     !/1 次場地租借，效期 <b>7 天<\/b>/.test(codeOnly));
  ok('★★★ 改成印出這張票實際能用到哪一天',
     /<div class="qs-tnote" id="fv-term"/.test(S)
     && /\$\{String\(st\)\.replace\(\/-\/g,'\/'\)\} ～ \$\{String\(ex\|\|''\)\.replace\(\/-\/g,'\/'\)\}/.test(T));
  ok('★★★ 走 termExpire（與真正發票券時同一支，講的與實際發的一致）',
     /const ex=termExpire\(st,p\.days\);/.test(T)
     && /const expire=termExpire\(start,_fvSel\.days\);/.test(src));
  ok('★★ 換方案或改啟用日都要重算',
     /onchange="fvSyncTerm\(\)"/.test(S) && /fvSyncTerm\(\);\s*\n\s*fvInvSync\(\);/.test(src));
  ok('★★ 開窗就先算一次（不要等使用者去動欄位才出現）',
     /fvSyncTerm\(\);   \/\* 開窗就把/.test(S));
  /* 2026-09-22 二修（使用者：「效期這個斷句是不是可以優化一下」）——
     斷句是表面，根本原因是**那一行有一半在重複上面的下拉**（10 堂、180 天各寫兩次）。
     兩邊各留自己該講的：下拉講「哪個方案・幾堂・多少錢」，這一行講「實際能用到哪一天」。
     ⚠ 實測（375px）：改前折 2 行、下拉文字 287px 塞不進 223px（被截掉的正好是 $2,000）；
       改後 1 行、下拉 199.7px 不會被截。 */
  ok('★★★ 這一行只寫實際起訖日（堂數與天數上面已經有了）',
     /box\.innerHTML=`效期 <b style="white-space:nowrap;">/.test(T)
     && !/\$\{p\.n\} 堂/.test(T) && !/含啟用日）`/.test(T));
  ok('★★★ 日期用 nowrap 鎖住（要折只能折在「效期」後面，不能把日期拆兩半）',
     /white-space:nowrap;/.test(T));
  ok('★★★ 下拉不寫效期天數 —— 寫了會太長被截，而截掉的正好是價格',
     /`<option value="\$\{i\}">\$\{escH\(p\.name\)\}　\$\{p\.n\} 堂・\$\$\{p\.amt\.toLocaleString\(\)\}<\/option>`/.test(src)
     && /被截掉的正好是最重要的價格/.test(src));
  /* ⚠ 這一條刻意不寫成「註解裡有沒有那串數字」—— 那種斷言只是在檢查我自己抄對沒，
     真正值得守的是「下拉不要再長回去」。用字元數當上限：
     實測 375px 下，下拉可用寬 223px、目前選項文字 199.7px。 */
  ok('★★ 下拉選項不要再長回去（加東西之前先量）',
     /堂・\$\$\{p\.amt\.toLocaleString\(\)\}<\/option>/.test(src)
     && !/效期 \$\{p\.days\} 天・/.test(src));
  ok('★★ 移除的理由寫在原地（三句話各為什麼該走）',
     /兩個數字互相打架，櫃檯不知道要信哪個/.test(src)
     && /是\*\*操作說明\*\*，賣票的當下用不到/.test(src));
}

console.log('\n⑦ 沒有動到等級（使用者原提議，刻意不採用）');
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
