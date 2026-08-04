/* 課卡彈窗的兩處調整（2026-07-30 使用者回報）
   ① 代課名單原本用 order:-1 插在按鈕列上方 → 面板在 flex 流內，彈窗被撐高、整張小卡往上跳
      （「擠壓畫面」）。改成絕對定位浮在小卡左側，彈窗本身不動。
   ② 會員名片下方的票券卡只給一個總數，看不出剩的是哪一種課 → 拆成「教練課 2　自主 1」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('代課名單改掛左側');
ok('★ 絕對定位貼在小卡左緣（right:100%），不進 flex 流',
   /#bk-card-pop \.evc-roster\.evr-up\{position:absolute;right:100%;top:0;margin-right:10px;/.test(src));
ok('★ 舊的 order:-1（插在按鈕列上方）已移除，才不會再撐高彈窗',
   !/#bk-card-pop \.evc-roster\.evr-up\{order:-1;\}/.test(src));
ok('★ 左邊放不下時翻到右邊的樣式存在',
   /#bk-card-pop \.evc-roster\.evr-up\.evr-side-r\{right:auto;left:100%;margin-right:0;margin-left:10px;\}/.test(src));
ok('★ JS 依實際位置決定左／右（左邊不夠就加 .evr-side-r）',
   /if\(hr\.left - pane\.offsetWidth - 10 < 8\) pane\.classList\.add\('evr-side-r'\);/.test(src));
ok('　　下緣超出視窗會往上收，不會被切掉',
   /if\(pr\.bottom > window\.innerHeight - 8\) pane\.style\.top = Math\.round\(window\.innerHeight - 8 - pr\.height - hr\.top\)\+'px';/.test(src));
ok('　　手機端窄畫面左右都塞不下 → 回到直式',
   /@media\(max-width:600px\)\{\s*\n\s*#bk-card-pop \.evc-roster\.evr-up\{position:static;right:auto;top:auto;margin:0;order:-1;/.test(src));
ok('　　面板寬度自適應但有上下限（不會細成一條或撐爆）',
   /width:max-content;min-width:172px;max-width:min\(240px,42vw\);/.test(src));
ok('　　.mtp 是 fixed，本身即定位基準（不需另加 position:relative）',
   /#bk-card-pop \.mtp\{position:fixed;/.test(src));
ok('　　行事曆課卡的舊路徑（往上展開）仍保留，沒被一起改掉',
   /\.cal-ev\.cal-ev-std \.evc-roster\.evr-up\{top:auto;bottom:100%;/.test(src));
ok('　　原因寫在程式裡', /面板在 flex 流內 → 彈窗被撐高、整張小卡往上跳/.test(src));
ok('　　團課簽到名單（無 evr-up）不受影響，仍接在小卡下方',
   /#bk-card-pop \.evc-roster\{width:100%;/.test(src));

/* 2026-08-01 二修（使用者：「11 團體課 5 其他是什麼意思？明明只有 5 張團課」）——
   這張卡原本自己挑一套「有效票券」的定義、自己用 ticketCategoryOf 分類，
   於是跟票券分頁對不起來。改成直接跟票券夾（buildWallet）拿：
   分類走五口袋 tkClass5、有效與否走同一個 state，與分頁必然一致。 */
console.log('\n會員名片：票券摘要改由票券夾提供');
/* 2026-08-04 使用者指示「活動紀錄改成列表」：分類清單改放在列表行的說明列，數字位＝可用堂數 */
ok('★ 分類清單仍看得到（移到列表行的說明列）',
   /c\.tkSplit\.map\(x=>`\$\{x\[0\]\} \$\{x\[1\]\}`\)\.join\('、'\)/.test(src));
ok('★ 分類直接用五口袋 TK5（與票券分頁同一套）',
   /c\.tkSplit=TK5\.map\(\(\[k,lb\]\)=>\[lb,_wal\.active\(k\)\.length\]\)\.filter\(x=>x\[1\]>0\);/.test(src));
ok('★ 份數＝票券夾裡「持有中」的方案數', /c\.tkCount=_wal\.active\(\)\.length;/.test(src));
ok('★ 堂數＝票券夾算的可約堂數', /c\.tkLeft=_wal\.sessionsLeft\(\);/.test(src));
ok('★ 不再自己定義「有效票券」（那是不一致的來源）',
   !/const _liveTk=myTk\.filter\(t=>t\.status==='usable'/.test(src));
ok('★ 不再自己用 ticketCategoryOf 分類', !/\(LB\[ticketCategoryOf\(t\)\]\|\|'其他'\)/.test(src));
ok('　　數字位顯示可用堂數、說明列有方案份數',
   /\$\{c\.tkLeft\|\|0\}<small>堂可用<\/small>/.test(src) && /共 \$\{c\.tkCount\} 份方案/.test(src));
ok('　　方案都排滿時講明白（不然會以為票不見了）', /都排滿了/.test(src));
ok('　　兩個成因都寫在程式裡（分類猜錯、有效定義不同）',
   /「團課 4週優惠」不含「團體」「小班」→ 掉進「其他」/.test(src)
   && /11 張早就上完的舊團課票 status 仍是 usable、餘額 0，被算成還在跑的方案/.test(src));
ok('　　名稱備援也補上「團課」（票種對不上時的最後一道）',
   /nm\.indexOf\('團體'\)>=0\|\|nm\.indexOf\('小班'\)>=0\|\|nm\.indexOf\('團課'\)>=0/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
