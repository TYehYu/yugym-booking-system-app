/* 票券展延（2026-07-30 使用者指示：邱美珠有一張還沒用完就過期的票）
   對應合約〔展延規則〕：課程到期後可申請展延一次（展延期限同原方案期限）；
   展延之課程不得申請退費。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
const code=[g('function tkPlanDays(t){','\n}\n'),g('function tkIsExtended(t){','\n'),
            g('function tkExtendTo(t){','\n}\n'),g('function tkCanExtend(t, today){','\n}\n')].join('\n');
const env={ parseYmd:s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);},
            ymd:d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
            TODAY:new Date(2026,6,30),
            window:{_ttCache:[{id:'tt-limited-legacy',name:'限定教練課',validity_days:28}]} };
const api=new Function(...Object.keys(env),code+'\nreturn {tkPlanDays,tkIsExtended,tkExtendTo,tkCanExtend};')(...Object.values(env));
const T=o=>Object.assign({ticket_type_id:'tt-limited-legacy',status:'usable',sessions_remaining:4},o);

console.log('原方案期限');
{
  const meichu=T({start_date:'2026-04-23',expire_date:'2026-07-16',sessions_total:10,sessions_remaining:4});
  eq('★ 邱美珠那張：4/23–7/16 ＝ 84 天', api.tkPlanDays(meichu), 84);
  eq('★ 展延後到期 ＝ 7/16 ＋ 84 天 ＝ 10/08', api.tkExtendTo(meichu), '2026-10-08');
  ok('★ 符合展延條件（已過期、還剩 4 堂、沒展延過）', api.tkCanExtend(meichu)===true);
  eq('　　沒有 start_date 就退回 valid_days',
     api.tkPlanDays(T({expire_date:'2026-07-16',valid_days:30})), 30);
  eq('　　都沒有就用票種預設期限',
     api.tkPlanDays(T({expire_date:'2026-07-16'})), 28);
  eq('　　完全算不出來 → null（不給展延）',
     api.tkPlanDays({ticket_type_id:'tt-none',expire_date:'2026-07-16'}), null);
  eq('　　start 與 expire 同一天（期限 0）不算，退回票種預設',
     api.tkPlanDays(T({start_date:'2026-07-16',expire_date:'2026-07-16'})), 28);
}

console.log('\n可以展延的條件');
{
  const base={start_date:'2026-04-23',expire_date:'2026-07-16',sessions_total:10,sessions_remaining:4};
  ok('★ 已過期＋有剩餘堂數 → 可以', api.tkCanExtend(T(base))===true);
  ok('★ 還沒過期 → 不行（還在效期內不需要展延）',
     api.tkCanExtend(T({...base,expire_date:'2026-08-16'}))===false);
  ok('★ 剛好今天到期 → 不行（今天仍可用）',
     api.tkCanExtend(T({...base,expire_date:'2026-07-30'}))===false);
  ok('★ 堂數已用完 → 不行（沒東西可延）',
     api.tkCanExtend(T({...base,sessions_remaining:0}))===false);
  ok('★ 已經展延過 → 不行（一次為限）',
     api.tkCanExtend(T({...base,extended_from:'2026-07-16'}))===false);
  ok('　　已退費／作廢 → 不行',
     api.tkCanExtend(T({...base,status:'refunded'}))===false
     && api.tkCanExtend(T({...base,status:'void'}))===false);
  ok('　　永久有效（無到期日）→ 不行，本來就不會過期',
     api.tkCanExtend(T({...base,expire_date:null}))===false);
  ok('　　空票券不會爆', api.tkCanExtend(null)===false && api.tkPlanDays(null)===null);
  ok('　　可傳入指定的「今天」（報表回溯用）',
     api.tkCanExtend(T({...base,expire_date:'2026-08-16'}),'2026-09-01')===true);
}

console.log('\n展延一次為限：重算以「原到期日」為準');
{
  const done=T({start_date:'2026-04-23',expire_date:'2026-10-08',extended_from:'2026-07-16',sessions_remaining:4});
  ok('★ 已展延', api.tkIsExtended(done)===true);
  eq('★ 期限仍算原方案的 84 天（不會用展延後的日期再放大）', api.tkPlanDays(done), 84);
  ok('　　不能再展延一次', api.tkCanExtend(done)===false);
}

console.log('\n接線');
ok('★ 票券卡有展延開關（只給櫃檯／管理員）',
   /const _canExt = isDeskLike\(\) && tkCanExtend\(t, today\);/.test(src)
   && /openTicketExtend\('\$\{t\.id\}'\)/.test(src));
ok('★ 開關旁明講可延到哪一天、幾天、同原方案',
   /可延至 <b>\$\{String\(tkExtendTo\(t\)\)\.replace\(\/-\/g,'\/'\)\}<\/b>（\$\{tkPlanDays\(t\)\} 天，同原方案）/.test(src));
ok('★ 確認視窗寫明合約條款與不得退費',
   /可申請<b>展延一次<\/b>，展延期限同原方案期限/.test(src)
   && /<b>展延之課程不得申請退費。<\/b>/.test(src));
ok('★ 展延會寫入 no_refund 與原到期日（可還原）',
   /t\.extended_from=from;/.test(src) && /t\.no_refund=true;/.test(src));
ok('★ 展延後狀態回可用（期限延了，堂數本來就還有）',
   /if\(t\.status==='expired'\) t\.status='usable';/.test(src));
ok('★ 寫入票券帳本，來龍去脈查得到',
   /展延一次：\$\{from\} → \$\{to\}（\$\{days\} 天，同原方案期限）；依合約展延之課程不得申請退費/.test(src));
ok('　　通知會員（type 用現有的 announce，避免資料庫擋下）',
   /pushNotification\(t\.member_id,'announce','票券已展延'/.test(src)
   && /沒有票券專用類別，硬塞新值會被資料庫擋下/.test(src));
ok('★ 撤銷展延只給管理員，且會還原到期日與退費資格',
   /if\(!\(SESSION&&SESSION\.role==='admin'\)\)\{ showToast\('只有管理員可以撤銷展延'\); return; \}/.test(src)
   && /t\.expire_date=back; t\.extended_from=null; t\.extended_at=null; t\.extended_by=null; t\.no_refund=false;/.test(src));
ok('　　撤銷後若原到期日已過，狀態回到已過期',
   /if\(back < ymd\(TODAY\)\) t\.status='expired';/.test(src));
ok('★ 已展延的票券卡顯示「不得申請退費」',
   /已展延：不得申請退費。/.test(src) && /<span class="tk-ext-no">不得申請退費<\/span>/.test(src));
ok('　　金色＝次要提示，符合品牌色階（紅>金>綠）',
   /\.tk-ext-no\{margin-left:auto;font-size:10\.5px;font-weight:700;color:var\(--gold-d,#b48a56\);/.test(src));
ok('　　過期票整張淡化，但有展延開關時不淡（要能看清楚才點得下去）',
   /\.mwtk-card\.mck-dim2:has\(\.tk-ext\)\{opacity:1;filter:none;\}/.test(src));
ok('　　雙重把關：視窗與寫入都再驗一次條件',
   (src.match(/if\(!tkCanExtend\(t\)\)\{ showToast\('這張票券不符合展延條件/g)||[]).length===2);
ok('　　原因寫在程式裡', /過期票在系統裡完全動不了/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
