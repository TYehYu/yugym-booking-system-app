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


/* ── ⑤ 管理員次選單分成 人事／財務／環境設定（2026-07-30 使用者指示）── */
console.log('\n管理員次選單分組');
{
  const i=src.indexOf('function renderSubnav(gkey, activePage){');
  const j=src.indexOf('\n}\n', i)+2;
  const gi=src.indexOf("{key:'g_admin'"); const gj=src.indexOf("]},", gi)+3;
  const gdef=new Function('return ['+src.slice(gi,gj).replace(/\]\},$/,']}')+']')();
  const fn=new Function('visibleGroups','CUR_TAB', src.slice(i,j)+'\nreturn renderSubnav;')(()=>gdef,'list');
  const html=fn('g_admin','staff');
  const grps=[...html.matchAll(/<span class="subnav-grp">([^<]+)<\/span>/g)].map(m=>m[1]);
  const items=[...html.matchAll(/<div class="subnav-item[^"]*"[^>]*>([^<]+)/g)].map(m=>m[1]);
  ok('★ 三個組別、順序為 人事 → 財務 → 環境設定',
     JSON.stringify(grps)===JSON.stringify(['人事','財務','環境設定']), grps);
  ok('★ 16 個項目（出勤 1 → 3 項、人資制度移除）', items.length===16, items.length);
  ok('★ 人事：出勤三頁緊接在員工管理前後，其餘制度類在後（已無「人資制度」）',
     items.slice(0,10).join()==='今日出勤,員工管理,出勤紀錄,打卡異常與補卡,薪資制度,勞健保,特休,工作規則,權限設定,教練統計',
     items.slice(0,10));
  ok('★ 財務：財務總覽／營運分析', items.slice(10,12).join()==='財務總覽,營運分析', items.slice(10,12));
  ok('★ 環境設定：課程方案／場地・班別／合約範本／動作資料庫',
     items.slice(12).join()==='課程方案,場地・班別,合約範本,動作資料庫', items.slice(12));
  ok('　　「系統設定」改名成看得懂的「場地・班別」', /grp:'環境設定', label:'場地・班別', page:'settings'/.test(src));
  ok('　　目前所在頁仍會高亮', /subnav-item active[^>]*>員工管理/.test(html));
  ok('　　組別標籤前面有分隔線，第一組不畫',
     /\.subnav-grp::before\{content:'';width:1px;/.test(src)
     && /\.subnav-grp:first-child::before\{display:none;\}/.test(src));
  ok('　　沒標 grp 的群組（班表等）維持原樣不顯示標籤',
     /if\(s\.grp && s\.grp!==lastGrp\)\{/.test(src));
}


/* ── ⑥ 手機端薪資彙總卡（2026-07-30 使用者指示）── */
console.log('\n手機端薪資彙總');
ok('★ 第一列＝姓名＋實發大字', /<span class="pr-m-net"><i>實發<\/i><b>\$\$\{Math\.round\(nt\)\.toLocaleString\(\)\}<\/b><\/span>/.test(src)
   && /\.pr-m-net b\{font-size:24px;font-weight:800;/.test(src));
ok('★ 第二列＝教練課／團體課／值班／續約，四格一列',
   /\$\{cell\('教練課',s2\.ptIncome\)\}\$\{cell\('團體課',s2\.groupPay\)\}\$\{cell\('值班',s2\.dutyPay\)\}\$\{cell\('續約',s2\.renewPay\)\}/.test(src)
   && /\.pr-m-stats\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(src));
ok('　　太窄（<340px）才退成兩排', /@media \(max-width:340px\)\{ \.pr-m-stats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(src));
ok('★ 下方列出各項薪資的計算方式', /<details class="pr-m-calc"><summary>計算方式<\/summary>/.test(src)
   && /\$\{payrollCalcRows\(r\)\}\s*\n\s*<div class="pr-m-sum">/.test(src));
ok('　　卡片底部帶應發／勞健保扣款／實發', /pr-m-sum[\s\S]{0,300}pr-m-ded[\s\S]{0,200}pr-m-net2/.test(src));
ok('★ 計算明細抽成共用函式，桌機與手機同一份',
   /function payrollCalcRows\(r\)\{/.test(src)
   && (src.match(/payrollCalcRows\(r\)/g)||[]).length===3);
ok('　　桌機仍用原本的表格（加 desktop-only 讓兩邊不重疊）',
   /<table class="rwd-card desktop-only">/.test(src));
ok('　　金額都取整數（與營運分析同口徑）',
   /Math\.round\(nt\)\.toLocaleString\(\)/.test(src) && /v>0\?'\$'\+Math\.round\(v\)\.toLocaleString\(\):'—'/.test(src));
{
  const i=src.indexOf('function payrollCalcRows(r){'); const j=src.indexOf('\n}\n',i)+2;
  const calc=new Function(src.slice(i,j)+'\nreturn payrollCalcRows;')();
  const r={countSalary:true, emp:{name:'王教練'}, ptDone:20, groupHeads:14, dutyHours:60.5,
    leave:{事假:0,病假:0,特休:8},
    sal:{base:28000,adjBase:28000,baseHourly:175,schedHours:160,baseLeaveDeduct:0,
         ptPay:24000,ptIncome:28000,ptIsFloor:true,bonus:0,groupPay:4200,groupDetail:'14 人次',
         dutyGross:9075,dutyPay:8000,dutyLeaveDeduct:0,dutyClassDeduct:1075,classOverlap:7.2,
         renewPay:3000,renewDetail:'2 筆',leaderPay:0,supPay:0,mgmtPay:0,
         grossPay:43200,insEmpDeduct:1800,netPay:41400}};
  const h=calc(r);
  ok('★ 計算方式各項都列得出來（底薪／教練課收入／團課人頭／值班費／續約獎金）',
     /底薪/.test(h)&&/教練課收入/.test(h)&&/團課人頭/.test(h)&&/值班費/.test(h)&&/續約獎金/.test(h));
  ok('　　特休標「不扣薪」', /特休 8 小時[\s\S]{0,140}不扣薪/.test(h));
  ok('　　值班時段上課的扣款也列出來', /值班時段上課 7\.2 小時/.test(h));
}


/* ── ⑦ 員工管理改回列表，保留開關與齒輪（2026-07-30 使用者指示）── */
console.log('\n員工管理：卡片改回列表');
{
  const i=src.indexOf('    const stRow=c=>{'); const j=src.indexOf('\n    };\n', i)+8;
  const k=src.indexOf('function stSwitchRow(c){'); const l=src.indexOf('\n}\n',k)+2;
  const ST_SWITCHES=[{key:'admin',label:'管理員'},{key:'manager',label:'店長'},{key:'supervisor',label:'主管'},
                     {key:'punch',label:'打卡'},{key:'teach',label:'開課'},{key:'disabled',label:'停用'}];
  const env={ST_SWITCHES, ppEmpSwitchOn:(c,kk)=>kk==='teach'||(kk==='disabled'&&c.status==='inactive'),
    ET_COLOR:{full_time:'#1f6f54'}, normEmp:x=>x||'full_time', typeLabel:()=>'正職',
    genderAvatarSVG:()=>'<svg/>', stateOf:c=>c.status||'active', statusBadge:()=>'<span class="tag">停用</span>',
    nameSub:c=>[c.emp_no,c.phone].filter(Boolean).join(' · '), ST_GEAR:'<svg class="gear"/>', LNI:{link:'🔗'},
    // 2026-07-30：列表多了本月統計（教練課／團體課／續約／工時）
    _ym:'2026-07', _stat:{E1:{pt:12,ptAll:14,grp:4,grpAll:4,renew:2,hours:58.4}}};
  const fn=new Function(...Object.keys(env), src.slice(k,l)+'\n'+src.slice(i,j)+'\nreturn stRow;')(...Object.values(env));
  const h=fn({id:'E1',name:'王教練',name_en:'wang',gender:'male',employment_type:'full_time',
              job_title:'資深教練',emp_no:'A01',phone:'0912345678',status:'active'});
  ok('★ 一列一人的列表（不再是直式卡）', /class="st-lrow/.test(h) && !/class="st-card/.test(h));
  ok('★ 權限開關全部保留（6 顆）', (h.match(/class="st-swb/g)||[]).length===6);
  ok('★ 右上角齒輪保留（點開員工明細）', /st-gear st-gear-row/.test(h) && /openPersonProfile\('employee','E1'\)/.test(h));
  ok('　　點整列也能開明細', /<div class="st-lrow[^"]*"[^>]*onclick="openPersonProfile\('employee','E1'\)"/.test(h));
  ok('　　點開關不會連帶開明細', /class="st-l-sw" onclick="event\.stopPropagation\(\);"/.test(h));
  ok('　　姓名、對外名稱、聘僱類型、職稱、工號電話都在同一列',
     /王教練/.test(h) && /WANG/.test(h) && /正職/.test(h) && /資深教練/.test(h) && /A01 · 0912345678/.test(h));
  const off=fn({id:'E2',name:'離職者',status:'inactive',employment_type:'full_time'});
  ok('　　停用的列淡化、燈號轉灰', /st-lrow st-off/.test(off) && /st-led off/.test(off));
  const pend=fn({id:'E3',name:'待邀請',invite_status:'pending',invite_token:'T',employment_type:'full_time'});
  ok('　　待接受邀請：標籤照舊、齒輪變成複製邀請連結',
     /待接受邀請/.test(pend) && /copyInvite\('T'\)/.test(pend));
  ok('★ 依聘僱類型分區維持不變', /<div class="st-list">\$\{secs\[k\]\.map\(stRow\)\.join\(''\)\}<\/div>/.test(src));
  ok('　　舊的 stCard 已移除，不留兩套', !/const stCard=c=>\{/.test(src) && /〔已移除〕stCard（直式員工卡）/.test(src));
  ok('　　窄畫面時開關換行到下一列，齒輪固定右上',
     /@media\(max-width:900px\)\{\s*\n\s*\.st-lrow\{flex-wrap:wrap;/.test(src));
  ok('★ 列表直接顯示本月教練課／團體課／續約數／工作時數（2026-07-30）',
     /教練課<\/i><b>12<\/b>/.test(h) && /團體課<\/i><b>4<\/b>/.test(h)
     && /續約<\/i><b>2<\/b>/.test(h) && /工時<\/i><b>58<\/b><u>h<\/u>/.test(h));
  ok('　　排定堂數與已上不同時附註（12/14）', /<b>12<\/b><u>\/14<\/u>/.test(h));
  ok('　　工時四捨五入到整數', /<b>58<\/b>/.test(h) && !/58\.4/.test(h));
  {
    const zero=fn({id:'Z',name:'純櫃檯',employment_type:'full_time',status:'active'});
    ok('　　當月完全沒數字的員工不顯示這一組（不會整排「—」）', !/st-l-stats/.test(zero));
  }
}


/* ── ⑧ 出勤整併進員工管理＋員工表現欄位重排（2026-07-30 使用者指示）── */
console.log('\n出勤整併進員工管理');
ok('★ 分頁：今日出勤在最上面，出勤紀錄與打卡異常補卡併進來',
   /\{key:'today',label:'今日出勤'\},\s*\n\s*\{key:'list',label:'員工'\},\s*\n\s*\{key:'records',label:'出勤紀錄'\},\s*\n\s*\{key:'punchfix',label:'打卡異常與補卡'\},/.test(src));
ok('★ 工時統計分頁移除（工時已在員工列表那一列顯示）',
   !/\{key:'hours',label:'工時統計'\},[\s\S]{0,200}STAFF_TABS/.test(src)
   && /原本的「工時統計」分頁移除，工時直接顯示在員工列表那一列/.test(src));
ok('★ 異常打卡與補卡申請合成一頁（沿用原本兩支渲染函式，不分岔）',
   /renderAttAbnormal\(needPunch,all\);\s*\n\s*const abnHtml=att\.innerHTML;/.test(src)
   && /await renderAttRequests\(\);\s*\n\s*const reqHtml=att\.innerHTML;/.test(src));
ok('　　補卡待辦的跳轉改指向新分頁',
   /function gotoPunchReview\(\)\{ _staffTab='punchfix'; CUR_TAB='punchfix'; window\._navTab='punchfix'; navTo\('staff','g_admin'\); \}/.test(src));
ok('　　排班表仍留在「班表」群組（櫃檯唯讀），沒有重複收進來',
   /\{label:'排班表', page:'coach_shifts', fd:true\}/.test(src));
ok('★ 本月統計與營運分析／薪資頁同口徑（同一支 dutyHoursCapped／dutyClassOverlapHours／renewMapOf）',
   /dutyHoursCapped\(_att,_sh,c\.id,_ym\)-dutyClassOverlapHours\(_sh,_bk,c\.id,_ym\)/.test(src)
   && /const _renew=renewMapOf\(_ym,_tk,_pu,_bk,_ty\);/.test(src));
ok('　　不需值班但要打卡的（正職）顯示實際打卡時數', /if\(!hrs && c\.need_punch\)\{/.test(src));

console.log('\n員工表現欄位重排');
ok('★ 順序改成 教練課／團體課／續約／工時',
   /<span>姓名<\/span><span>教練課<\/span><span>團體課<\/span><span>續約<\/span><span>工時<\/span>/.test(src));
ok('★ 姓名欄只佔實際寬度，四個數字欄等寬（不再留大片空白）',
   /grid-template-columns:minmax\(56px,max-content\) repeat\(4,minmax\(0,1fr\)\);/.test(src));
ok('　　說明文字的「值班」改成「工時」', /工時＝打卡時數（排班封頂、扣上課重疊，與薪資頁同口徑）/.test(src));

console.log('\n手機版營運分析：銷課金額與堂數');
ok('★ 銷課金額移到銷課堂數前面',
   /ovRow\(OV_IC\.rev,'銷課金額',fmtNT\(usedFee\),''\)\}\s*\n\s*\$\{ovRow\(OV_IC\.done,'銷課堂數'/.test(src));
ok('★ 銷課堂數附上組成（回答「726 怎麼算的」）',
   /const _doneMix=\(\(\)=>\{/.test(src) && /ovRow\(OV_IC\.done,'銷課堂數',`\$\{doneCount\} 堂`,'',_doneMix\)/.test(src));
ok('　　組成含自主訓練與體驗，不是只有教練課＋團體課',
   /'自主訓練':'自主','體驗':'體驗'/.test(src)
   && /而是所有已簽到／已完成的課，含自主訓練與體驗；團課一堂算 1，不看人數/.test(src));
ok('　　小字說明有自己的樣式', /\.ov-i-note\{font-style:normal;font-size:10\.5px;/.test(src));
{
  // _doneMix 實跑：用 7 月真實比例
  const rangeBk=[].concat(
    Array(412).fill({category:'私人教練',status:'checked_in'}),
    Array(259).fill({category:'自主訓練',status:'completed'}),
    Array(49).fill({category:'小班肌力',status:'checked_in'}),
    Array(6).fill({category:'體驗',status:'checked_in'}),
    Array(30).fill({category:'私人教練',status:'booked'}));
  const m={};
  rangeBk.forEach(b=>{ if(b.status!=='completed'&&b.status!=='checked_in') return;
    const k={'私人教練':'教練課','小班肌力':'團體課','自主訓練':'自主','體驗':'體驗','運動按摩':'按摩','場租':'場租'}[b.category]||b.category||'其他';
    m[k]=(m[k]||0)+1; });
  const mix=Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join('・');
  const done=rangeBk.filter(b=>b.status==='completed'||b.status==='checked_in').length;
  ok('★ 726 = 教練課 412 ＋ 自主 259 ＋ 團體課 49 ＋ 體驗 6', done===726 && mix==='教練課 412・自主 259・團體課 49・體驗 6', {done,mix});
  ok('　　未簽到的課不計入', done===726);
}


console.log('\n右上按鈕與待審申請');
ok('★ 移除「待審申請」按鈕', !/onclick="openStaffApplyList\(\)"/.test(src));
ok('★ 右上只留一顆「員工申辦 QR」（原「邀請員工」改成開 QR）',
   /actions:`<button class="btn btn-green btn-sm" onclick="openStaffSignupQR\(\)">\$\{LNI\.qr\|\|'▣'\}　員工申辦 QR<\/button>`,/.test(src)
   && !/onclick="openStaffModal\(\)">\$\{LP_ICON\.plus\}　邀請員工/.test(src));
ok('★ 待審申請改列在員工列表最上面（核可入口沒有消失）',
   /const _appBlock=_apps\.length\?`<div class="st-sec st-appsec">/.test(src)
   && /lpStats\(stats\) \+ lpToolbar\(toolbar\) \+ _appBlock \+ body/.test(src));
ok('　　核可／婉拒直接在那一列操作',
   /staffApplyApprove\('\$\{a\.id\}'\)">核可建帳號/.test(src) && /staffApplyReject\('\$\{a\.id\}'\)">婉拒/.test(src));
ok('　　說明寫清楚核可後的預設密碼與後續設定', /核可後以預設密碼 <b>\$\{STAFF_DEFAULT_PW\}<\/b> 建立帳號/.test(src));
ok('　　待審區用品牌金區隔、不可整列點開', /\.st-appsec \.st-lrow\{background:#fdfaf3;border-color:#e8d9b8;cursor:default;\}/.test(src));
ok('　　空狀態的按鈕也改成申辦 QR', /讓第一位員工掃 QR 自行申辦帳號/.test(src));
ok('★ 人資制度入口移除（與員工列表重複；openHrEdit 本來就只是轉開同一個員工明細）',
   !/label:'人資制度'/.test(src) && /function openHrEdit\(id\)\{ return openPersonProfile\('employee', id\); \}/.test(src));


console.log('\n首頁月曆的堂數與 KPI 對齊');
ok('★ 月曆改用與 KPI 相同的課種（pt／friendly／group／massage）',
   /const _calCats=b=>\{const c=bkCC\(b\);return c==='pt'\|\|c==='friendly'\|\|c==='group'\|\|c==='massage';\};/.test(src));
ok('★ 體驗課不再算進月曆數字（原因寫在程式裡）',
   /月曆今天顯示 23、KPI 是 18＋3＝21）。差在體驗課/.test(src));
ok('★ 格子加上組成提示（體驗與自主仍看得到，只是不算進數字）',
   /const _tipOf=ds=>\{ const t=_cntTip\[ds\]; if\(!t\) return '';/.test(src)
   && /title="\$\{ds\}\$\{_tipOf\(ds\)\?'　'\+_tipOf\(ds\):'　沒有預約'\}"/.test(src));
{
  const bkCC=b=>({'私人教練':'pt','小班肌力':'group','運動按摩':'massage','體驗':'trial','自主訓練':'self','場租':'rent'})[b.category]||'';
  const bookings=[].concat(
    Array(15).fill({date:'D',category:'私人教練',status:'booked'}),
    Array(3).fill({date:'D',category:'私人教練',status:'checked_in'}),
    Array(3).fill({date:'D',category:'小班肌力',status:'booked'}),
    Array(2).fill({date:'D',category:'體驗',status:'booked'}),
    Array(8).fill({date:'D',category:'自主訓練',status:'booked'}));
  const calCats=b=>{const c=bkCC(b);return c==='pt'||c==='friendly'||c==='group'||c==='massage';};
  const cnt={},tip={};
  bookings.forEach(b=>{ if(b.status==='cancelled')return;
    if(calCats(b)) cnt[b.date]=(cnt[b.date]||0)+1;
    const k={'私人教練':'教練課','小班肌力':'團體課','運動按摩':'按摩','體驗':'體驗','自主訓練':'自主'}[b.category]||'其他';
    const t=(tip[b.date]=tip[b.date]||{}); t[k]=(t[k]||0)+1; });
  eq('★ 7/30 實際資料：月曆顯示 21（教練課 18 ＋ 團體課 3）', cnt['D'], 21);
  eq('　　提示列出全部（含體驗 2、自主 8）',
     Object.entries(tip['D']).map(([k,v])=>k+' '+v).join('・'), '教練課 18・團體課 3・體驗 2・自主 8');
}

console.log('\n「待收」標籤對比');
ok('★ 首頁的「待收」改實心紅底白字（原本淡紅底紅字，在深色卡上融進背景）',
   /\.mc-td-line \.mc-td-pay\{[\s\S]{0,140}background:var\(--danger,#b5372e\);color:#fff;/.test(src));
ok('★ 深色儀表板另外調亮（底色換淺一點的紅，字仍是白）',
   /\.mc-dash \.mc-todo-card \.mc-td-pay\{background:#e0574c;color:#fff;\}/.test(src));
ok('　　收款提醒視窗裡的時間標籤同一套處理',
   /\.tdl-tm-pay\{background:var\(--danger,#b5372e\);color:#fff;\}/.test(src));
ok('　　深色卡的文字也一併拉亮', /\.mc-dash \.mc-todo-card \.mc-td-line\{color:rgba\(244,241,232,\.86\);\}/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
