/* 手機首頁配色試點（2026-08-25 使用者指示，附一張深藍底白卡的行事曆 App 截圖）：
   「手機端首頁背景色可以多一個這個選項嗎　先在管理員帳號測試」

   0801 的兩次版面大改都被要求還原，所以這一次刻意把範圍壓到最小：
     ・只吃 管理員＋手機＋首頁 三個條件同時成立
     ・只換底色與底色上的文字；白卡與綠／金／紅的語意一個都不碰
     ・存在 localStorage，不進資料庫，隨時關掉不留痕 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=(sig)=>{ const i=src.indexOf(sig); if(i<0) throw new Error('找不到 '+sig);
  let d=0,k=src.indexOf('{',i);
  for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) break;} }
  return src.slice(i,k+1); };

/* ── 實跑：皮膚的讀寫與掛 class 的條件 ───────────────────────── */
const store={};
const cls=new Set();
const W={ SESSION:null, CUR_PAGE:'', mobile:true };
const mk=new Function('localStorage','document','SESSION_REF','isMobileLayout',
  src.slice(src.indexOf('const ADMH_SKINS=['), src.indexOf('function openAdmhSkin(){'))
  .replace(/\bSESSION\b/g,'SESSION_REF.v')
  +'\nreturn {ADMH_SKINS,admhSkin,admhSkinSet,admhSkinApply};');
const SREF={v:null};
const {ADMH_SKINS,admhSkin,admhSkinSet,admhSkinApply}=mk(
  {getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}},
  {body:{classList:{toggle:(c,on)=>{ on?cls.add(c):cls.delete(c); }}}},
  SREF, ()=>W.mobile);

console.log('皮膚設定');
ok('★ 兩個選項：米色（現況）與深藍', ADMH_SKINS.map(x=>x.key).join(',')==='cream,navy');
ok('★ 預設是米色（沒設定過就是現在的樣子）', admhSkin()==='cream');
admhSkinSet('navy');
ok('★ 選了會記住', admhSkin()==='navy' && store['admh_skin']==='navy');
store['admh_skin']='rainbow';
ok('★★ 存了不認識的值就退回米色（不會整頁變成沒有樣式）', admhSkin()==='cream');
store['admh_skin']='navy';

console.log('\n掛 class 的條件（三個都要成立）');
const on=()=>cls.has('admh-navy');
SREF.v={role:'admin'}; W.mobile=true;
admhSkinApply('dashboard');
ok('★★ 管理員＋手機＋首頁 → 掛上', on()===true);
admhSkinApply('calendar');
ok('★★ 換到別頁就拿掉（不會整個後台變深藍）', on()===false);
admhSkinApply('dashboard'); W.mobile=false; admhSkinApply('dashboard');
ok('★★ 桌機不吃', on()===false);
W.mobile=true;
SREF.v={role:'front_desk'}; admhSkinApply('dashboard');
ok('★★ 櫃檯不吃（使用者說先在管理員帳號測試）', on()===false);
SREF.v={role:'coach',is_manager:true}; admhSkinApply('dashboard');
ok('★★ 店長也不吃', on()===false);
SREF.v={role:'member'}; admhSkinApply('dashboard');
ok('★★ 會員不吃', on()===false);
SREF.v={role:'admin'}; admhSkinApply('dashboard');
ok('　　管理員回來就恢復', on()===true);
store['admh_skin']='cream'; admhSkinApply('dashboard');
ok('★★ 切回米色就拿掉 class（一鍵還原）', on()===false);

console.log('\n入口');
ok('★ 帳號選單有「首頁配色」', /id="acct-homeskin" onclick="closeAcctMenu\(\);openAdmhSkin\(\)"/.test(src)
   && /<\/span>首頁配色<\/button>/.test(src));
ok('★★ 入口只給管理員手機（與皮膚生效的條件一致）',
   /_hsk\.style\.display = \(role==='admin' && typeof isMobileLayout==='function' && isMobileLayout\(\)\)\?'':'none';/.test(src));
ok('★ 選擇視窗用白底列＋綠底選取（與抽獎改項目同一套語彙）',
   /class="ash-eirow ash-ei-2c skin-row\$\{x\.key===cur\?' skin-row-cur':''\}"/.test(src)
   && /\.skin-row\.skin-row-cur\{background:var\(--green\)/.test(src));
ok('　　有色票看得出差別', /class="skin-sw" style="background:\$\{x\.sw\};"/.test(src));
ok('　　講明只記在這台裝置', /這個設定記在<b>這台裝置<\/b>上/.test(src));
ok('★ 換頁時重算（與 chv2-shell／memh2-shell 同一處）',
   /if\(typeof admhSkinApply==='function'\) admhSkinApply\(key\);/.test(src));

console.log('\n只換底色，語意不動');
const CSS=src.slice(src.indexOf('body.admh-navy{'), src.indexOf('.skin-row{'));
ok('★★ 白卡還是白卡（只加深陰影讓它在深底上浮起來，沒有改底色）',
   /body\.admh-navy \.admh2-card\{box-shadow:/.test(CSS)
   && !/body\.admh-navy \.admh2-card\{[^}]*background:/.test(CSS));
ok('★★ 今天＝品牌綠、選取＝品牌金，兩個語意都留著',
   /body\.admh-navy \.a2-day\.a2-today\{background:var\(--green\)/.test(CSS)
   && /body\.admh-navy \.a2-day\.on\{[^}]*border-color:var\(--gold/.test(CSS));
ok('★ 底部導覽的「目前分頁」維持綠色（深底上提亮一階，色相不換）',
   /body\.admh-navy #bottom-nav \.bn-item\.active\{color:#6FBFA6;\}/.test(CSS));
ok('★★ 首頁下半的米色前景片要撐到底（不然米色帶下面又露出深藍）',
   /body\.admh-navy \.mc-dash-wrap\.hero-sheet\{min-height:62vh;\}/.test(CSS));
ok('★ body 自己也要上底色（只設 .content 的話捲過頭會露出白邊）',
   /body\.admh-navy\{[\s\S]{0,600}?background:var\(--nv-bg\);\s*\n\}/.test(CSS));
ok('★ 怎麼收掉這個試點寫在原地', /要收掉這個試點：把 ADMH_SKINS 砍到只剩 cream/.test(src));
ok('　　使用者原話與「小步走」的理由寫在原地',
   /手機端首頁背景色可以多一個這個選項嗎/.test(src)
   && /0801 的兩次版面大改都被要求還原/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
