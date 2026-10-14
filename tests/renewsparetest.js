/* 課卡續約驚嘆號：同類別還有更晚的課就不催（2026-10-14 使用者回報）
   「林昭邦在行事曆上面有繳費驚嘆號，但他其實還有一張票券還沒使用完」
   #39（10 堂，最後一堂 10/16）與 #40（4 堂，排到 11/10）同一天 9/08 買，
   「已續約＝有更晚買的票」嚴格 > 比不出來，舊票最後一堂照樣跳提醒。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('原始碼');
ok('★ 不再只看購買日先後（同一天買的第二張也算）',
   /_grpLastAt\[tk\.member_id\+'\|'\+grp\]\|\|\[\]\)\s*\n?\s*\.some\(x=>x\.id!==tk\.id && x\.at>\(_tkLastAt\[tk\.id\]\|\|''\)\)/.test(src));
ok('　　比的是「最後一堂的日期時間」，不是「還剩幾堂」',
   /_tkLastAt\[t2\.id\]=String\(z\.date\|\|''\)\+' '\+String\(z\.start_time\|\|''\)/.test(src));
ok('　　退費的票不算', /if\(t2\.status==='refunded'\) return;[\s\S]{0,120}_grpLastAt/.test(src));

/* 實跑：把 computeLastBkMarks 抽出來跑一次（只驗續約那一段） */
console.log('\n實跑（林昭邦的真實資料形狀）');
const i=src.indexOf('function tkRenewGroup(');
const j=src.indexOf('async function renderCalendar(');
const body=src.slice(i,j);
const win={};
const fn=new Function('window','ymd','TODAY','tkClass5','bkIsGroup','parseYmd',
  body+'\nreturn computeLastBkMarks;')(
  win, d=>'2026-10-14', new Date('2026-10-14T00:00:00'), ()=>'', ()=>false, s=>new Date(s));

const typeMap={TT:{category:'私人教練',color:'pt'}};
const T=(id,tot,rem,buy,exp)=>({id,member_id:'M1',ticket_type_id:'TT',plan_name:'自訂方案',
  sessions_total:tot,sessions_remaining:rem,purchase_date:buy,expire_date:exp,status:'usable'});
const B=(id,tk,date,st,done)=>({id,ticket_id:tk,date,start_time:st,
  status:done?'completed':'booked'});

// #39：10 堂，9 堂已上，最後一堂 10/16；#40：4 堂全排了但一堂都沒上，排到 11/10
const t39=T('T39',10,0,'2026-09-08','2027-09-10'), t40=T('T40',4,0,'2026-09-08','2027-10-19');
const bks=[];
['2026-09-11','2026-09-15','2026-09-22','2026-09-25','2026-09-29',
 '2026-10-02','2026-10-06','2026-10-09','2026-10-13'].forEach((d,n)=>bks.push(B('b'+n,'T39',d,'20:00',true)));
bks.push(B('b39last','T39','2026-10-16','20:00',false));
['2026-10-20','2026-10-27','2026-11-03','2026-11-10'].forEach((d,n)=>bks.push(B('c'+n,'T40',d,'20:00',false)));

fn([t39,t40], bks, typeMap);
ok('★★★ 10/16 那堂不再跳續約驚嘆號', !win._renewLastBk['b39last'], win._renewLastBk);
ok('　　改標綠勾（已經有下一張在跑了）', win._renewDoneBk['b39last']===true);
ok('★★★ 真正的最後一堂（11/10）還是要催', win._renewLastBk['c3']===true, win._renewLastBk);

// 只有一張票時照舊
win._renewLastBk={}; win._renewDoneBk={};
fn([t39], bks.filter(b=>b.ticket_id==='T39'), typeMap);
ok('★ 只有一張票 → 最後一堂照樣催（沒有被新規則蓋掉）', win._renewLastBk['b39last']===true, win._renewLastBk);

console.log(`\n${pass} 通過 / ${fail} 失敗`);
if(fail) process.exit(1);
