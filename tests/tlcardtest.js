/* 訓練課表 2026-10-14 六件（使用者在手機上看預覽後逐項定案）：
   ①〔套用方案〕〔新增動作〕做成浮動按鈕　②組別編號　③「上次」直接寫出來
   ④這個動作的總量　⑤動作名稱放大到量過的上限　⑥歷史課表先〔查看〕再套用
   ＋ 卡片空白：選 A（緊湊，版面結構不動） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 浮動按鈕');
ok('★★★ 貼在捲動容器下緣', /\.tl-acts\{display:grid;grid-template-columns:1fr 1fr;gap:8px;\s*\n\s*position:sticky;bottom:0;z-index:5;/.test(src));
ok('★★ 用負邊距撐滿容器寬（否則左右露縫看得到卡片滑過去）',
   /margin:10px -18px 0;padding:10px 18px 12px;/.test(src));
ok('★ 上緣漸層（卡片捲到按鈕底下不會糊在一起）',
   /background:linear-gradient\(to bottom,rgba\(244,240,232,0\) 0,var\(--bg\) 26%,var\(--bg\) 100%\);/.test(src));
ok('★★★ 從「今日紀錄與歷史課表中間」搬到最後面',
   src.indexOf('<div class="tl-acts${wpEnabled()')>src.indexOf('${sec4}'));

console.log('\n② 組別編號');
ok('★ 每一組前面標 1 2 3', /\$\{_multi\?`<i class="tlh-setno">\$\{i\+1\}<\/i>`:''\}/.test(src));
ok('★★ 只有一組時不標（標「1」是多餘的字）', /const _multi=_rows\.length>1;/.test(src));
ok('　　小、淡、固定寬，不跟數字搶', /\.tlh-setno\{flex:none;min-width:16px;text-align:right;font-size:11px;/.test(src));

console.log('\n③「上次」直接寫出來');
ok('★★★ 不再只放在 title 裡（手機沒有 hover ＝ 看不到）',
   !/_tr=_pn&&_pn\.reps!==''\?` title="上次/.test(src)
   && /<i class="tlh-prev">上次 \$\{_txt\}<\/i>/.test(src));
ok('★★ 單位不同就不寫重量（全系統不做 lb↔kg 換算）',
   /const _pw=\(_pn\.weight!==''&&_pn\.weight!=null\)\?`\$\{_pn\.weight\} \$\{wpUnitOf\(_pv\.weight_unit\)\}`:'';/.test(src));
ok('　　顏色比較那一段沒有被拿掉（顏色說「變了」、這一行說「變多少」）',
   /const _cr=_pn\?_cmp\(s\.reps,_pn\.reps\):'';/.test(src));

console.log('\n④ 總量');
ok('★★ Σ(次數 × 重量)', /_rows\.reduce\(\(a,x\)=>a\+\(\(Number\(x\.reps\)\|\|0\)\*\(Number\(x\.weight\)\|\|0\)\),0\)/.test(src));
ok('★★ 徒手（沒有重量）只寫組數與次數，不生出一個 0',
   /\$\{_v>0\?`總量 <b>\$\{_v\.toLocaleString\('en-US'\)\}<\/b> \$\{escH\(_u\)\}`:''\}/.test(src));
ok('　　組數・次數永遠都寫', /const _cnt=`<span>\$\{_rows\.length\} 組・\$\{_n\} 次<\/span>`;/.test(src));

console.log('\n⑤ 動作名稱 22px（量過的上限）');
ok('★★★ 19.5 → 22px', /\.tlh-ex\{font-size:22px;font-weight:700;color:var\(--text\);line-height:1\.32;margin-bottom:2px;\}/.test(src));
ok('★★ 量法寫在原地（9/17 沒量被打回來過）',
   /Playwright|手機 390 寬、卡片內可用 324px/.test(src) && /28px 會變三行，所以上限在這裡/.test(src));

console.log('\n⑥ 歷史課表：先查看再套用');
ok('★★★ 那一列的鈕從〔套用〕改成〔查看〕',
   /<button class="tlh-view" onclick="tlViewHist\('\$\{h\.bid\}','\$\{escH\(dt\|\|''\)\}'\)">查看<\/button>/.test(src)
   && !/<button class="tlh-apply" onclick="tlApplyHist\('\$\{h\.bid\}'\)">套用<\/button>/.test(src));
ok('★★★ 小視窗列出每個動作的組／次／重量（不是只有動作名）',
   /<span class="tlv-n">\$\{tlLogHtml\(l\)\}<\/span>/.test(src));
ok('★★ 看過就是確認 —— 直接走 tlDoApplyHist，不再多一層',
   /onclick="tlDoApplyHist\('\$\{srcBid\}'\)">套用這一堂<\/button>/.test(src));
ok('★★ 不再連一次伺服器（畫列表時就放進 _tlHistCache 了）',
   /const srcLogs=\(window\._tlHistCache\|\|\{\}\)\[srcBid\];[\s\S]{0,400}function tlViewHist|function tlViewHist\(srcBid, dt\)\{\s*\n\s*const srcLogs=\(window\._tlHistCache\|\|\{\}\)\[srcBid\];/.test(src));
ok('　　自動詢問那條路維持原樣（教練那時什麼都還沒按）',
   /if\(typeof tlApplyHist==='function'\) tlApplyHist\(_bid, true\);/.test(src));
ok('　　備註整堂收在一起', /return _nt\?`\$\{escH\(l\.exercise_name\|\|''\)\}　\$\{escH\(_nt\)\}`:'';/.test(src));

console.log('\n⑦ 卡片空白：A（緊湊）');
ok('★★★ 版面結構不動 —— 數字仍靠右（各組才對得齊）',
   /\.tlh-sets\{[\s\S]{0,180}align-items:flex-end;gap:2px;\}/.test(src));
ok('★★ 內距與行距收緊', /\.tlh-log\{position:relative;background:var\(--card\);border-radius:10px;padding:11px 38px 10px 14px;\}/.test(src));
ok('★★★ 浮水印從「貼最底下」改成「卡片正中間放大」，把空白填掉',
   /\.tlh-pt\{position:absolute;left:14px;top:50%;transform:translateY\(-42%\);/.test(src)
   && /font-size:clamp\(30px,17cqw,52px\)/.test(src));
ok('　　原因寫在原地（加了三行之後卡片變高、空白更明顯）',
   /加了組別編號／上次／總量之後，/.test(src));
ok('★ 動作備註加深（原本 --t3 壓在白卡上太淡）',
   /\.tlh-note\{font-size:12\.5px;color:var\(--t2\);font-weight:600;\}/.test(src));

console.log('\n實跑：總量與組別');
{
  const key='const _volHtml=';
  const i=src.indexOf(key);
  let d=0,end=-1;
  for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d){end=k+1;break;} } }
  const expr=src.slice(i+key.length,end)+')()';   // (()=>{ … })()
  const mk=(rows,unit)=>new Function('_rows','l','wpUnitOf','escH','return '+expr)
    (rows,{weight_unit:unit},u=>u||'kg',x=>String(x));
  ok('★★ 2 組 10 次 × 105 lb → 總量 2,100 lb',
     /總量 <b>2,100<\/b> lb/.test(mk([{reps:10,weight:105},{reps:10,weight:105}],'lb')));
  const _bare=mk([{reps:10},{reps:10},{reps:10}],'');
  ok('★★ 徒手（沒重量）只寫 3 組・30 次', !/總量/.test(_bare) && /3 組・30 次/.test(_bare), _bare);
  ok('　　一組也畫得出來', /1 組・12 次/.test(mk([{reps:12,weight:20}],'kg')));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
if(fail) process.exit(1);
