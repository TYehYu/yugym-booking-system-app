/* 場地更名：多功能訓練架 → 史密斯訓練架，縮寫「訓練架」
   （2026-09-03 使用者指示：「場地『多功能訓練架』更名『史密斯訓練架』…縮寫『訓練架』」）

   ⚠ 名稱有兩份：程式裡的 window.VENUES 預設，與資料庫的 venues 表。
     enterApp 會用資料庫那份覆寫掉程式的預設 —— 只改一邊，畫面上不會變（或改回去）。
     兩邊都要改（DB 已於 0903 更新）。
   ⚠ 縮寫只定義一次（VENUE_SHORT）。程式裡本來就有幾處硬寫著「訓練架・兩台」，
     那是同一個縮寫，不要再各處硬寫第二份。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
const api=new Function('window',
  g("const VENUE_SHORT={ multi:'訓練架' };","\n}")+'\n'
  +g('function venueName(unit){','\n}')+'\n'
  +g('function venueDisplay(b){','\n}')
  +'\nreturn {venueShort,venueName,venueDisplay};')(
  {VENUES:[{id:'multi',name:'史密斯訓練架',capacity:3},
           {id:'treadmill',name:'跑步機',capacity:2},
           {id:'group',name:'團課教室',capacity:1}]});

console.log('① 全名與縮寫');
eq('★★ 全名（挑選欄、設定頁、說明文字用）', api.venueName('multi_1'), '史密斯訓練架');
eq('★★★ 縮寫（塞不下的地方用，例如「訓練架・兩台」）', api.venueShort('multi_1'), '訓練架');
eq('★ 跑步機不縮（本來就短）', api.venueShort('treadmill_2'), '跑步機');
eq('★ 團課教室不縮', api.venueShort('group'), '團課教室');
eq('　 沒帶單位就回空字串', api.venueName(''), '');

console.log('\n② 課卡用全名（2026-09-03 使用者定案：「課卡維持　完整場地名稱　史密斯訓練架」）');
eq('★★★ 有 venue_unit → 全名', api.venueDisplay({venue_unit:'multi_2'}), '史密斯訓練架');
eq('★★ 沒 venue_unit 的教練課 → 退回預設場地，一樣全名',
   api.venueDisplay({category:'私人教練'}), '史密斯訓練架');
eq('★★ 團課退回團課教室', api.venueDisplay({category:'小班肌力'}), '團課教室');
eq('★ 場租沒有場地', api.venueDisplay({category:'場租'}), '');
/* 新名與舊名同為六個字，所以 0823 那次的寬度換算原封不動仍然成立。 */
ok('★★ 寬度沒有新的截斷風險，理由寫在原地',
   /新名與舊名同樣是六個字，所以寬度與 0823 那次換算相同/.test(src)
   && /2026-09-03 改名「史密斯訓練架」，同樣六個字，這條換算不變。/.test(src));
ok('★★ 縮寫沒有變成死碼：真的有一個使用者（venueUnitsLabel 的「訓練架・兩台」）',
   /return venueShort\('multi'\)\+'・'\+\(NUM\[n\]\|\|\(n\+' 台'\)\);/.test(src)
   && /這裡用縮寫：後面還要接「・兩台」，全名會把那一格撐破/.test(src));

console.log('\n③ 舊名稱清乾淨');
{
  /* 只看程式，不看註解 —— 使用者當時的原話要保留原名（那是紀錄）。 */
  const noC=src.replace(/\/\*[\s\S]*?\*\//g,'');
  ok('★★★ 程式裡沒有殘留的「多功能訓練架」', !/多功能訓練架/.test(noC));
  ok('★★ 預設 VENUES 已更名',
     /\{ id:'multi',\s+name:'史密斯訓練架', capacity:3, active:true \}/.test(src));
  ok('★★ 縮寫只定義一次', (src.match(/const VENUE_SHORT=/g)||[]).length===1);
  /* 使用者原話刻意保留舊名，不要「順手統一」掉 —— 那會讓紀錄失真 */
  ok('　 使用者原話仍保留當時的名稱（紀錄不改寫）',
     /「多功能訓練架有一台兩台三台可以選」/.test(src)
     && /「多功能訓練架跟跑步機不一樣，1 點只能約一個場地」/.test(src));
}

console.log('\n④ 兩份名稱的陷阱寫下來');
ok('★★★ 提醒「資料庫那份會覆寫程式預設」',
   /2026-09-03 更名（原「多功能訓練架」）；縮寫見 VENUE_SHORT/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
