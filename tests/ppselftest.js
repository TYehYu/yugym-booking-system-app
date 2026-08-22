/* 會員本人看自己的「個人資料」：內部欄位不外露
   （2026-08-22 使用者：「會員點帳號資訊的個人資料可以看到這麼多東西嗎？」） */
const fs=require('fs');
const s=fs.readFileSync(__dirname+'/../index.html','utf8');
let pass=0, fail=0;
const t=(n,ok)=>{ ok?pass++:fail++; console.log((ok?'  ok  ':'  FAIL')+'  '+n); };
const cut=(a,b)=>s.slice(s.indexOf(a), s.indexOf(b));

const fn=cut('function ppSelfView(){','function ppHeaderHtml(){');
t('判斷只認「會員本人 × 會員資料 × 自己的 id」',
  /SESSION\.role==='member' && PP\.kind==='member'/.test(fn)
  && /String\(PP\.id\)===String\(SESSION\.id\)/.test(fn));
t('櫃檯／教練／管理員看會員資料不受影響（沒有其他角色分支）',
  !/front_desk|coach'/.test(fn));

const hd=cut('function ppHeaderHtml(){','function ppOpenPage(');
t('會員看自己時不顯示「等級」與「主教練」',
  /\(ppSelfView\(\)\?'':tierItem \+ coachItem\)/.test(hd));
t('緊急聯絡人／LINE／載具照舊（本來就是會員自己能改的）',
  /ecItem \+ lineItem \+ carrierItem/.test(hd));
t('等級章仍只有管理員點得動（原規則沒被動到）',
  /const _canTier = !!\(SESSION&&SESSION\.role==='admin'\);/.test(hd));
t('家庭成員仍只有櫃檯以上維護', /const famItem = \(isM&&_canBase\)\?/.test(hd));

t('活動紀錄：會員看自己時不列「訓練紀錄」（還是開發中的空頁）',
  /\$\{ppSelfView\(\)\?'':ppDashRow\('dumbbell','訓練紀錄'/.test(s));
t('票券／預約紀錄／交易照列（都是會員自己的資料）',
  /ppDashRow\('ticket','票券'/.test(s) && /ppDashRow\('calendar','預約紀錄'/.test(s)
  && /ppDashRow\('money','交易'/.test(s));

t('交易頁只列自己的日期／項目／金額／付款方式，沒有業績或成本欄位',
  (()=>{ const pay=cut("if(PP.recView==='pay'){","return `<div class=\"pp-card\">${back}<div class=\"pp-card-t\">訓練紀錄");
    return !/sale_kind|sold_by|獎金|成本|業績/.test(pay); })());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
