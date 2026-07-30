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

console.log('\n會員名片：票券剩餘堂數分類顯示');
ok('★ 卡片值改成分類清單（教練課 2　自主 1）',
   /\$\{ppDashCard\('ticket','票券',\s*\n\s*\(\(c\.tkSplit&&c\.tkSplit\.length\)/.test(src)
   && /<span class="pp-dc-split">\$\{c\.tkSplit\.map\(x=>`<span class="pp-dcs"><b>\$\{x\[1\]\}<\/b>\$\{x\[0\]\}<\/span>`\)\.join\(''\)\}<\/span>/.test(src));
ok('★ 沒有任何分類（完全沒票）時退回原本的總數顯示，不會變空白',
   /: \(c\.tkLeft!=null\?`\$\{c\.tkLeft\}<small>堂可用<\/small>`:''\)\)/.test(src));
ok('　　副標改顯示總數（分類在上、總數在下，資訊不減）',
   /\(c\.tkLeft \? `共 \$\{c\.tkLeft\} 堂可用` : '持有票券與剩餘堂數'\)/.test(src));
ok('　　樣式：數字大、分類名小，可換行', /\.pp-dc-split\{display:flex;flex-wrap:wrap;/.test(src)
   && /\.pp-dcs b\{font-family:var\(--font-en\);font-size:22px;/.test(src));
ok('　　總數仍照舊算（tkLeft 沒被拿掉，其他地方還在用）',
   /c\.tkLeft=_liveTk\.reduce\(\(s,t\)=>s\+Math\.max\(0,\(Number\(t\.sessions_remaining\)\|\|0\)\),0\);/.test(src));
ok('　　分類與總數同一份來源（_liveTk：usable 且未過期）',
   /const _liveTk=myTk\.filter\(t=>t\.status==='usable' && \(!t\.expire_date\|\|String\(t\.expire_date\)\.slice\(0,10\)>=_todayYmd\)\);/.test(src));

// 實跑分類函式
{
  const i=src.indexOf('    c.tkSplit=(function(){'); const j=src.indexOf('    })();',i)+9;
  const body=src.slice(i,j).replace('    c.tkSplit=','const _split=');
  const TT=[{id:'tt-mqdt435bbizd',name:'教練課',category:'私人教練'},
            {id:'tt-mqdt4ijw29ga',name:'友善教練課',category:'私人教練'},
            {id:'tt-limited-legacy',name:'限定教練課',category:'私人教練'},
            {id:'tt-mqdt55uosz5n',name:'自主訓練',category:'自主訓練'},
            {id:'tt-mqdt4ubv8e5i',name:'團體課',category:'小班肌力'},
            {id:'tt-discount-pt300',name:'教練課折抵300',category:'私人教練'},
            {id:'tt-mrghed5b6ke2',name:'運動按摩',category:'運動按摩'}];
  const win={_ttCache:TT};
  const catOf=t=>(TT.find(x=>x.id===t.ticket_type_id)||{}).category||null;
  const run=list=>new Function('window','ticketCategoryOf','_liveTk',body+'\nreturn _split;')(win,catOf,list);
  const T=(ttid,rem,plan)=>({ticket_type_id:ttid,sessions_remaining:rem,plan_name:plan||''});

  eq('★ 教練課 2 ＋ 自主 1 → 依序列出',
     run([T('tt-mqdt435bbizd',2),T('tt-mqdt55uosz5n',1)]), [['教練課',2],['自主',1]]);
  eq('★ 教練課／友善／限定合併成同一格「教練課」',
     run([T('tt-mqdt435bbizd',2),T('tt-mqdt4ijw29ga',3),T('tt-limited-legacy',1)]), [['教練課',6]]);
  eq('★ 折抵券獨立一格，不併進教練課（否則會被誤認為還有正課）',
     run([T('tt-mqdt435bbizd',2),T('tt-discount-pt300',1)]), [['教練課',2],['折抵',1]]);
  eq('　　plan_name 帶「折抵」也認得（舊資料票種 id 不一致）',
     run([T('tt-mqdt435bbizd',1,'教練課折抵券 $300')]), [['折抵',1]]);
  eq('　　剩 0 堂的票不列（票還在但沒堂數）',
     run([T('tt-mqdt435bbizd',0),T('tt-mqdt55uosz5n',2)]), [['自主',2]]);
  eq('　　顯示順序固定：教練課→團體課→自主→按摩（不隨資料順序跳動）',
     run([T('tt-mrghed5b6ke2',1),T('tt-mqdt55uosz5n',2),T('tt-mqdt4ubv8e5i',3),T('tt-mqdt435bbizd',4)]),
     [['教練課',4],['團體課',3],['自主',2],['按摩',1]]);
  eq('　　完全沒票 → 空陣列（渲染端會退回總數）', run([]), []);
  eq('　　認不出票種 → 收進「其他」，不會憑空消失',
     run([T('tt-unknown-xyz',2)]), [['其他',2]]);
  eq('　　負數餘額當 0（防匯入髒資料）', run([T('tt-mqdt435bbizd',-3),T('tt-mqdt55uosz5n',1)]), [['自主',1]]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
