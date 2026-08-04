/* 2026-08-03 使用者指示（三連）：
   ①「會員資料新增一個＋家庭成員」
   ②「在同一個位子用同帳號預約第二次的時候要跳出選擇家庭成員的視窗」
   ③「如果該會員有設定家庭成員，第一列會員姓名旁邊就要多一個按鈕顯示選擇是哪個成員」
   同日排列定版：明細第一列姓名、第二列日期時間時長、第三列教練、第四列場地。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 會員資料的「＋家庭成員」');
ok('★ 表頭 chip（與會員端同一個欄位 members.family_members）',
   /onclick="ppFamEdit\('\$\{r\.id\}'\)"><span class="pp-meta-l">家庭成員<\/span>/.test(src));
ok('★ 櫃檯管理視窗：新增/移除稱呼', /async function ppFamEdit\(mid\)\{/.test(src)
   && /async function ppFamAdd\(mid\)\{/.test(src) && /async function ppFamRemove\(mid,i\)\{/.test(src));

console.log('\n② 同時段第二次預約 → 選擇家庭成員');
ok('★ 撞「會員於該時段已有預約」＋自主訓練＋有名單 → 開選擇視窗',
   /if\(preErr==='會員於該時段已有預約' && t\.category==='自主訓練' && member_id && !window\._bkFamUser\)\{/.test(src));
ok('★ 選擇視窗是獨立浮層（不能蓋掉預約表單，重送要讀欄位）',
   /用獨立浮層而非 showModal —— showModal 會蓋掉底下的預約表單/.test(src)
   && /ov\.id='bkfam-ov';/.test(src));
ok('★ 選完自動重送、旗標只作用一筆',
   /window\._bkFamUser=name;[\s\S]{0,120}await submitBooking\(\);/.test(src)
   && /window\._bkFamUser=null;   \/\/ 使用人旗標只作用這一筆/.test(src)
   && /window\._bkFamUser=null;   \/\/ 家庭成員使用人旗標只作用單筆/.test(src));
ok('★ 建立時把使用人寫進 trial_name（與家庭共享同一套規則）',
   /trial_name:\(o\.trial_name==null \? \(\(tk&&tk\.family_user\)\|\|null\) : \(o\.trial_name\|\|null\)\),/.test(src)   // 2026-08-04 三態：null＝依票券、''＝明確本人、名字＝成員
   && /trial_name:\(window\._bkFamUser!=null\?window\._bkFamUser:null\),/.test(src));   // '' 不能塌成 null（明確本人要蓋過票券預設）

console.log('\n③ 明細姓名旁的使用人按鈕（實跑 bkFamBtn）');
{
  const mk=desk=>new Function('isDeskLike','return '+grabFn('bkFamBtn'))(()=>desk);
  const f=mk(true);
  const MEM={family_members:['爸爸','媽媽']};
  ok('★ 有名單＋可編輯 → 可點的按鈕、顯示目前使用人', /👤 本人 ▾/.test(f({id:'B1'},MEM,true))
     && /openBkFamChange\('B1'\)/.test(f({id:'B1'},MEM,true)));
  ok('★ 已指定家人 → 顯示家人', /👤 爸爸/.test(f({id:'B1',trial_name:'爸爸'},MEM,true)));
  ok('★ 沒有家庭名單 → 不顯示', f({id:'B1'},{family_members:[]},true)===''
     && f({id:'B1'},null,true)==='');
  ok('★ 唯讀（會員/教練視角）→ 純標籤不可點', !/onclick/.test(mk(false)({id:'B1',trial_name:'媽媽'},MEM,false)));
}
ok('★ 更改視窗寫回 trial_name', /async function setBkFamUser\(bid, name\)\{/.test(src)
   && /b\.trial_name=name\|\|null;/.test(src));

console.log('\n④ 排列定版（姓名→時間→教練→場地）');
ok('★ 教練課：姓名獨立第一列（旁掛使用人按鈕）',
   /\$\{bkFamBtn\(b,mem,editable\)\}\n      <\/div>\n      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">\n        \$\{editable/.test(src));
ok('★ 通用課種（自主/場租/按摩）同一套順序、時間列移上來',
   /排列定版（2026-08-03 使用者指示：所有預約明細統一）/.test(src));
ok('★ 下方「調整時間」與重複場地區塊退場', !/調整時間（手機可用此處改期改時間）/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
