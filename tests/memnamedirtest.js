/* 教練桌機看不到別的教練的學員名字（2026-08-25 使用者回報）—— 選乙案修

   前端 0730 就放開了（renderCalendar 的 hideMember 一直是 false，註解寫著
   「教練也開放看其他預約課卡的會員名字，只是關閉互動功能」），
   但 members 的 RLS 沒跟著放：can_coach_see_member() 只認「我是主責教練」或
   「我教過／代過他的課」，所以教練撈不到別的教練的學員，bkName 查不到就回「—」。
   UI 開了門，資料沒送過來。

   甲案（放寬 members_select）被否決：RLS 是整列的，等於連電話、生日、緊急聯絡人、
   備註都一起開。乙案＝另開一條只回 id 與 name 的窄路。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=(sig)=>{ const i=src.indexOf(sig); if(i<0) throw new Error('找不到 '+sig);
  let d=0,k=src.indexOf('{',i);
  for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) break;} }
  return src.slice(i,k+1); };

const W={};
const memNameMap=new Function('window', grab('function memNameMap(members){')+'\nreturn memNameMap;')(W);

console.log('實跑 memNameMap');
const MEMBERS=[{id:'M1',name:'陳世勳'},{id:'M2',name:'黃淨萍'}];
W._memNames=undefined;
ok('★★ 沒有目錄時完全等於原本的行為（櫃檯／管理員／會員都走這條）',
   JSON.stringify(memNameMap(MEMBERS))==='{"M1":"陳世勳","M2":"黃淨萍"}');
W._memNames={M1:'陳世勳',M2:'黃淨萍',M3:'別的教練的學員',M4:'另一位'};
ok('★★ 教練：撈不到的那幾位由目錄補上（原本會畫成「—」）',
   memNameMap([MEMBERS[0]]).M3==='別的教練的學員' && memNameMap([MEMBERS[0]]).M4==='另一位');
ok('★★ 真的撈得到的那批優先（目錄是備援，不是覆蓋）',
   memNameMap([{id:'M3',name:'我自己的學員'}]).M3==='我自己的學員');
ok('★ 空清單也不會炸', memNameMap(null).M3==='別的教練的學員' && memNameMap([]).M1==='陳世勳');
ok('　　壞資料跳過', Object.keys(memNameMap([null,{},{id:'M5',name:'X'}])).indexOf('undefined')<0);

console.log('\n目錄本身');
const DIR=grab('async function memberDirectory(){');
ok('★ 一次 RPC、整個工作階段共用（與 coachDirectory 同一套）',
   /if\(_memDirCache\) return _memDirCache;/.test(DIR)
   && /if\(_memDirBusy\) return _memDirBusy;/.test(DIR)
   && /sb\.rpc\('fn_member_names'\)/.test(DIR));
ok('★★ 併發呼叫共用同一個 promise（不會同時打好幾次）', /_memDirBusy=\(async\(\)=>\{/.test(DIR));
ok('★ 失敗就是空字典，不擋畫面（頂多維持原本的「—」）',
   /\}catch\(_\)\{\}\s*\n\s*_memDirCache=map; window\._memNames=map;/.test(DIR));

console.log('\n只有教練需要');
ok('★★ 只有教練會去撈（櫃檯以上本來就讀得到整張表，會員讀不到也不該讀）',
   /if\(SESSION && SESSION\.role==='coach' && !_memDirWarmed\)\{/.test(src));
ok('★★ 一個旗標保證整個工作階段只跑一次（教練有三條進場路徑）',
   /_memDirWarmed=true;\s*\n\s*memberDirectory\(\)\.then\(\(\)=>\{ try\{ navTo\(CUR_PAGE\); \}catch\(_\)\{\} \}\);/.test(src));
ok('　　撈完重畫一次，把「—」補成名字', /回來之後重畫一次把「—」補成名字/.test(src));

console.log('\n所有姓名字典都改吃它');
ok('★★ 沒有任何地方還在自己組 id→姓名 的字典（漏一個那一頁就還是「—」）',
   !/Object\.fromEntries\(members\.map\(m=>\[m\.id,m\.name\]\)\)/.test(src)
   && !/Object\.fromEntries\(\(membersAll\|\|\[\]\)\.map\(m=>\[m\.id,m\.name\]\)\)/.test(src));
ok('★ 換過去的數量對得上：22 個呼叫點＋1 個定義',
   (src.match(/memNameMap\((members|membersAll|mems)\)/g)||[]).length===23,
   (src.match(/memNameMap\((members|membersAll|mems)\)/g)||[]).length);
/* 這五處要的是「整個會員物件」（等級、電話、備註…），目錄只有名字給不了 ——
   而它們全在櫃檯以上才進得去的頁面（g_dashboard／openLottoModal／ops_center／
   members／purchase_review），教練根本不會走到，所以不受影響。 */
ok('　　需要「整個會員物件」的那五頁維持原樣（都是櫃檯以上的頁面，教練走不到）',
   (src.match(/Object\.fromEntries\(members\.map\(m=>\[m\.id,m\]\)\)/g)||[]).length===5);

console.log('\n來由');
ok('★ 甲乙兩案與否決理由寫在原地',
   /甲　放寬 members_select/.test(src) && /等於連電話、生日、\s*\n\s*緊急聯絡人、備註都一起開/.test(src));
ok('　　使用者原話與「UI 開了門，資料沒送過來」寫在原地',
   /教練用桌機開　行事曆看不到其他會員的名字/.test(src) && /UI 開了門，資料沒送過來/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
