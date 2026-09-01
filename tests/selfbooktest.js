/* 2026-08-01 使用者指示：
   「如果該預約是從會員手機自行預約的，幫我在該預約圓形卡旁邊做個備註」

   怎麼認得出來：會員端一律走 security definer 的 RPC（fn_member_self_book /
   fn_member_self_reschedule），裡面把 created_by 寫成會員自己的 id；
   櫃檯或教練建立的寫的是員工 id。所以「created_by ＝ 這位會員本人」就是自助預約，
   不需要另外加欄位（也就不會有「新資料才有、舊資料沒有」的落差）。 */
const fs=require('fs');
require('./_bkenv.js');   // 教練請假退堂那條判準（0830 收斂成一支，見 _bkenv.js）
/* 2026-09-01：ticketTokens 的 md() 開始用 TODAY 判斷「這一堂是不是今年的」
   （跨年的圓點要多一行年份）—— 沙箱補上假時鐘，與各檔既有的測資年份一致。 */
if(typeof globalThis.TODAY==='undefined') globalThis.TODAY=new Date(2026,8,1);   // 2026-09-01
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 判斷「這一堂是不是會員自己約的」');
{
  const f=new Function(grabFn('bkSelfBooked')+'\nreturn bkSelfBooked;')();
  /* 2026-08-01 二修（使用者回報「8/4 蕭育筑團體課怎麼沒看到提示」）：
     團課的課卡是櫃檯先開好的班，會員只是「加入名單」→ created_by 是員工，
     只看 created_by 的話團課永遠標不出來。真正的痕跡在扣課紀錄的 operator。 */
  eq('★ 團課：課卡是櫃檯開的，但扣課紀錄的操作者是會員本人 → 是自助報名',
     f({id:'B1',created_by:'c-emp1',member_id:null},'MEM-1',new Set(['B1'])), true);
  eq('★ 團課：同一堂課別人自己報名的，不在我的集合裡 → 不標',
     f({id:'B1',created_by:'c-emp1',member_id:null},'MEM-1',new Set(['B9'])), false);
  eq('　　沒有集合時退回 created_by 的判斷（自主訓練那條路）',
     f({id:'B1',created_by:'MEM-1',member_id:'MEM-1'},'MEM-1',null), true);
  eq('★ created_by ＝ 會員本人 → 是自助預約', f({created_by:'MEM-1',member_id:'MEM-1'},'MEM-1'), true);
  eq('★ created_by 是員工 → 不是', f({created_by:'c-emp1',member_id:'MEM-1'},'MEM-1'), false);
  eq('★ 會員端建的課卡（member_id 為 null）也認得出來',
     f({created_by:'MEM-1',member_id:null},'MEM-1'), true);
  eq('★ 別人建的不會算到我頭上',
     f({created_by:'MEM-2',member_id:null},'MEM-1'), false);
  eq('　　沒傳 memberId 時退回課卡上的會員', f({created_by:'MEM-1',member_id:'MEM-1'}), true);
  eq('　　舊系統匯入（沒有 created_by）→ 不是', f({created_by:null,member_id:'MEM-1'},'MEM-1'), false);
  eq('　　沒有課卡 → 不是（不會爆）', f(null,'MEM-1'), false);
  eq('　　id 型別不同（數字 vs 字串）也比得出來', f({created_by:7,member_id:7},7), true);
}
ok('★ 票券夾負責整理「這位會員自己約的那幾堂」（扣課紀錄的 operator）',
   /const selfBk=new Set\(\);/.test(src)
   && /\(c\.logs\|\|\[\]\)\.forEach\(l=>\{ if\(l && l\.action==='deduct' && l\.booking_id\s*\n\s*&& String\(l\.operator\|\|''\)===String\(memberId\)\) selfBk\.add\(l\.booking_id\); \}\);/.test(src));
ok('　　每張票卡都帶著這個集合（slot.selfBk），呼叫端不用自己再撈一次 logs',
   /left:Math\.max\(0,total-used-pending\), stamps:bks, state, selfBk\};/.test(src));
ok('　　為什麼只看 created_by 不夠，寫在程式裡',
   /只看 created_by 的話，團課永遠標不出來（使用者回報 8\/04 蕭育筑那筆）。/.test(src));
ok('★ 共享票要傳使用人的 id（拿票券持有人比會比錯）',
   /memberId 要傳進來：共享票的持有人不是使用人，拿 t\.member_id 比會比錯。/.test(src));
ok('　　判斷依據寫在程式裡（不需要另外加欄位）',
   /會員端一律走 security definer 的 RPC，裡面把 created_by 寫成會員自己的 id/.test(src));

console.log('\n② 圓形卡上的標記');
{
  const COURSE_SHAPE={};
  const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
  const api=new Function('COURSE_SHAPE','parseYmd','bkIsSelf',
    [grabFn('tkVisual'),grabFn('bkSelfBooked'),grabFn('ticketTokens')].join('\n')
    +'\nreturn ticketTokens;')(COURSE_SHAPE,parseYmd,()=>false);

  const T={id:'t1',member_id:'MEM-1',ticket_type_id:'tt-pt',plan_name:'教練課',sessions_total:4};
  const BK=(id,d,st,by)=>({id,date:d,start_time:'11:00',status:st,created_by:by,member_id:'MEM-1'});
  const dots=h=>[...String(h).matchAll(/class="(mtk[^"]*)"/g)].map(m=>m[1]);

  let h=api(T,[BK('b1','2026-07-01','completed','MEM-1'),BK('b2','2026-07-08','completed','c-emp'),
               BK('b3','2026-08-05','booked','MEM-1'),BK('b4','2026-08-12','booked','c-emp')],
            {}, 2, null, 'MEM-1');
  const cs=dots(h);
  eq('★ 自己約的（已上）掛 mtk-self', /mtk-self/.test(cs[0]), true);
  eq('★ 櫃檯約的（已上）不掛', /mtk-self/.test(cs[1]), false);
  eq('★ 自己約的（已預約）也掛', /mtk-self/.test(cs[2]), true);
  eq('★ 櫃檯約的（已預約）不掛', /mtk-self/.test(cs[3]), false);
  ok('★ 滑鼠停留看得到說明', /會員自行預約/.test(h));

  // 票券堂數放不下的溢出圈（紅虛線）也要標
  h=api(Object.assign({},T,{sessions_total:1}),
        [BK('b1','2026-07-01','completed','c-emp'),BK('b5','2026-08-20','booked','MEM-1')],
        {}, 1, null, 'MEM-1');
  ok('★ 放不下的那顆（紅虛線圈）也標得出來', /mtk-over[^"]*mtk-self|mtk-self[^"]*mtk-over/.test(h));

  // 共享票：持有人是別人，使用人是我
  const SH=Object.assign({},T,{member_id:'MEM-9'});
  h=api(SH,[BK('b1','2026-08-05','booked','MEM-1')],{},0,null,'MEM-1');
  ok('★ 共享票：傳使用人的 id 才標得對', /mtk-self/.test(h));
  h=api(SH,[BK('b1','2026-08-05','booked','MEM-1')],{},0,null,null);
  ok('　　沒傳 id 時退回持有人（MEM-9）→ 不標，不會誤標', !/mtk-self/.test(h));

  // 本堂金框與自助標記可以並存
  h=api(T,[BK('b3','2026-08-05','booked','MEM-1')],{},0,'b3','MEM-1');
  ok('　　本堂標記與自助標記並存', /mtk-cur/.test(h) && /mtk-self/.test(h));
}
/* 2026-08-01：「本堂」的框改成綠色（金配金看不出來），金色留給「會員自行預約」，
   兩個標記才不會混在一起。 */
ok('　　「本堂」用綠框、「自行預約」用金點，兩者顏色不重疊',
   /\.mtk\.mtk-cur\{border-color:var\(--green,#1f6f54\)!important;/.test(src)
   && /background:var\(--gold-d,#b48a56\);border:1\.5px solid var\(--card,#fff\)/.test(src));
ok('★ 標記樣式：圓點右上角一顆小金點（不塞字，30px 塞不下）',
   /\.mtk\.mtk-self::after\{content:'';position:absolute;top:-1px;right:-1px;width:9px;height:9px;/.test(src));
ok('　　為什麼用點不用字、為什麼用金色，寫在程式裡',
   /圓點只有 30px，塞字會蓋住日期/.test(src) && /這不是錯誤、只是來源不同/.test(src));

console.log('\n③ 每個畫圓點的地方都要把「使用人」傳進去');
{
  const calls=[...src.matchAll(/ticketTokens\(([^;]*?)\)[};<`]/g)].map(m=>m[0]);
  const bad=[...src.matchAll(/\$?\{?ticketTokens\((?:[^()]|\([^()]*\))*\)/g)]
    .map(m=>m[0]).filter(x=>x.indexOf('function')<0)
    .filter(x=>x.split(',').length<7);
  eq('★ 沒有任何呼叫點漏傳（每一處都有 7 個參數：使用人＋自助集合）', bad, []);
}
ok('　　會員資料 → 票券分頁傳 PP.id', /ticketTokens\(t,bks,typeMap,used,null,PP\.id,WAL\.selfBk\)/.test(src));
ok('　　會員端「我的票券」傳 SESSION.id', /ticketTokens\(t,_bksC,typeMap,usedCnt,null,SESSION\.id,_sl\.selfBk\)/.test(src));
ok('　　團課名單逐名額傳那一列的會員（0803 起連名額序一起傳）', /ticketTokens\(_sl\.t,_sl\.stamps,st\.typeMap,_sl\.used,b\.id,mid,_sl\.selfBk,_ord\)/.test(src));
ok('　　預約明細（單人課）傳這一堂的會員', /ticketTokens\(tkC,tkBks2,_typeMapD,doneCount,b\.id,b\.member_id,_wSlotD&&_wSlotD\.selfBk\)/.test(src));
ok('　　會員列表的五格票券傳那一列的會員', /tkRowHtml\(sl, w\.leftoverIn\(k\), m\.id, /.test(src));
ok('★ 有圖例說明金點是什麼（不解釋沒人看得懂）',
   /右上角金點＝會員自己從手機預約的/.test(src));
ok('　　沒有自助預約的會員不顯示圖例（不佔版面）',
   /\$\{act\.some\(t=>\(\(WAL\.of\(t\.id\)\|\|\{stamps:\[\]\}\)\.stamps\|\|\[\]\)\.some\(x=>bkSelfBooked\(x,PP\.id,WAL\.selfBk\)\)\)/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
