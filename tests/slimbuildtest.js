/* 2026-09-18：發佈用的減肥建置（build/slim.js）。

   ⚠ 這支測的東西跟其他 383 支不一樣：其他測試驗的是 index.html 這份**原始碼**，
     而這支驗的是「發佈出去的那份跟原始碼等價」。減肥做壞的典型症狀是
     **檔案照樣解析通過、全套測試照樣全綠，但正式環境安靜地少了東西** ——
     沒有這支的話，那種壞法沒有任何一道防線攔得住。

   ⚠ 特別包含「故意弄壞、確認閘門會擋」的情境：
     一道從來不會觸發的安全閘門，跟沒有是一樣的。 */
const fs=require('fs');
const os=require('os');
const path=require('path');
const B=require(process.env.HOME+'/Projects/yugym-booking-system-app/build/slim.js');
const SRC=process.env.HOME+'/Projects/yugym-booking-system-app/index.html';

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

// 小工具：把一段 JS 包成最小的 HTML（script 標籤要行首獨佔一行）
const wrap=js=>'<html>\n<style>\n</style>\n<script>\n'+js+'\n</script>\n<script>\n;\n</script>\n</html>\n';
const runBuild=html=>{ const bag={removed:[],jsAfter:[]};
  const out=B.build(html,bag); return {out,bag,checks:B.verify(html,out,bag)}; };
const allOk=cks=>cks.every(c=>c.ok);

console.log('① 剝註解器不可以吃掉「看起來像註解」的程式碼');
{
  const cases=[
    ["字串裡的網址",       "var u='https://fonts.googleapis.com/x'; //bye\nvar k=1;", 'https://fonts.googleapis.com/x'],
    ["樣板字串裡的網址",   "var u=`https://a.b/c`; /*bye*/\nvar k=1;",                'https://a.b/c'],
    ["正則裡的註解起始",   "var r=/\\/\\*/; var k=1;",                                 '/\\/\\*/'],
    ["除號不可以被當正則", "var a=6, b=2, c=a /b/ 1; var k=1;",                        'a /b/ 1'],
    ["樣板字串的 ${} 內註解", "var s=`x${/*gone*/''}y`; var k=1;",                     "${''}"],
  ];
  for(const [name,js,keep] of cases){
    const out=B.stripJS(js);
    ok('★★ '+name, out.includes(keep), {得到:out.trim()});
  }
  ok('★ 但註解本身確實有被剝掉',
     !B.stripJS("var a=1; /*BYEBYE*/ var b=2;").includes('BYEBYE'));
}

console.log('\n② 樣板字串裡的 HTML 佔位標記不可以被當成 HTML 註解剝掉');
{
  // index.html 真實案例：alertBox 先塞 <!--ALERTS--> 再 replace 填卡片
  const html=wrap("var box=`<div><!--ALERTS--></div>`;\nbox=box.replace('<!--ALERTS-->','x');");
  const {out,checks}=runBuild(html);
  ok('★★★ 佔位標記還在（剝掉會讓首頁警示卡片永遠是空的，且沒有測試會紅）',
     out.includes('<!--ALERTS-->'));
  ok('★★ 驗證八項全過', allOk(checks), checks.filter(c=>!c.ok).map(c=>c.name));
  // 對照：script 區塊之外的 HTML 註解要剝掉
  ok('★ 但真正的 HTML 註解有剝掉', !runBuild('<html>\n<!--REALCOMMENT-->\n<style>\n</style>\n<script>\n;\n</script>\n<script>\n;\n</script>\n</html>\n').out.includes('REALCOMMENT'));
}

console.log('\n③ 故意弄壞 → 閘門必須擋下來');
{
  // 模擬「剝註解器吃掉了一段字串」：直接偽造一個少了東西的輸出
  const html=wrap("var a='KEEPME'; var b=2;");
  const bag={removed:[],jsAfter:[]};
  const good=B.build(html,bag);
  const broken=good.replace("'KEEPME'","''");
  const cks=B.verify(html,broken,bag);
  ok('★★★ 輸出少了一個字串 → 驗證不通過', !allOk(cks));
  ok('　　而且指得出是哪一關',
     cks.some(c=>!c.ok && /JS|字串|識別字/.test(c.name)), cks.filter(c=>!c.ok).map(c=>c.name));
}
{
  // 模擬「移除了不是註解的東西」
  const html=wrap("var a=1;");
  const bag={removed:["var stolen=1;"],jsAfter:[]};
  const out=B.build(html,bag);
  const cks=B.verify(html,out,bag);
  const c=cks.find(x=>/全都是註解/.test(x.name));
  ok('★★★ 被移除的東西不是註解 → 驗證不通過', c && !c.ok);
}

console.log('\n④ 真的跑一次 index.html');
{
  const src=fs.readFileSync(SRC,'utf8');
  const {out,bag,checks}=runBuild(src);
  checks.forEach(c=>ok((/全都是註解|沒有動到/.test(c.name)?'★★★ ':'★ ')+c.name, c.ok, c.detail));
  ok('★★★ 行號與原始碼完全對齊（線上第 N 行＝原始檔第 N 行，出事查得到）',
     src.split('\n').length===out.split('\n').length,
     {原始:src.split('\n').length, 輸出:out.split('\n').length});
  const r=Buffer.byteLength(out)/Buffer.byteLength(src);
  ok('★★ 確實有變小（少於原本的 75%）', r<0.75, {比例:(r*100).toFixed(1)+'%'});
  ok('★ 剝掉的註解量合理（超過 5000 段）', bag.removed.length>5000, bag.removed.length);
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
