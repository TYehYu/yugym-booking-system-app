/* 預約管理的篩選鈕：堂數／暗化／排序（2026-09-03 使用者指示）

   「該頁面有該教練或該種課程才顯示互動 沒有就暗化
     然後顯示該課程或教練有幾堂 例如[RANDY 25]」
   「也要排序 課越多往前排」

   三件事分別的坑：
   ・堂數要跟畫面上真的畫出來的張數一致 —— 所以計數與繪製共用同一支 _calPass，
     不能各寫一份判斷（鈕上寫 25、點下去只有 23，沒有人查得出是哪邊錯）。
   ・團課在資料上是一位學員一筆，計數一定要先 mergeGroupBookings，否則會被灌成好幾倍。
   ・排序讓鈕會換位置。取捨是使用者指定的，但**選中的那顆永不暗化** ——
     不然選了 ZOE 再翻到她沒課的一週，那顆會點不動又取消不掉。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);if(i<0)throw new Error('找不到 '+a);return src.slice(i,src.indexOf(b,i)+b.length);};

const FILTERS=[
  { cls:'ev-pt',       label:'教練課' },
  { cls:'ev-friendly', label:'友善教練課' },
  { cls:'ev-group',    label:'團體課' },
  { cls:'ev-self',     label:'自主訓練' },
  { cls:'ev-trial',    label:'體驗課' },
  { cls:'ev-massage',  label:'運動按摩' },
];
/* calCourseChips 讀 window._calCourse（目前選哪一種），沙箱要給它一個 window。
   選中的那一顆行為不同（不暗化、title 改成「再點一次看全部」），所以測試裡要能切換。 */
const WIN={_calCourse:'all'};
const api=new Function('isTeachable','coachDisp','coachTagColor','CALENDAR_COURSE_FILTERS','window',
  g('function calCoachChips(coaches, filterCoach, counts){','\n}')+'\n'
  +g('function calCourseChips(counts){','\n}')
  +'\nreturn {calCoachChips,calCourseChips};')(
  c=>c && c.active!==false,
  c=>c.name,
  ()=>({bg:'#eee',fg:'#333'}),
  FILTERS, WIN);

const COACHES=[{id:'c1',name:'ANN'},{id:'c2',name:'RANDY'},{id:'c3',name:'ZOE'},{id:'c4',name:'BARRY'}];
const names=html=>Array.from(html.matchAll(/onclick="calSetCoach\('([^']+)'\)"/g)).map(m=>m[1]);
const courseOrder=html=>Array.from(html.matchAll(/onclick="calSetCourse\('([^']+)'\)"/g)).map(m=>m[1]);
const chipOf=(html,id)=>{
  const parts=html.split('<button');
  return '<button'+parts.find(p=>p.includes(`calSetCoach('${id}')`)||p.includes(`calSetCourse('${id}')`));
};

console.log('① 堂數顯示出來');
{
  const h=api.calCoachChips(COACHES,'all',{all:40,c1:5,c2:25,c3:0,c4:10});
  ok('★★★ 每一顆都帶數字（使用者原話：例如[RANDY 25]）',
     /RANDY<b class="cchip-n">25<\/b>/.test(h), h.match(/RANDY[^<]*<b[^>]*>\d+/)||h.slice(0,200));
  ok('★★ 「全部」也有總數', /全部<b class="cchip-n">40<\/b>/.test(h));
  ok('★★ 0 也照樣寫出來（寫 0 比不寫清楚：那是「這週沒課」不是「壞掉了」）',
     /ZOE<b class="cchip-n">0<\/b>/.test(h));
}

console.log('\n② 課越多往前排');
{
  const h=api.calCoachChips(COACHES,'all',{all:40,c1:5,c2:25,c3:0,c4:10});
  eq('★★★ 教練依堂數由多到少（全部永遠第一顆）', names(h), ['all','c2','c4','c1','c3']);
  const h2=api.calCourseChips({all:40,'ev-pt':20,'ev-friendly':3,'ev-group':12,'ev-self':5,'ev-trial':0,'ev-massage':0});
  eq('★★★ 課種也依堂數排', courseOrder(h2), ['all','ev-pt','ev-group','ev-self','ev-friendly','ev-trial','ev-massage']);
  /* 同分時不要每次重畫都換位置 —— 教練用名字排、課種維持原本的清單順序。 */
  const h3=api.calCoachChips(COACHES,'all',{all:0,c1:7,c2:7,c3:7,c4:7});
  eq('★★ 教練同分時用名字排（順序穩定，不會每次重畫都跳）', names(h3), ['all','c1','c4','c2','c3']);
  const h4=api.calCourseChips({all:0,'ev-pt':2,'ev-friendly':2,'ev-group':2,'ev-self':2,'ev-trial':2,'ev-massage':2});
  eq('★★ 課種同分時維持 CALENDAR_COURSE_FILTERS 的原順序',
     courseOrder(h4), ['all','ev-pt','ev-friendly','ev-group','ev-self','ev-trial','ev-massage']);
}

console.log('\n③ 沒課就暗化，但不藏起來');
{
  const h=api.calCoachChips(COACHES,'all',{all:40,c1:5,c2:25,c3:0,c4:10});
  ok('★★★ 0 堂的那顆掛 is-empty', /class="cal-chip cal-chip-coach is-empty"/.test(chipOf(h,'c3')));
  ok('★★★ 還在畫面上（不是 display:none）—— 藏起來會讓人以為那位教練離職了',
     h.includes('ZOE') && names(h).includes('c3'));
  ok('★★★ 原因寫在 title 上（0823「不能用就寫原因，別藏按鈕」）',
     /title="ZOE　這幾天沒有課"/.test(chipOf(h,'c3')));
  ok('★★ 有課的那顆 title 寫「只看 X　N 堂」', /title="只看 RANDY　25 堂"/.test(chipOf(h,'c2')));
  ok('★★ 螢幕報讀器也知道它不能按', /aria-disabled="true"/.test(chipOf(h,'c3'))
     && !/aria-disabled/.test(chipOf(h,'c2')));
  ok('★★★ CSS 讓它真的點不動（只靠 aria 不夠）',
     /\.cal-chip\.is-empty\{[^}]*pointer-events:none;/.test(src));
  const hc=api.calCourseChips({all:40,'ev-pt':20,'ev-friendly':0,'ev-group':12,'ev-self':5,'ev-trial':0,'ev-massage':3});
  ok('★★ 課種那排同一套', /is-empty/.test(chipOf(hc,'ev-trial'))
     && /title="體驗課　這幾天沒有課"/.test(chipOf(hc,'ev-trial')));
}

console.log('\n④ 選中的那顆永遠不暗化（否則會卡死）');
{
  /* 選了 ZOE 之後翻到她沒課的一週：那顆會是 0 堂。
     如果照樣暗化＋pointer-events:none，它就取消不掉了（要靠「全部」才回得去）。 */
  const h=api.calCoachChips(COACHES,'c3',{all:0,c1:0,c2:0,c3:0,c4:0});
  ok('★★★ 0 堂但被選中 → 不掛 is-empty', !/is-empty/.test(chipOf(h,'c3')));
  ok('★★★ 而且仍然點得動（沒有 aria-disabled）', !/aria-disabled/.test(chipOf(h,'c3')));
  ok('★★ title 改成「再點一次看全部」', /title="再點一次看全部"/.test(chipOf(h,'c3')));
  const hc=api.calCourseChips({all:0,'ev-pt':0,'ev-friendly':0,'ev-group':0,'ev-self':0,'ev-trial':0,'ev-massage':0});
  ok('　 課種沒選任何一種時，六顆都是 0 → 全部暗化（「全部」那顆不會）',
     (hc.match(/is-empty/g)||[]).length===6 && !/is-empty/.test(chipOf(hc,'all')));
  WIN._calCourse='ev-trial';
  const hc2=api.calCourseChips({all:0,'ev-pt':0,'ev-friendly':0,'ev-group':0,'ev-self':0,'ev-trial':0,'ev-massage':0});
  ok('★★★ 選中的課種 0 堂也不暗化（同教練那排，否則取消不掉）',
     !/is-empty/.test(chipOf(hc2,'ev-trial')) && /title="再點一次看全部"/.test(chipOf(hc2,'ev-trial')));
  WIN._calCourse='all';
}

console.log('\n⑤ 計數與畫面共用同一套判斷');
ok('★★★ 抽出 _calPass，繪製與計數都呼叫它',
   /const _calPass=\(b, coachSel, courseSel\)=>\{/.test(src)
   && /const visible=mergeGroupBookings\(bookings\.filter\(b=>_calPass\(b, filterCoach, window\._calCourse\)\)\);/.test(src)
   && /mergeGroupBookings\(_chipPool\.filter\(b=>_calPass\(b, coachSel, courseSel\)\)\)\.length;/.test(src));
ok('★★★ 計數一定要先併團課（一位學員一筆，不併會灌成好幾倍）',
   /一定要跟課卡一樣先 mergeGroupBookings：一堂團課在資料上是多筆/.test(src)
   && /mergeGroupBookings\(_chipPool\.filter/.test(src));
ok('★★★ 只數目前看得到的那幾天',
   /const _chipDays=new Set\(days\.map\(d=>ymd\(d\)\)\);/.test(src)
   && /const _chipPool=bookings\.filter\(b=>b && _chipDays\.has\(String\(b\.date\|\|''\)\.slice\(0,10\)\)\);/.test(src));
ok('★★★ 交叉計算：教練那排帶目前的課種、課種那排帶目前的教練',
   /chipN=\{coach:\{all:_chipCount\('all', window\._calCourse\)\},\s*\n\s*course:\{all:_chipCount\(filterCoach,'all'\)\}\};/.test(src)
   && /chipN\.coach\[c\.id\]=_chipCount\(c\.id, window\._calCourse\);/.test(src)
   && /chipN\.course\[f\.cls\]=_chipCount\(filterCoach, f\.cls\);/.test(src));
ok('★★ 為什麼要交叉算，寫在原地',
   /也就是每一顆都回答「我點下去會剩幾堂」，而不是「這週總共幾堂」/.test(src));

console.log('\n⑥ 排版細節');
ok('★★ 數字用 tabular-nums（不然 1 跟 8 寬度不同，整排鈕會忽寬忽窄）',
   /\.cal-chip \.cchip-n\{[\s\S]{0,120}?font-variant-numeric:tabular-nums;/.test(src));
ok('★ 數字是附註不是主角（不加深色、透明度壓低）',
   /\.cal-chip \.cchip-n\{[\s\S]{0,180}?opacity:\.62;/.test(src));
ok('★★ 排序會換位置這件事寫在原地（下一個人才知道不是 bug）',
   /排序有代價：翻週時鈕會換位置，記不住「ZOE 在第幾顆」/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
