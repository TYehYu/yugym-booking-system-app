/* CSS 的結構檢查（2026-09-04 建立）

   起因：改課卡時我在一段註解的結尾符號**後面**接著寫下一段說明，結尾又補了一個結尾符號
   （下面用全形斜線 ＊／ 代表，寫成半形會把這段註解自己關掉 —— 正是同一種錯）：

       ⚠ 底線用嚴的那組…就會被切字。 ＊／      ← 這裡註解已經關掉了
       ⚠ 收起來要用 visibility 不是 display（…
         …讓姓名往上補位是對的。 ＊／          ← 多出來的結尾符號

   於是那幾行變成樣式表裡的裸文字，瀏覽器會一路吞到能重新同步為止 ——
   後面那條 `visibility:hidden` 整條被吃掉，畫面上時間又跑回來壓在出席章上。

   ⚠ tests/syntaxtest.js 只驗 `<script>` 裡的 JavaScript，**不看 CSS**。
     index.html 的 CSS 有 77 萬字元、註解比規則還多，這種錯誤只靠眼睛看不出來，
     而且不會讓頁面白掉（只會靜靜少掉幾條規則），比語法錯更難發現。

   這支只驗結構，不驗好不好看：註解成對、大括號平衡、沒有裸文字。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 取出每一段樣式表，連同它在檔案裡的起始行號（報錯要能指位置）。

   ⚠⚠ 2026-09-17 改成「行首、獨佔一行」的匹配 —— 原本用 indexOf 找開頭標籤，
     結果被**註解裡提到那個標籤**騙了：當天在 body 加載入畫面時，我在 HTML 註解裡
     逐字寫出開頭標籤（正是為了警告後人不要新增它），indexOf 就把註解當成第二段樣式表，
     再往後找到 JavaScript 字串裡的結尾標籤，於是**把六萬行 JS 當成 CSS 檢查**，
     噴出「孤兒結尾符號」「大括號 -4」「中文掉進選擇器」一整串對不上的錯。
     （報的行號在 CSS 區塊外三百萬位元組處，那就是切錯位置的特徵。）
   ⚠ 真正的標籤都獨佔一行且頂格，字串與註解裡的不會 —— 這與 syntaxtest 切
     script 區塊用的是同一招，兩支的切法一致比較不會各自壞掉。
   ⚠ 這也表示：日後真的要寫出那個標籤來說明時，寫在**行中**就不會被誤抓；
     但更保險的做法仍是用文字描述（見 index.html 裡 #boot-splash 那段註解）。 */
const BLOCKS=[];
{
  const starts=[...src.matchAll(/^<style(?:\s[^>]*)?>[ \t]*$/gm)].map(m=>m.index+m[0].length);
  const ends=[...src.matchAll(/^<\/style>[ \t]*$/gm)].map(m=>m.index);
  starts.forEach(a=>{
    const b=ends.find(x=>x>a);
    if(b==null) return;
    BLOCKS.push({ line: src.slice(0,a).split('\n').length, css: src.slice(a,b) });
  });
}
console.log(`① 抓到 ${BLOCKS.length} 段 <style>，共 ${BLOCKS.reduce((s,b)=>s+b.css.length,0)} 字元`);
ok('★★★ 至少有一段樣式表（抓法沒壞）', BLOCKS.length>=1 && BLOCKS[0].css.length>10000);

console.log('\n② 註解要成對（這次翻車的那一種）');
{
  const stray=[], unclosed=[];
  for(const blk of BLOCKS){
    let i=0, open=-1, depth=0;
    while(i < blk.css.length){
      const o=blk.css.indexOf('/*', i), c=blk.css.indexOf('*/', i);
      if(o<0 && c<0) break;
      if(o>=0 && (c<0 || o<c)){
        /* CSS 註解不能巢狀：已經在註解裡又看到 /* 是無害的（它只是內文），跳過 */
        if(depth===0){ depth=1; open=o; }
        i=o+2;
      }else{
        if(depth===0) stray.push(blk.line + blk.css.slice(0,c).split('\n').length - 1);
        else depth=0;
        i=c+2;
      }
    }
    if(depth===1) unclosed.push(blk.line + blk.css.slice(0,open).split('\n').length - 1);
  }
  ok('★★★ 沒有孤兒 */（前面沒有對應的 /*）', stray.length===0, {行號:stray});
  ok('★★★ 沒有沒關起來的 /*', unclosed.length===0, {行號:unclosed});
}

console.log('\n③ 大括號要平衡');
{
  const bad=[];
  for(const blk of BLOCKS){
    /* 先把註解與字串拿掉，否則 content:"}" 之類會誤判 */
    const clean=blk.css.replace(/\/\*[\s\S]*?\*\//g,'')
                       .replace(/"(?:[^"\\]|\\.)*"/g,'""')
                       .replace(/'(?:[^'\\]|\\.)*'/g,"''");
    let d=0, minD=0;
    for(const ch of clean){ if(ch==='{')d++; else if(ch==='}'){d--; if(d<minD)minD=d;} }
    if(d!==0||minD<0) bad.push({起始行:blk.line, 收支:d, 最低點:minD});
  }
  ok('★★★ 每一段 <style> 的 { 與 } 都收得平（也沒有先出現多餘的 }）', bad.length===0, bad);
}

console.log('\n④ 選擇器位置不該出現裸文字');
{
  /* 拿掉註解與字串後，把每一條規則的「選擇器段」抓出來（'}' 或 '{' 之間的那一段）。
     裸文字的特徵：選擇器裡出現中文全形標點或「：」「（」，那不可能是合法選擇器。
     ⚠ 這一條抓的是**這次那種錯**（註解漏掉開頭，內文掉進樣式表），
       不是完整的 CSS 驗證器 —— 完整驗證要真的 parser，不在這裡做。 */
  const bad=[];
  for(const blk of BLOCKS){
    const clean=blk.css.replace(/\/\*[\s\S]*?\*\//g, m=>m.replace(/[^\n]/g,' '))
                       .replace(/"(?:[^"\\]|\\.)*"/g,'""')
                       .replace(/'(?:[^'\\]|\\.)*'/g,"''");
    const re=/(^|[}{;])([^{}();]*)\{/g;
    let m;
    while((m=re.exec(clean))){
      const sel=m[2];
      if(/[，。：；「」（）、⚠→←＝]/.test(sel)){
        bad.push({行:blk.line + clean.slice(0,m.index).split('\n').length - 1,
                  片段:sel.trim().replace(/\s+/g,' ').slice(0,50)});
      }
    }
  }
  ok('★★★ 沒有中文內文掉進選擇器的位置（＝註解漏了開頭）', bad.length===0, bad.slice(0,5));
}

console.log('\n⑤ 這次的教訓要留著');
ok('★★ 為什麼需要這一支（syntaxtest 不看 CSS），寫在本檔開頭',
   /tests\/syntaxtest\.js 只驗 `<script>` 裡的 JavaScript，\*\*不看 CSS\*\*/.test(fs.readFileSync(__filename,'utf8')));
ok('★★ 「不會白畫面、只會靜靜少掉幾條規則」的特性寫在原地',
   /不會讓頁面白掉（只會靜靜少掉幾條規則），比語法錯更難發現/.test(fs.readFileSync(__filename,'utf8')));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
