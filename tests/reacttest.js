/* 從 index.html 抽出真正的票券分區程式碼（tkCategoryOf + _isExpiredTk/_isHistoryTk/tkListHtml），
   用正式庫真實資料驗證：課程票券可重新啟用、自主訓練不可。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

function grab(startMark,endMark,label){
  const i=src.indexOf(startMark); if(i<0) throw new Error('找不到起點：'+label);
  const j=src.indexOf(endMark,i);  if(j<0) throw new Error('找不到終點：'+label);
  return src.slice(i,j+endMark.length);
}
const catSrc =grab('const tkCategoryOf=(t)=>{',"return 'course'; // 其餘（教練/友善/團課/體驗）歸課程票券\n  };",'tkCategoryOf');
const bukSrc =grab('const _todayYmd2=ymd(TODAY);','    return html;\n  };','tkListHtml');

let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

// ── 依賴替身 ───────────────────────────────────────────────
const TODAY=new Date('2026-07-26T00:00:00');
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const SESSION={role:'admin'};
const myBookings=[];
const typeMap={
  'tt-mqdt55uosz5n':{id:'tt-mqdt55uosz5n',name:'自主訓練',category:'自主訓練',color:'self'},
  'tt-pt':{id:'tt-pt',name:'私人教練課',category:'私人教練',color:'pt'},
  // 正式庫真實票種：折抵券掛在「私人教練」/「運動按摩」類別下，只能靠 id 前綴或名稱認出來
  'tt-discount-pt300':{id:'tt-discount-pt300',name:'教練課折抵300',category:'私人教練',color:'pt'},
  'tt-discount-ms300':{id:'tt-discount-ms300',name:'運動按摩折抵300',category:'運動按摩',color:'massage'},
  'tt-odd':{id:'tt-odd',name:'課程折抵票券',category:'私人教練',color:'pt'},
};
// renderTkCard 用最小替身：把 id 與 extraBtn 吐出來，方便斷言
const renderTkCard=(t,extraBtn)=>`<card id="${t.id}">${extraBtn||''}</card>`;

const build=new Function('ymd','TODAY','SESSION','myBookings','typeMap','renderTkCard',
  `${catSrc}\n${bukSrc}\nreturn {tkCategoryOf,tkListHtml,_isExpiredTk,_isHistoryTk};`);
const {tkCategoryOf,tkListHtml,_isExpiredTk}=build(ymd,TODAY,SESSION,myBookings,typeMap,renderTkCard);

// ── 正式庫真實資料（朱庭箴 MEM-69D90A949008 的三張自主訓練點數）──
const SELF=[
  {id:'TK-19f9befb2544abf',ticket_type_id:'tt-mqdt55uosz5n',sessions_total:2,sessions_remaining:1,status:'usable',expire_date:'2026-08-01',start_date:'2026-07-26'},
  {id:'TK-19f7acb2bb8e360',ticket_type_id:'tt-mqdt55uosz5n',sessions_total:2,sessions_remaining:2,status:'usable',expire_date:'2026-07-25',start_date:'2026-07-19'},
  {id:'MTK-8136EA079C53', ticket_type_id:'tt-mqdt55uosz5n',sessions_total:2,sessions_remaining:2,status:'usable',expire_date:'2026-07-11',start_date:'2026-07-05'},
];
const COURSE=[
  {id:'C-active', ticket_type_id:'tt-pt',sessions_total:10,sessions_remaining:6,status:'usable',expire_date:'2026-12-31'},
  {id:'C-expired',ticket_type_id:'tt-pt',sessions_total:10,sessions_remaining:4,status:'usable',expire_date:'2026-07-20'},
  {id:'C-usedup', ticket_type_id:'tt-pt',sessions_total:10,sessions_remaining:0,status:'used_up',expire_date:'2026-12-31'},
];

console.log('分類');
ok('自主訓練票券歸 self',   SELF.every(t=>tkCategoryOf(t)==='self'));
ok('私人教練票券歸 course', COURSE.every(t=>tkCategoryOf(t)==='course'));

console.log('折抵券獨立分頁');
const VOUCH=[
  {id:'V-pt', ticket_type_id:'tt-discount-pt300',sessions_total:1,sessions_remaining:1,status:'usable',expire_date:null},
  {id:'V-ms', ticket_type_id:'tt-discount-ms300',sessions_total:1,sessions_remaining:1,status:'usable',expire_date:null},
  {id:'V-used',ticket_type_id:'tt-discount-pt300',sessions_total:1,sessions_remaining:0,status:'used_up',expire_date:null},
];
ok('教練課折抵300 歸 voucher',   tkCategoryOf(VOUCH[0])==='voucher');
ok('運動按摩折抵300 歸 voucher', tkCategoryOf(VOUCH[1])==='voucher');
ok('名稱含「折抵」也歸 voucher', tkCategoryOf({ticket_type_id:'tt-odd'})==='voucher');
ok('折抵券不再混進課程票券',     COURSE.concat(VOUCH).filter(t=>tkCategoryOf(t)==='course').length===COURSE.length);
ok('自主訓練不受影響',           SELF.every(t=>tkCategoryOf(t)==='self'));
const vHtml=tkListHtml(VOUCH,false);
ok('折抵券無到期日 → 未用的在可用區', vHtml.indexOf('V-pt')<vHtml.indexOf('歷史紀錄') && vHtml.indexOf('V-ms')<vHtml.indexOf('歷史紀錄'));
ok('用畢的折抵券進歷史紀錄',     vHtml.indexOf('V-used')>vHtml.indexOf('歷史紀錄'));
ok('折抵券沒有重新啟用鈕',       vHtml.indexOf('openReactivateTicket')<0);

console.log('自主訓練分頁（allowReact=false）');
const selfHtml=tkListHtml(SELF,false);
ok('不出現「已過期（可重新啟用）」標題', selfHtml.indexOf('已過期（可重新啟用）')<0);
ok('不出現「重新啟用」按鈕',            selfHtml.indexOf('重新啟用')<0);
ok('不呼叫 openReactivateTicket',       selfHtml.indexOf('openReactivateTicket')<0);
ok('未過期那張仍在可用區',              selfHtml.indexOf('TK-19f9befb2544abf')>=0
                                        && selfHtml.indexOf('TK-19f9befb2544abf')<selfHtml.indexOf('歷史紀錄'));
ok('7/25 過期的落在歷史紀錄',           selfHtml.indexOf('歷史紀錄')>=0
                                        && selfHtml.indexOf('TK-19f7acb2bb8e360')>selfHtml.indexOf('歷史紀錄'));
ok('7/11 過期的落在歷史紀錄',           selfHtml.indexOf('MTK-8136EA079C53')>selfHtml.indexOf('歷史紀錄'));
ok('兩張過期都沒被吞掉（歷史數=2）',    /歷史紀錄（2）/.test(selfHtml));

console.log('課程票券分頁（allowReact=true）');
const courseHtml=tkListHtml(COURSE,true);
ok('出現「已過期（可重新啟用）」標題',  courseHtml.indexOf('已過期（可重新啟用）')>=0);
ok('過期票有重新啟用按鈕',              /openReactivateTicket\('C-expired'\)/.test(courseHtml));
ok('可用票沒有重新啟用按鈕',            courseHtml.indexOf("openReactivateTicket('C-active')")<0);
ok('用畢票沒有重新啟用按鈕',            courseHtml.indexOf("openReactivateTicket('C-usedup')")<0);
ok('用畢票在歷史紀錄',                  courseHtml.indexOf('C-usedup')>courseHtml.indexOf('歷史紀錄'));

console.log('權限');
const S2=build(ymd,TODAY,{role:'coach'},myBookings,typeMap,renderTkCard);
// 註：標題「已過期（可重新啟用）」本身含「重新啟用」四字，故以 onclick 判定按鈕是否存在
ok('教練看不到重新啟用按鈕', S2.tkListHtml(COURSE,true).indexOf('openReactivateTicket')<0);
ok('教練仍看得到過期區塊',   S2.tkListHtml(COURSE,true).indexOf('已過期（可重新啟用）')>=0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
