/* 續約獎金計數回歸測試（2026-07-29 建立）
   起因：團課「4 週優惠」被標成續約，害 SANDY 多算 4 張、小曾多算 3 張。
   續約直接影響獎金（每張 $1,000），此檔用 7 月正式庫真實資料鎖住規則。 */
const fs=require('fs');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const grab=n=>{const i=html.indexOf('function '+n+'(');let d=0,s=false;
  for(let j=i;j<html.length;j++){const c=html[j];if(c==='{'){d++;s=true;}else if(c==='}'){d--;if(s&&d===0)return html.slice(i,j+1);}}};
let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok '+n);pass++;}catch(e){console.log('  FAIL '+n+': '+e.message);fail++;}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m||''} 期望 ${JSON.stringify(b)} 得到 ${JSON.stringify(a)}`);};

const ymd=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
const parseYmd=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
const api=new Function('ymd','parseYmd','addDays','window',
  grab('isCoachClassTicket')+'\n'+grab('renewAttribOf')+'\n'+grab('renewMapOf')+
  '\nreturn {isCoachClassTicket,renewAttribOf,renewMapOf};')(ymd,parseYmd,addDays,{});

const types=[
  {id:'pt',category:'私人教練'}, {id:'fr',category:'私人教練'},
  {id:'grp',category:'小班肌力'}, {id:'self',category:'自主訓練'},
];
// 7 月正式庫真實續約（10 筆，已與手動帳務表逐筆核對）
const real=[
  {id:'t1',member_id:'m1',ticket_type_id:'pt', sale_kind:'renewal',purchase_date:'2026-07-04',sold_by:'ZOE'},
  {id:'t2',member_id:'m2',ticket_type_id:'fr', sale_kind:'renewal',purchase_date:'2026-07-08',sold_by:'ANN'},
  {id:'t3',member_id:'m3',ticket_type_id:'fr', sale_kind:'renewal',purchase_date:'2026-07-14',sold_by:'BARRY'},
  {id:'t4',member_id:'m4',ticket_type_id:'fr', sale_kind:'renewal',purchase_date:'2026-07-14',sold_by:'BARRY'},
  {id:'t5',member_id:'m5',ticket_type_id:'fr', sale_kind:'renewal',purchase_date:'2026-07-18',sold_by:'RANDY'},
  {id:'t6',member_id:'m6',ticket_type_id:'fr', sale_kind:'renewal',purchase_date:'2026-07-18',sold_by:'MANGO'},
  {id:'t7',member_id:'m7',ticket_type_id:'fr', sale_kind:'renewal',purchase_date:'2026-07-21',sold_by:'SANDY'},
  {id:'t8',member_id:'m8',ticket_type_id:'fr', sale_kind:'renewal',purchase_date:'2026-07-23',sold_by:'MANGO'},
  {id:'t9',member_id:'m9',ticket_type_id:'pt', sale_kind:'renewal',purchase_date:'2026-07-25',sold_by:'MANGO'},
  {id:'t10',member_id:'m10',ticket_type_id:'fr',sale_kind:'renewal',purchase_date:'2026-07-28',sold_by:'SANDY'},
];
// 干擾項：團課被標續約（實際發生過）、自主訓練、他月、新約
const noise=[
  {id:'g1',member_id:'g1',ticket_type_id:'grp',sale_kind:'renewal',purchase_date:'2026-07-27',sold_by:'小曾'},
  {id:'g2',member_id:'g2',ticket_type_id:'grp',sale_kind:'renewal',purchase_date:'2026-07-27',sold_by:'小曾'},
  {id:'g3',member_id:'g3',ticket_type_id:'grp',sale_kind:'renewal',purchase_date:'2026-07-27',sold_by:'小曾'},
  {id:'g4',member_id:'g4',ticket_type_id:'grp',sale_kind:'renewal',purchase_date:'2026-07-28',sold_by:'SANDY'},
  {id:'g5',member_id:'g5',ticket_type_id:'grp',sale_kind:'renewal',purchase_date:'2026-07-28',sold_by:'SANDY'},
  {id:'g6',member_id:'g6',ticket_type_id:'grp',sale_kind:'renewal',purchase_date:'2026-07-28',sold_by:'SANDY'},
  {id:'g7',member_id:'g7',ticket_type_id:'grp',sale_kind:'renewal',purchase_date:'2026-07-28',sold_by:'SANDY'},
  {id:'s1',member_id:'s1',ticket_type_id:'self',sale_kind:'renewal',purchase_date:'2026-07-10',sold_by:'MANGO'},
  {id:'o1',member_id:'o1',ticket_type_id:'pt', sale_kind:'renewal',purchase_date:'2026-06-30',sold_by:'BARRY'},
  {id:'n1',member_id:'n1',ticket_type_id:'pt', sale_kind:'new',    purchase_date:'2026-07-15',sold_by:'BARRY'},
];

console.log('7 月續約計數（對照手動帳務表）:');
const map=api.renewMapOf('2026-07',[...real,...noise],[],[],types);
t('六位教練張數完全相符', ()=>eq(map,{ZOE:1,ANN:1,BARRY:2,RANDY:1,MANGO:3,SANDY:2}));
t('SANDY 只有 2 張（不含 4 張團課）', ()=>eq(map.SANDY,2));
t('小曾 沒有續約（團課不計）', ()=>eq(map['小曾'],undefined));
t('合計 10 張', ()=>eq(Object.values(map).reduce((a,b)=>a+b,0),10));

console.log('\n排除規則:');
t('團課票不算續約', ()=>eq(api.isCoachClassTicket({ticket_type_id:'grp'},{grp:{category:'小班肌力'}}),false));
t('自主訓練不算續約', ()=>eq(api.isCoachClassTicket({ticket_type_id:'self'},{self:{category:'自主訓練'}}),false));
t('教練課/友善算續約', ()=>{eq(api.isCoachClassTicket({ticket_type_id:'pt'},{pt:{category:'私人教練'}}),true);});
t('無票種資料時用方案名稱備援', ()=>{
  eq(api.isCoachClassTicket({plan_name:'團課 4週優惠'},{}),false);
  eq(api.isCoachClassTicket({plan_name:'主顧客友善1V1'},{}),true);});
t('新約不計入續約', ()=>eq(map.BARRY,2));
t('他月不計入', ()=>eq(api.renewMapOf('2026-06',[...real,...noise],[],[],types),{BARRY:1}));

console.log('\n歸屬優先序:');
const bk=[{member_id:'mx',status:'checked_in',coach_id:'C90',category:'私人教練',date:'2026-07-01'}];
t('① 票券歸屬最優先', ()=>eq(api.renewAttribOf({id:'x',member_id:'mx',sold_by:'C1',purchase_date:'2026-07-20'},{x:'C2'},bk),'C1'));
t('② 沒有票券歸屬 → 收款教練', ()=>eq(api.renewAttribOf({id:'x',member_id:'mx',purchase_date:'2026-07-20'},{x:'C2'},bk),'C2'));
t('③ 都沒有 → 近 90 天主帶教練', ()=>eq(api.renewAttribOf({id:'x',member_id:'mx',purchase_date:'2026-07-20'},{},bk),'C90'));
t('④ 完全查無 → 不計給任何人', ()=>eq(api.renewAttribOf({id:'x',member_id:'zz',purchase_date:'2026-07-20'},{},bk),null));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
