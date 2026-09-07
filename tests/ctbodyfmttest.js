/* 合約內文的懸掛縮排（2026-09-07 使用者回報：「合約這邊的規則　段落是不是沒有調整好」）——
   合約本文一直是純文字用 white-space:pre-wrap 倒出來，換行會退回最左邊：
     「2. 會員事前透過系統或書面通知本公司…本公司不收取轉讓手續費。受
     讓人應完成會員登錄…」
   pre-wrap 做不到懸掛縮排（text-indent 只作用在整塊的第一行，不是每一行），
   所以改成逐行判型別、各自包一個區塊。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};
const ctBodyHTML=new Function(g('function ctBodyHTML(','\n}')+'\nreturn ctBodyHTML;')();

console.log('① 逐行判型別');
ok('★★ 章節不縮排（一、二…十）',
   ctBodyHTML('五、轉讓規則')==='<div class="ct-h2">五、轉讓規則</div>');
ok('★★ 編號項：編號自己一格，內容整段對齊（換行才不會退回最左邊）',
   ctBodyHTML('　　1. 所購課程不得私自轉售')
   ==='<div class="ct-li"><span class="ct-li-n">1.</span><span>所購課程不得私自轉售</span></div>');
ok('★★ 全形括號的子項也算編號項（（一）（二）…）',
   /class="ct-li-n">（一）</.test(ctBodyHTML('　　（一）課程有效期限')));
ok('★  半形括號數字也認得', /class="ct-li-n">\(1\)</.test(ctBodyHTML('  (1) 測試')));
ok('★★ 有縮排但沒編號 → 內文段落（整段一起縮）',
   ctBodyHTML('　　會員同意本公司蒐集個人資料')
   ==='<div class="ct-p">會員同意本公司蒐集個人資料</div>');
ok('★★ 沒縮排也沒編號 → 不縮排的段落',
   ctBodyHTML('本公司提供三日以上之契約審閱期間')
   ==='<div class="ct-p ct-p0">本公司提供三日以上之契約審閱期間</div>');
ok('★★ 空行 → 一個固定高度的間隔（維持原本的段落節奏）',
   ctBodyHTML('')==='<div class="ct-sp"></div>' && ctBodyHTML('　　')==='<div class="ct-sp"></div>');

console.log('\n② 合約全文是資料，不是樣板');
ok('★★★ HTML 一律跳脫（有人在方案名稱裡打 < 也不能變成標籤）',
   ctBodyHTML('　　1. <script>x</script> & 測試')
   .includes('&lt;script&gt;x&lt;/script&gt; &amp; 測試'));
ok('★★ 編號本身也跳脫', !/[<>]/.test(ctBodyHTML('1. a').replace(/<[^>]*>/g,'')));

console.log('\n③ 多行整份組得起來');
{
  const out=ctBodyHTML('五、轉讓規則\n　　1. 甲\n　　2. 乙\n\n六、退費');
  ok('★★ 順序與行數對得上', (out.match(/<div/g)||[]).length===5);
  ok('★★ 空行變成 .ct-sp，不會被吃掉', out.includes('<div class="ct-sp"></div>'));
  ok('★  Windows 換行（\\r\\n）也吃得下', ctBodyHTML('a\r\nb').includes('</div><div'));
}

console.log('\n④ 電子與紙本用同一支（同一份 body_snapshot，排版也要一樣）');
ok('★★ 已簽合約列印', /<div class="ct-text">\$\{ctBodyHTML\(c\.body_snapshot\)\}<\/div>/.test(src));
ok('★★ 會員端簽署頁', /\}\$\{ctBodyHTML\(c\.body_snapshot\)\}<\/div>/.test(src));
ok('★★ 合約檢視閱讀器', /const body=ctBodyHTML\(c\.body_snapshot\);/.test(src));
ok('★★ 建約步驟 4 的草稿', /<div class="ct-text">\$\{ctBodyHTML\(window\._ctBody\)\}<\/div>/.test(src));
ok('★★ 空白範本列印', /<div class="ct-text">\$\{ctBodyHTML\(CONTRACT_TEXT\)\}<\/div>/.test(src));
ok('★★ 沒有人再直接倒 pre-wrap 純文字',
   !/body_snapshot\|\|''\)\.replace\(\/&\/g,'&amp;'\)/.test(src));

console.log('\n⑤ 兩邊的 CSS 都要有懸掛縮排，而且 pre-wrap 要關掉');
['\\.ct-text','\\.cr-body'].forEach(sel=>{
  const re=new RegExp(sel+'\\{[^}]*white-space:normal;');
  ok('★★ '+sel.replace(/\\\\/g,'')+' 關掉 pre-wrap', re.test(src));
  ok('★★ '+sel.replace(/\\\\/g,'')+' 的編號項用 flex（編號不縮、內容自己對齊）',
     new RegExp(sel+' \\.ct-li\\{display:flex;gap:\\.4em;padding-left:1\\.7em;\\}').test(src)
     && new RegExp(sel+' \\.ct-li>\\.ct-li-n\\{flex:none;\\}').test(src));
});
ok('★  列印版的段落間隔跟著 --ct-fit 縮（自動收頁時一起收）',
   /\.ct-text \.ct-sp\{height:calc\(0\.85em \* var\(--ct-fit\)\);\}/.test(src));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
