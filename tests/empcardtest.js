/* 員工資料卡（2026-09-29 改版）

   使用者：「優化員工資訊卡」→ 四種排列裡選了「左右分組」。
   原本七個欄位擠成三行、標籤與值同一級，得一直左右切換才讀得到一項。

   改成：姓名那一列 ／ 身分章自己一列 ／ 下面左「聯絡」右「任職」，
   每一格「小字標籤在上、值在下」。卡片不吃滿版（使用者：「可以改小張一點」）。

   ⚠⚠ 這一支**實跑** ppHeaderHtml —— 0929 那次「我的票券」整頁掛掉就是
     「函式簽名少一個參數」，只比對字串的測試看不出來（見 memtkrendertest）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=n=>{let i=src.indexOf('function '+n+'(');
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const EMP={id:'c-1',name:'余東翰',name_en:'CHRIS',job_title:'主管',hire_date:'2026-08-01',
  phone:'0933051426',email:'wishdon123@gmail.com',employment_type:'full_time',status:'active',
  is_manager:true,need_duty:true,need_punch:true,line_user_id:'U123'};

function render(emp, opts){
  const o=opts||{};
  const g={
    PP:{kind:'employee',rec:emp,id:emp.id,editing:false,tab:'base'},
    SESSION:o.session||{role:'admin',id:'admin-1'},
    escH:s=>String(s==null?'':s), fmtPhone:p=>String(p||''),
    ppSelfView:()=>false, isDeskLike:()=>o.desk!==false, isRealAdmin:()=>true,
    normEmp:()=>emp.employment_type||'full_time',
    EMP_RULES:{full_time:{leaveApplicable:true,label:'正職'},
               contractor:{leaveApplicable:false,label:'合作'}},
    ppAlAvailable:()=>o.al!=null?o.al:0,
    empAtMonth:(c)=>c, ymd:()=>'2026-09-29', TODAY:new Date(2026,8,29),
    window:{}, document:{getElementById:()=>null},
  };
  /* 這一頁牽到三四十支小工具，一個個做替身不划算 —— 用 Proxy 當作用域，
     沒定義的名字一律回「回空字串」的函式。
     ⚠ 全域的 String／Number／Math 要放行：攔掉 String(x) 會回空字串，
       畫面就無聲地少一格（第一版因此誤判到職日「未填」）。 */
  const scope=new Proxy(g,{ has:()=>true,
    get:(t,k)=> (k in t) ? t[k] : ((k in globalThis) ? globalThis[k] : (()=>'')) });
  return new Function('scope','with(scope){ '+grab('ppHeaderHtml')+'\nreturn ppHeaderHtml(); }')(scope);
}

console.log('① 畫得出來（實跑）');
{
  let html='',err='';
  try{ html=render(EMP); }catch(e){ err=(e&&e.message)||String(e); }
  ok('★★★ 不拋錯', !err, err);
  ok('★★★ 走員工卡那一支（.pp-head-emp），不是會員那一支', /pp-head-emp/.test(html) && !/pp-head-m2/.test(html));
  ok('★★★ 聯絡組：電話／Email／LINE',
     /<div class="ppf-gl">聯絡<\/div>/.test(html) && /0933051426/.test(html)
     && /wishdon123@gmail\.com/.test(html) && /已綁定/.test(html));
  ok('★★★ 任職組：對外名稱／職稱／到職日／特休',
     /<div class="ppf-gl">任職<\/div>/.test(html) && /CHRIS/.test(html)
     && /主管/.test(html) && /2026\/08\/01/.test(html) && /特休/.test(html));
  ok('★★ 到職日用斜線（連字號在窄格子裡會被折成兩行）', /2026\/08\/01/.test(html) && !/2026-08-01/.test(html));
  ok('★★ 身分章是金色的 .ppf-chip（綠色在這張卡上已經是「在職」）',
     /<span class="ppf-chip">主管<\/span>/.test(html) && /ppf-chip">值班/.test(html));
  ok('★★★ 每一格都可點編輯（沿用 ppInlineEdit，互動沒變）',
     (html.match(/ppInlineEdit\(event,'(phone|email|name_en|job_title|hire_date)'\)/g)||[]).length===5);
}

console.log('\n② 沒填的欄位');
{
  const html=render(Object.assign({},EMP,{name_en:'',job_title:'',email:'',hire_date:null,line_user_id:null}));
  ok('★★ 空欄位寫「未填」而不是空白格', (html.match(/ppf-none">未填/g)||[]).length>=3);
  ok('★★ 沒綁 LINE 寫「＋ 綁定」', /ppf-none">＋ 綁定/.test(html));
}

console.log('\n③ 合作教練的特休');
{
  const html=render(Object.assign({},EMP,{employment_type:'contractor'}));
  /* ⚠ 0 會被讀成「休完了」，所以合作教練寫「不適用」（與特休管理頁同一句）。 */
  ok('★★★ 合作教練寫「不適用」，不是 0', /ppf-none">不適用/.test(html));
}

console.log('\n④ 版面規格');
ok('★★ 卡片不吃滿版（使用者：「可以改小張一點 不用全幅寬」）',
   /\.pp-head\.pp-head-emp\{max-width:760px;/.test(src));
ok('★★★ 值一律 nowrap＋省略號（Email 很長，折行會把整排撐成兩倍高）',
   /\.ppf-v\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis;/.test(src.replace(/\n\s*/g,'')));
ok('★★ 任職那組兩欄、聯絡那組一欄', /\.ppf-g2\{grid-template-columns:1fr 1fr;\}/.test(src));
ok('★★ 會員卡那一支沒被動到（它有自己的收合詳細資料）',
   /return `<div class="pp-head pp-head-m2/.test(src) && /pp-headtg/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
