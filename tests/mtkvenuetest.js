/* 2026-08-03 使用者指示：「會員預約的自主訓練，如果是教室或跑步機，
   要在他們首頁的圓形卡顯示場地」

   圓形卡 30px 圓、日期置中 —— 場地掛在圓下緣的迷你徽章（跑＝跑步機、教＝教室），
   預設多功能訓練區不標（selfVenueLabel 既有口徑）。tooltip 也帶全名。 */
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
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};

const deps={ tkVisual:()=>({accent:'#6a655c'}), bkIsSelf:b=>b&&b.category==='自主訓練', bkIsGroup:()=>false,
  grpSeatAttCount:()=>0, parseYmd, bkSelfBooked:()=>false,
  selfVenueLabel:b=>{ const u=String(b.venue_unit||''); return u.startsWith('treadmill')?'跑步機':(u.startsWith('group')?'教室':''); } };
const TT=new Function(...Object.keys(deps),'return '+grabFn('ticketTokens'))(...Object.values(deps));

const T={id:'tk',sessions_total:3};
const B=(id,vu)=>({id,date:'2026-08-06',start_time:'17:00',status:'booked',category:'自主訓練',venue_unit:vu});

console.log('① 圓形卡的場地徽章（實跑 ticketTokens）');
{
  const h=TT(T,[B('a','treadmill_1'),B('b','group_a'),B('c','multi_a')],{},0,null,'M',null);
  ok('★ 跑步機 → 圓下緣「跑」', /<i class="mtk-venue">跑<\/i>/.test(h));
  ok('★ 教室 → 圓下緣「教」', /<i class="mtk-venue">教<\/i>/.test(h));
  eq('★ 預設多功能區不標（3 顆圓只有 2 顆有徽章）', (h.match(/mtk-venue/g)||[]).length, 2);
  ok('★ tooltip 帶場地全名', /已預約 2026-08-06 17:00　·　跑步機/.test(h));
}
{
  const PT={id:'p',date:'2026-08-06',status:'booked',category:'私人教練'};
  const h2=TT(T,[PT],{},0,null,'M',null);
  ok('　　非自主訓練不標（bkIsSelf 守門）', !/mtk-venue/.test(h2));
}

console.log('\n② 樣式與相容');
/* 2026-08-05 使用者回報：列表裡「跑」被下緣切掉 → 徽章收進圓圈內側（不再溢出容器） */
ok('★ 徽章收在圓圈內下緣（不溢出、任何容器都不會被切）',
   /\.mtk-venue\{position:absolute;bottom:3px;left:50%;transform:translateX\(-50%\);font-size:7\.5px;/.test(src)
   && /\.mtk:has\(\.mtk-venue\)\{padding-bottom:7px;\}/.test(src)
   && !/\.mtk-venue\{[^}]*bottom:-5px/.test(src));
/* 0822：紅圈多了「點得開」的 class 與 onclick（見 tkoverfixtest），徽章照舊 */
ok('★ 缺票紅圈（mtk-over）也帶徽章',
   /class="mtk mtk-over\$\{cur\}\$\{slf\}\$\{_canTap\?' mtk-tap':''\}"\$\{_tapAttr\} title="已預約 \$\{b\.date\|\|''\} \$\{b\.start_time\|\|''\}\$\{vlb\?'　·　'\+vlb:''\}/.test(src)
   && /mtk-over[\s\S]{0,700}?\$\{vch\?`<i class="mtk-venue">\$\{vch\}<\/i>`:''\}/.test(src));
ok('　　沒有 selfVenueLabel 的沙箱環境不會炸（typeof 守衛）',
   (src.match(/typeof selfVenueLabel==='function'&&bkIsSelf\(b\)/g)||[]).length===2);

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
