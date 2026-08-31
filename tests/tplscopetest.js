/* 模板字串裡不能用「這個範圍沒有的變數」（2026-08-31 事故）

   v260831.1830 把桌機課卡的寫法整段複製到會員手機課卡，帶進了一個 `_lvTag` ——
   那是桌機／教練課卡才有的區域變數。結果**會員端整頁噴**
   「資料載入錯誤　Can't find variable: _lvTag」，客人什麼都看不到。

   ⚠ syntaxtest 抓不到這種：語法完全合法，要跑到那一行才炸。
   ⚠ 這一支不是通用的靜態分析（那要整個 JS parser），
     只盯「會被整段複製來複製去」的那幾塊課卡模板：
     把 ${identifier} 全掃出來，逐一確認在該區塊或全域找得到宣告。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 掃一塊：from → to 之間的模板識別字，哪些在區塊內與全域都找不到宣告 */
function undeclared(from, to, label){
  const i=src.indexOf(from);
  if(i<0) throw new Error('切不到區塊：'+label+'（起點變了就要更新這支測試）');
  const j=src.indexOf(to, i);
  if(j<0) throw new Error('切不到區塊結尾：'+label);
  const blk=src.slice(i,j);
  const names=[...new Set([...blk.matchAll(/\$\{([A-Za-z_$][\w$]*)/g)].map(m=>m[1]))];
  const bad=[];
  for(const n of names){
    if(new RegExp('\\b(?:const|let|var|function)\\s+'+n+'\\b').test(blk)) continue;      // 區塊內宣告
    if(new RegExp('(?:const|let)\\s*\\{[^}]*\\b'+n+'\\b[^}]*\\}').test(blk)) continue;    // 解構
    if(new RegExp('(?:\\(|,)\\s*'+n+'\\s*(?:,|\\)\\s*=>)').test(blk)) continue;           // 參數
    if(new RegExp('^\\s*(?:const|let|var|function|async function)\\s+'+n+'\\b','m').test(src)) continue; // 全域
    bad.push(n);
  }
  return bad;
}

console.log('① 會員手機課卡（0831 就是這一塊出事）');
{
  const bad=undeclared('  const cards=day.map(b=>{', "  }).join('');", '會員手機課卡');
  ok('★★★ 沒有用到這個範圍不存在的變數', bad.length===0, bad);
  /* 註解裡還留著 _lvTag 三個字（那正是要留給下一個人看的教訓），
     所以只判「有沒有被當成變數用」 */
  ok('★★★ _lvTag 不再被當成變數用（它是桌機／教練課卡的區域變數）',
     !/\$\{_lvTag/.test(src.slice(src.indexOf('  const cards=day.map(b=>{'),
                              src.indexOf("  }).join('');", src.indexOf('  const cards=day.map(b=>{')))));
  ok('★★ 教訓寫在原地（下次複製貼上前看得到）',
     /這裡沒有 _lvTag（那是桌機／教練課卡才有的區域變數）/.test(src)
     && /會員端整頁噴\s*\n\s*「Can't find variable: _lvTag」/.test(src));
}

console.log('\n①b 標籤數量要對得起來（0831 第二個坑：多一個 </div>）');
{
  /* 多一個 </div> 會把卡片提早關掉，簽到鈕跟著跑到卡片外面 ——
     畫面上看起來是「課卡變成橫排、每張被擠成一條」。
     語法完全合法、變數也都在，所以前兩關都攔不到，只能數標籤。 */
  const count=(from,to,label)=>{
    const i=src.indexOf(from); if(i<0) throw new Error('切不到：'+label);
    const j=src.indexOf(to,i);  if(j<0) throw new Error('切不到結尾：'+label);
    /* 把 ${/* … *​/''} 這種模板註解拿掉再數，註解裡的標籤不算 */
    const blk=src.slice(i,j).replace(/\$\{\/\*[\s\S]*?\*\/''\}/g,'');
    return [ (blk.match(/<div\b/g)||[]).length, (blk.match(/<\/div>/g)||[]).length ];
  };
  const [o1,c1]=count('    return `<div class="admh2-card${st.done?', "  }).join('');", '會員手機課卡');
  ok('★★★ 會員手機課卡的 <div> 開關數相等', o1===c1, {開:o1, 關:c1});
  ok('★★ 這個坑的症狀寫在測試裡（下次看到橫排就知道往哪找）',
     /畫面上看起來是「課卡變成橫排、每張被擠成一條」/.test(fs.readFileSync(__filename,'utf8')));
}

console.log('\n② 另外兩塊常被互相複製的課卡');
{
  const b1=undeclared('  const cards=list.map(b=>{', "  }).join('')", '教練手機首頁課卡');
  ok('★★ 教練手機首頁課卡', b1.length===0, b1);
}

console.log('\n③ 這支測試自己要抓得到（不是只會說 OK）');
{
  /* 反例：塞一個假的區塊進去，確認掃得出未宣告的識別字 */
  const fake='  const cards=X.map(b=>{\n    return `<div>${_notDeclaredAnywhere}</div>`;\n  }).join(\'\');';
  const names=[...new Set([...fake.matchAll(/\$\{([A-Za-z_$][\w$]*)/g)].map(m=>m[1]))];
  ok('★★★ 反例：未宣告的識別字掃得出來',
     names.length===1 && names[0]==='_notDeclaredAnywhere'
     && !new RegExp('^\\s*(?:const|let|var|function)\\s+_notDeclaredAnywhere\\b','m').test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
