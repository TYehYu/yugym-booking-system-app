/* 「此方案已展延，不得退費」要出現在每一個畫得出票券的地方
   （2026-08-25 使用者指示：「被延展的課卡要顯示 此方案已展延不得退費」）

   原本這句只寫在兩個地方：
     ・後台會員檔案「持有中」的票券卡 —— 寫成「已展延（不得退費）」
     ・會員卡展開後的「使用規則」那一段（lottoRuleNote）
   而 **會員端 V2 的卡片根本不畫那一段**（mtkV2 分支提早 return，沒有 ${detail}），
   歷史紀錄那一區也只寫「已展延」三個字、沒講不得退費 ——
   真正需要知道這件事的人反而看不到。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* ── 實跑 tkExtBadge ───────────────────────────────────────── */
const i=src.indexOf('function tkIsExtended(t){');
const j=src.indexOf('function tkExtBadge(t, cls){');
let d=0,k=src.indexOf('{',j);
for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) break;} }
const TXT=(src.match(/const TK_EXT_TEXT='([^']+)';/)||[])[1];
const mk=new Function(src.slice(i,src.indexOf('\n',i))+'\n'+src.slice(src.indexOf("const TK_EXT_TEXT="),k+1)
  +'\nreturn {tkExtBadge,TK_EXT_TEXT};');
const {tkExtBadge}=mk();

console.log('實跑 tkExtBadge');
ok('★★ 文案就是使用者要的那一句（已，不是以）', TXT==='此方案已展延，不得退費', TXT);
ok('★ 展延過的票吐出膠囊',
   /class="tk-noref"/.test(tkExtBadge({extended_from:'2026-05-01'}))
   && tkExtBadge({extended_from:'2026-05-01'}).indexOf(TXT)>0);
ok('★ 沒展延過的完全不畫（不是畫一顆空的）', tkExtBadge({})==='' && tkExtBadge(null)==='');
ok('★ title 補上出處，滑上去知道是合約規則',
   /title="此方案已展延，不得退費（合約〔展延規則〕）"/.test(tkExtBadge({extended_from:'2026-05-01'})));
ok('　　吃得到額外 class（有些地方要調間距）',
   /class="tk-noref x"/.test(tkExtBadge({extended_from:'2026-05-01'},'x')));

console.log('\n每個畫得出票券的地方都掛同一顆');
ok('★★ 會員端 V2 卡片（memh2 那一支才是會員真的在用的）',
   /<span class="mck-v2-left">\$\{_tag\}\$\{tkExtBadge\(t\)\}/.test(src));
ok('★★ 會員端舊版卡片', /:\(soon\?`<span class="mck-badge mck-badge-warn">\$\{days\} 天後到期<\/span>`:''\)\}\$\{tkExtBadge\(t\)\}/.test(src));
ok('★★ 後台會員檔案「持有中」的票券卡（桌機與管理員手機兩種版型）',
   (src.match(/\$\{tkIsExtended\(t\)\?`　·　\$\{tkExtBadge\(t\)\}`:''\}/g)||[]).length===2);
ok('★★ 後台「已過期方案／歷史紀錄」—— 原本只寫「已展延」，沒講不得退費',
   /\$\{shrTag\}\$\{tkExtBadge\(t\)\}<\/span>/.test(src)
   && !/pp-hist-tag">已展延</.test(src));
ok('★ 舊的兩種寫法都收掉了（同一件事只有一種說法）',
   !/已展延（不得退費）/.test(src));
ok('　　票券管理頁的展延列維持原樣（那裡本來就有「不得申請退費」，且講的是起訖日）',
   /<span class="tk-ext-no">不得申請退費<\/span>/.test(src)
   && /<span class="tk-ext-no">展延後不得退費<\/span>/.test(src));

console.log('\n樣式');
ok('★ 用品牌金不用紅（事實陳述、不是要人立刻處理的警示 —— 紅>金>綠）',
   /\.tk-noref\{[^}]*color:var\(--gold-d/.test(src) && !/\.tk-noref\{[^}]*var\(--danger/.test(src));
ok('　　淡化的卡片上跟著淡（不能比票卡本身還搶眼）', /\.mck-dim \.tk-noref\{opacity:\.75;\}/.test(src));
ok('　　不換行、不被壓扁', /\.tk-noref\{[^}]*white-space:nowrap[^}]*flex-shrink:0/.test(src));

console.log('\n來由寫在原地');
ok('★ 為什麼會員 V2 看不到（提早 return、沒畫 detail）寫在註解裡',
   /會員端 V2 的卡片根本不畫那一段/.test(src) && /真正需要知道這件事的人反而看不到/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
