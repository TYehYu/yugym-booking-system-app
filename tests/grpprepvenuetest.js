/* 團課開課前 15 分鐘要清場（2026-08-29 使用者指示）

   「新增一條規則　團課開課前15分鐘　不得預約教室　要讓老師調整教室場地」

   ⚠ 這條規則最危險的地方不是「有沒有擋到」，是「擋過頭」——
     正式庫的團課排法是 19:00→20:00、19:30→20:30，每週固定一堂接一堂
     （2026-08-29 掃過一遍：09/07 以後踩到清場時段的**全部**都是團課接團課）。
     如果一律擋，他們整條團課課表明天就排不出來。所以：
       ・別的課佔著教室 → 擋（這才是「要讓老師調整教室場地」的情境）
       ・團課接團課     → 放行
     判準一律問口袋的 prepMin，不要在場地程式裡再寫一次「哪種課是團課」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 規則寫在口袋裡，不是散在場地程式');
{
  ok('★★ TK_POCKETS.group 帶 prepMin:15',
     /coachLeave:'cancel',[\s\S]{0,600}?prepMin:15,\s*\n\s*\},/.test(src));
  ok('★★ 只有團課那個口袋有 prepMin（其他口袋沒被順手加上）',
     (src.match(/^\s*prepMin:\d+,/gm)||[]).length===1);
  ok('★★ 場地那邊是問 prepMin，不是比對課別字串',
     /const pm=Number\(\(bkPocketNow\(x\)\|\|\{\}\)\.prepMin\)\|\|0; if\(!pm\) return;/.test(src)
     && /const _prep=\(Number\(\(bkPocketNow\(\{category\}\)\|\|\{\}\)\.prepMin\)\|\|0\) \? null : venuePrepAt\(others, ns, ne\);/.test(src));
  ok('★★ 為什麼不能一律擋，寫在原地（下一個人不要「順手補上團課接團課」）',
     /團課接團課不擋/.test(src)
     && /19:00→20:00、19:30→20:30 每週固定一堂接一堂/.test(src));
}

/* ── 把真的程式挖出來跑 ───────────────────────────────────────── */
const cut=(a,b)=>{ const i=src.indexOf(a), j=src.indexOf(b,i); if(i<0||j<0) throw new Error('切不到：'+a); return src.slice(i,j); };
const POCKETS=cut('const TK_POCKETS={','function lpPerson(');
const VENUE=cut('function getVenues(){',
                "  return { error:'該時段沒有可用場地（已額滿）', hardFull:true };\n}")
            + "  return { error:'該時段沒有可用場地（已額滿）', hardFull:true };\n}";
const win={ VENUES:[{id:'multi',name:'多功能訓練區',capacity:3},
                    {id:'group',name:'團課教室',capacity:1},
                    {id:'treadmill',name:'跑步機',capacity:2}],
            _ttCache:[] };
const timeToMin=t=>{ const p=String(t||'0:00').split(':'); return (+p[0])*60+(+p[1]||0); };
const minToTime=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const env=new Function('window','timeToMin','minToTime',
  POCKETS+'\n'+VENUE+'\nreturn {venuePrepAt, venuePrepWhy, allocateVenue, bkPocketNow};')(win, timeToMin, minToTime);
const {venuePrepAt, venuePrepWhy, allocateVenue}=env;

/* 生效日之後的日子；適應期那一段另外測（見 ⑥） */
const D='2026-10-07';
const GRP=(id,time,o)=>Object.assign({id,date:D,start_time:time,duration:60,category:'小班肌力',venue_unit:'group_1'},o||{});
const PT =(id,time,o)=>Object.assign({id,date:D,start_time:time,duration:60,category:'私人教練',venue_unit:'multi_1'},o||{});
const at=t=>timeToMin(t);

console.log('\n② 清場時段本身：只有開課前 15 分鐘，而且只鎖團課那間');
{
  const day=[GRP('g','20:00')];
  eq('★★ 19:45–20:00 是清場時段', Object.keys(venuePrepAt(day, at('19:30'), at('20:00'))), ['group']);
  eq('★★ 19:00–19:45 沒踩到（剛好接在清場前一刻，放行）',
     Object.keys(venuePrepAt(day, at('19:00'), at('19:45'))), []);
  eq('★★ 20:00 之後是上課中，那是佔位不是清場（清場只看開課前）',
     Object.keys(venuePrepAt(day, at('20:00'), at('21:00'))), []);
  eq('★★ 只鎖團課那一間，多功能與跑步機不受影響',
     venuePrepAt(day, at('19:30'), at('20:00')).multi===undefined
     && venuePrepAt(day, at('19:30'), at('20:00')).treadmill===undefined, true);
  ok('★★ 理由講得出「幾點開課、要留幾分鐘、要幹嘛」（櫃檯看得懂才改得動）',
     venuePrepAt(day, at('19:30'), at('20:00')).group==='20:00 團課開課前 15 分鐘要留給老師調整場地');
  eq('★★ 未到課的團課不必清場（與 venueLoadAt 的 no_show 同一個處置）',
     Object.keys(venuePrepAt([GRP('g','20:00',{no_show:true})], at('19:30'), at('20:00'))), []);
  eq('★★ 舊資料沒有 venue_unit 也算（用課別的首選場地回推）',
     Object.keys(venuePrepAt([GRP('g','20:00',{venue_unit:null})], at('19:30'), at('20:00'))), ['group']);
  eq('　 非團課不產生清場時段', Object.keys(venuePrepAt([PT('p','20:00')], at('19:30'), at('20:00'))), []);
}

console.log('\n③ 團課接團課要放行 —— 這是他們每週固定的排法，擋掉就整條課表排不出來');
{
  const day=[GRP('g20','20:00')];
  const a=allocateVenue('小班肌力', day, at('19:00'), at('20:00'), null);
  eq('★★ 19:00 的團課排得進教室（下一堂 20:00 開）', a.error||a.unit, 'group_1');
  const b=allocateVenue('小班肌力', [GRP('g2030','20:30')], at('19:30'), at('20:30'), null);
  eq('★★ 19:30→20:30 那一組也一樣', b.error||b.unit, 'group_1');
  const c=allocateVenue('小班肌力', [GRP('g20','20:00'),GRP('g19','19:00')], at('19:00'), at('20:00'), 'g19');
  eq('★★ 改期時排除自己，不會被自己的清場擋住', c.error||c.unit, 'group_1');
}

console.log('\n④ 別的課佔著教室 → 擋，而且要有退路的先走退路');
{
  const day=[GRP('g','20:00')];
  const self=allocateVenue('自主訓練', day, at('19:30'), at('20:00'), null);
  eq('★★ 自主訓練被擠出教室，改去多功能（本來就是它的首選）', self.error||self.unit, 'multi_1');

  /* 多功能塞滿 → 自主訓練原本會溢到教室，現在要跳過教室去跑步機 */
  const full=[GRP('g','20:00'),PT('p1','19:30',{venue_unit:'multi_1'}),
              PT('p2','19:30',{venue_unit:'multi_2'}),PT('p3','19:30',{venue_unit:'multi_3'})];
  const s2=allocateVenue('自主訓練', full, at('19:30'), at('20:00'), null);
  eq('★★ 多功能滿了也不准溢到清場中的教室，改去跑步機', s2.error||s2.unit, 'treadmill_1');

  const pt=allocateVenue('私人教練', full, at('19:30'), at('20:00'), null);
  ok('★★ 教練課沒有跑步機這條退路 → 擋下來，而且說的是「要清場」不是「已額滿」',
     !!pt.error && pt.prepBlock===true && /團課開課前 15 分鐘/.test(pt.error), pt.error);

  const ms=allocateVenue('運動按摩', day, at('19:30'), at('20:00'), null);
  ok('★★ 運動按摩只能排教室，被擋時更要講清楚原因（不然櫃檯只會看到「額滿」）',
     !!ms.error && ms.prepBlock===true && /20:00 團課開課前 15 分鐘要留給老師調整場地/.test(ms.error), ms.error);

  const forced=allocateVenue('自主訓練', day, at('19:30'), at('20:00'), null, 'group');
  ok('★★ 櫃檯在視窗一硬指定團課教室也一樣擋（forceVid 不是繞過的後門）',
     !!forced.error && forced.prepBlock===true, forced);

  eq('　 沒有團課的日子什麼都沒變（一般時段照舊排首選場地）',
     allocateVenue('自主訓練', [], at('19:30'), at('20:00'), null).unit, 'multi_1');
  eq('　 「已額滿」那條錯誤訊息沒被清場訊息取代',
     allocateVenue('小班肌力', [GRP('x','19:30')], at('19:30'), at('20:30'), null).error,
     '該時段沒有可用場地（已額滿）');
}

console.log('\n⑤ 反查（挑選視窗用）：要清場的課自己不受限');
{
  const day=[GRP('g','20:00')];
  ok('★★ 團課問到的是空字串（不淡化自己）', venuePrepWhy('group','小班肌力',day,at('19:30'),at('20:00'))==='');
  ok('★★ 自主訓練問到的是原因', /團課開課前/.test(venuePrepWhy('group','自主訓練',day,at('19:30'),at('20:00'))));
  ok('★★ 問別的場地沒有原因', venuePrepWhy('multi','自主訓練',day,at('19:30'),at('20:00'))==='');
  ok('　 沒指定場地時不表態', venuePrepWhy('','自主訓練',day,at('19:30'),at('20:00'))==='');
}

console.log('\n⑥ 9 月是適應期（2026-08-29 使用者：「9月先不強制規定 給教練跟客人一個月的適應期」）');
{
  const sep=[GRP('g','20:00',{date:'2026-09-30'})];
  eq('★★ 9/30 的團課不擋（適應期）', Object.keys(venuePrepAt(sep, at('19:30'), at('20:00'))), []);
  eq('★★ 10/01 起就擋（看的是那堂團課的日期，不是今天）',
     Object.keys(venuePrepAt([GRP('g','20:00',{date:'2026-10-01'})], at('19:30'), at('20:00'))), ['group']);
  eq('★★ 適應期也照排得進去（allocateVenue 真的沒擋）',
     allocateVenue('自主訓練', sep, at('19:30'), at('20:00'), null, 'group').unit, 'group_1');
  ok('★★ 適應期問得出「即將生效」的預告（挑課程時要提示，不是完全靜音）',
     /^10\/01 起：團課開課前 15 分鐘不排教室（20:00 開課）$/
       .test(venuePrepWhy('group','自主訓練',sep,at('19:30'),at('20:00'),null,true)));
  ok('★★ 不帶 includeGrace 就完全不表態（送出那條路 9 月一定要放行）',
     venuePrepWhy('group','自主訓練',sep,at('19:30'),at('20:00'))==='');
  ok('★★ 生效後回的是正式理由，不是預告',
     /要留給老師調整場地$/.test(venuePrepWhy('group','自主訓練',[GRP('g','20:00')],at('19:30'),at('20:00'),null,true)));
  eq('★★ 沒有日期的資料一律當成生效（寧可擋錯，也不要讓規則靜悄悄消失）',
     Object.keys(venuePrepAt([GRP('g','20:00',{date:null})], at('19:30'), at('20:00'))), ['group']);
  ok('★★ 生效日與理由寫在原地', /const GRP_PREP_FROM='2026-10-01';/.test(src)
     && /9月先不強制規定　給教練跟客人一個月的適應期/.test(src)
     && /9 月排的 10 月課一樣受規範/.test(src));
}

console.log('\n⑦ 畫面：淡化列出＋副標寫原因，不要藏起來（0823 定的語彙）');
{
  ok('★★ 選擇課程那張清單接上清場原因，與「這個場地不能上這種課」同一條',
     /const _prep=_day\?venuePrepWhy\(_vid, t\.category, _day, _ns, _ne, null\):'';/.test(src)
     && /const bad=bkTypeTimeBad\(t,_d,_tm\) \|\| venueCatWhy\(_vid, t\.category\) \|\| _prep;/.test(src));
  ok('★★ 適應期那一句只當副標預告，照樣可以點（沒有偷偷擋起來）',
     /const _soon=\(_day&&!_prep\)\?venuePrepWhy\(_vid, t\.category, _day, _ns, _ne, null, true\):'';/.test(src)
     && /const sub=_soon \|\| \(\(t\.category&&t\.category!==t\.name\)\?t\.category:''\);/.test(src)
     && /\$\{sub\?`<span class="ash-eisub">\$\{escH\(sub\)\}<\/span>`:''\}<\/button>`;/.test(src));
  ok('★★ 擋下來的課還是列出來、只是 disabled（.ash-ei-off）',
     /if\(bad\) return `<button type="button" class="ash-eirow ash-ei-off" disabled>/.test(src));
  ok('★★ 讀不到當天預約就一律放行，不要把整排課程畫成不能選',
     /const all=await dbGetAll\('bookings'\)\.catch\(\(\)=>null\);\s*\n\s*if\(all\) _day=all\.filter\(x=>x && x\.date===_d && x\.status!=='cancelled'\);/.test(src)
     && /寧可讓 allocateVenue 在送出時擋，\s*\n\s*也不要因為讀取失敗把整排課程畫成不能選/.test(src));
  ok('★★ 先畫殼再讀資料（與 ashVenueOpen 同一套，不要點了沒反應）',
     /<div class="ash-einote">讀取場地狀況…<\/div>/.test(src)
     && (src.match(/讀取場地狀況…/g)||[]).length===2);
  ok('★ 讀取途中被關掉就不要再寫回去',
     /const box=host\.querySelector\('\.adp-box'\); if\(!box\) return;\s+\/\/ 讀取中被關掉了/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
