/* 2026-07-30 上午到中午這批：
   ① 票券金額顯示＋0 元票的備註（隨方案加贈／舊系統匯入無金額／金額待確認）
   ② 管理員手機版首頁課卡可點開簡易資訊；體驗課要顯示客戶姓名
   ③ 銷售視窗下方的左右捲軸
   ④ 營運分析數字四捨五入、手機端利潤靠右 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,a===e,`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* ── ① 票券金額 ─────────────────────────────────── */
console.log('票券金額與備註');
{
  const i=src.indexOf('function tkMoneyHtml(t){'); const j=src.indexOf('\n}\n',i)+2;
  const mk=desk=>new Function('isDeskLike',src.slice(i,j)+'\nreturn tkMoneyHtml;')(()=>desk);
  const f=mk(true), g=mk(false);
  ok('★ 有金額 → 直接顯示金額（千分位）', /\$38,400/.test(f({amount_paid:38400})));
  ok('★ 0 元＋加贈 → 標「$0・加贈」，綠色，滑過看得到隨哪個方案',
     /\$0・加贈/.test(f({amount_paid:0,note:'隨 私人教練課 1V1 24 堂（$38,400） 加贈'}))
     && /tk-amt-gift/.test(f({amount_paid:0,note:'隨 A 加贈'}))
     && /title="隨 A 加贈"/.test(f({amount_paid:0,note:'隨 A 加贈'})));
  ok('★ 0 元＋待確認 → 紅色「$0・待確認」',
     /tk-amt-wait/.test(f({amount_paid:0,note:'金額待確認（購買當日查無收款紀錄）'})));
  ok('　　0 元＋舊系統匯入 → 灰色「$0・無金額」',
     /tk-amt-zero/.test(f({amount_paid:0,note:'舊系統匯入，未帶收款金額'})));
  eq('　　沒有備註就只顯示 $0', /\$0</.test(f({amount_paid:0})), true);
  eq('★ 只有櫃檯／管理員看得到金額（教練與會員端不顯示）', g({amount_paid:38400}), '');
  eq('　　null 不炸', g(null), '');
  ok('★ 會員票券卡與人物檢視兩處都帶上',
     (src.match(/\$\{tkMoneyHtml\(t\)\}/g)||[]).length===2);
  ok('　　金額用等寬數字、0 元依備註分色',
     /\.tk-amt\{font-family:var\(--num\),inherit;/.test(src)
     && /\.tk-amt-gift\{color:var\(--green\);\}/.test(src)
     && /\.tk-amt-wait\{color:var\(--danger,#b5372e\);\}/.test(src));
}

/* ── ② 手機版首頁課卡 ───────────────────────────── */
console.log('\n管理員手機版首頁課卡');
ok('★ 課卡可點，開簡易資訊（原本 CSS 是手指游標卻沒掛事件）',
   /return `<div class="mc-ev" onclick="openCourseCard\('\$\{b\.id\}'\)">\s*\n\s*<div class="mc-ev-time"><span class="mc-ev-t1">\$\{b\.start_time\}<\/span><span class="mc-ev-t2">\$\{end\}<\/span><\/div>\s*\n\s*<div class="mc-ev-bar \$\{barCls\}">/.test(src));
ok('★ 體驗課顯示客戶姓名：trial_name 沒填就退到會員名',
   (src.match(/b\.category==='體驗'\?\(\(b\.trial_name\|\|memMap\[b\.member_id\]\|\|'體驗'\)\)/g)||[]).length===2);
ok('　　一般課反過來也補：會員名沒有就用 trial_name',
   /:\(memMap\[b\.member_id\]\|\|b\.trial_name\|\|'—'\)\);/.test(src));
ok('　　原因寫在程式裡', /已建會員檔的體驗客戶（trial_name 空、member_id 有值）就整個看不到人名/.test(src));

/* ── ③ 銷售視窗的左右捲軸 ───────────────────────── */
console.log('\n彈出視窗不該出現左右捲軸');
ok('★ .modal-wide 補上 overflow-x:hidden',
   /\.modal\.modal-wide\{max-width:720px;width:94vw;max-height:92vh;overflow-y:auto;overflow-x:hidden;\}/.test(src));
ok('★ 原因寫清楚（overflow-y:auto 會讓 overflow-x 從 visible 變 auto）',
   /overflow-y:auto 會讓 overflow-x 的 visible 自動變成 auto（CSS 規範）/.test(src)
   && /\.modal-foot 用 margin:0 -18px 做滿版底條/.test(src));

/* ── ④ 營運分析 ─────────────────────────────────── */
console.log('\n營運分析：數字不要小數點');
{
  const i=src.indexOf("  const fmtNT=(n)=>'$'+Math.round");
  const line=src.slice(i,src.indexOf('\n',i));
  const fmtNT=new Function('return '+line.replace(/^\s*const fmtNT=/,'').replace(/;$/,''))();
  eq('★ 小數四捨五入進位', fmtNT(1234.6), '$1,235');
  eq('★ 小數捨去', fmtNT(1234.4), '$1,234');
  eq('　　負數也四捨五入', fmtNT(-1234.5), '$-1,234');
  eq('　　0／null／undefined 都給 $0', fmtNT(0)+fmtNT(null)+fmtNT(undefined), '$0$0$0');
  eq('　　千分位照舊', fmtNT(1234567), '$1,234,567');
  ok('★ 不再有 .toLocaleString() 直接吃小數的寫法',
     !/const fmtNT=\(n\)=>'\$'\+\(n\|\|0\)\.toLocaleString\(\);/.test(src));
  ok('★ 值班／上班時數也不留小數',
     /\$\{r\.need_duty\|\|r\.hours>0\?Math\.round\(r\.hours\):'—'\}/.test(src)
     && /\$\{r\.need_punch\?Math\.round\(r\.hours\)\+' hr':'—'\}/.test(src));
  ok('★ 手機端利潤區靠右',
     /\.ov-hero\{[\s\S]{0,200}align-items:flex-end;text-align:right;\}/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
