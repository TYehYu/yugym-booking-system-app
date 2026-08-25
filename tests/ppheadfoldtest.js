/* 會員資料抬頭：詳細資料收合（2026-08-25 使用者指示）
   「會員資料視窗的詳細資料可以收納嗎　需要編輯再打開　平常只要顯示大頭照跟姓名就這列好」

   這一塊是固定在上方不捲的，佔多少高度就等於永久少掉多少可讀區
   （0821「會員資料的上方卡佔比太大了」、0822「上方米色視窗縮短一點」都是同一件事，
     那兩次是收內距與大頭照，這次直接把欄位收起來）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 抬頭那一段（m2 版型）的原始碼 */
const HD=src.slice(src.indexOf('/* 詳細資料預設收起（2026-08-25 使用者指示'),
                   src.indexOf('  return `<div class="pp-head">'));

console.log('收合的判斷');
ok('★★ 預設收起：只有 window._ppHeadOpen 打開才展開',
   /const _hOpen = _selfPP \|\| !!window\._ppHeadOpen;/.test(HD));
ok('★★ 會員看自己的不收（他點進來就是要改性別／生日／緊急聯絡人）',
   /const _hOpen = _selfPP \|\|/.test(HD)
   && /const _hTg = _selfPP \? '' :/.test(HD)
   && /\*\*會員看自己的不收\*\*/.test(HD));
ok('★★ 收起來時三塊都不畫（欄位兩欄＋刪除會員那一列）',
   /\$\{_hOpen\?`<div class="pp-meta pp-idfields">/.test(HD)
   && /\$\{act\?`<div class="pp-head-act">\$\{act\}<\/div>`:''\}`:''\}/.test(HD));
ok('★ 大頭照＋姓名＋等級那一列一直都在（使用者：「就這列好」）',
   /<div class="pp-idtop">[\s\S]*?\$\{_avatar\}[\s\S]*?\$\{_nameHtml\}[\s\S]*?\$\{_selfPP\?'':tierItem\}/.test(HD));
ok('★ 刪除會員跟著收起來（最危險的動作不該一直露在外面）',
   HD.indexOf('pp-head-act')>HD.indexOf('${_hOpen?`'));

console.log('\n開合鈕');
ok('★ 整列可點、字寫清楚（不是一顆光禿禿的箭頭）',
   /<span>\$\{_hOpen\?'收合詳細資料':'詳細資料'\}<\/span>/.test(HD)
   && /class="pp-headtg\$\{_hOpen\?' on':''\}"/.test(HD));
ok('　　有 aria-expanded', /aria-expanded="\$\{_hOpen\?'true':'false'\}"/.test(HD));
ok('★ 箭頭跟著轉', /\.pp-head-m2 \.pp-headtg\.on \.pp-headtg-c\{transform:rotate\(180deg\);\}/.test(src));
ok('★ 收起來時姓名列下面那條分隔線也收掉（沒有東西要隔了）',
   /\.pp-head-m2:not\(\.pp-head-open\) \.pp-idtop\{border-bottom:none;/.test(src));

console.log('\n切換與重置');
ok('★★ 切換只重畫、不重載資料（ppLoadCtx 一次要載 8 張表，見 0823 的效能事故）',
   /function ppHeadToggle\(\)\{\s*\n\s*window\._ppHeadOpen=!window\._ppHeadOpen;\s*\n\s*try\{ ppRenderBody\(\); \}catch\(_\)\{\}\s*\n\}/.test(src)
   && !/function ppHeadToggle\(\)\{[\s\S]{0,200}?ppLoadCtx/.test(src));
ok('★★ 換一位會員就歸零（每次打開都是收好的）',
   /window\._ppHeadOpen=false;   \/\* 換一位就把表頭的詳細資料收回去（2026-08-25）/.test(src)
   && src.indexOf('window._ppHeadOpen=false;')>src.indexOf('async function openPersonProfile(kind, id, backPage){'));
ok('　　同一位身上編輯欄位觸發重畫時維持展開（狀態不在 render 裡歸零）',
   (src.match(/window\._ppHeadOpen=false/g)||[]).length===1);

console.log('\n來由');
ok('★ 使用者原話寫在原地', /平常只要顯示大頭照跟姓名就這列好/.test(HD));
ok('　　為什麼要收（固定不捲、佔掉可讀區）寫在原地',
   /佔多少高度就等於永久少掉多少可讀區/.test(HD));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
