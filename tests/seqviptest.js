/* 首頁課卡的「本月第幾堂」浮水印：VIP 改寫「VIP」（2026-09-11 使用者）
   「然後今天這幾個4堂課的抽獎判定會是如何　vip不列入統計」
   「vip的浮水印改成VIP　這樣櫃檯才不會誤會抽獎」
   0911 當天 RANDY 的 13:00 陳世勳、20:00 陳智傑都是 VIP 又剛好第 4 堂 —— 金色的 4 會被讀成「有抽獎」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});

console.log('① 課卡浮水印');
const i=src.indexOf('const _sq=_monSeq[b.id]; if(!_sq) return');
const blk=src.slice(i, src.indexOf('})()}', i));
ok('★★★ VIP 判斷排在「第 4 堂亮金色」之前（先擋掉，才不會亮金色）',
   blk.indexOf('lottoIsVip(memMap[b.member_id])')>0
   && blk.indexOf('lottoIsVip(memMap[b.member_id])') < blk.indexOf("tcard-seq-hit"));
ok('★★★ VIP 寫「VIP」、不寫堂數，也不掛 tcard-seq-hit',
   /return `<span class="tcard-seq tcard-seq-vip" aria-hidden="true">VIP<\/span>`;/.test(blk));
ok('★★★ 判準用抽獎那一支 lottoIsVip（抽獎怎麼認定 VIP，這裡就怎麼顯示）',
   /if\(typeof lottoIsVip==='function' && lottoIsVip\(memMap\[b\.member_id\]\)\)/.test(blk));
ok('★★ 非 VIP 照舊：數字，第 4 堂亮金色', /_sq%4===0\?' tcard-seq-hit':''/.test(blk));
ok('★★ VIP 縮字級、不上金色（只調大小與字距）',
   /\.tcard-std \.tcard-seq\.tcard-seq-vip\{font-size:22px;letter-spacing:\.02em;\}/.test(src)
   && !/\.tcard-seq-vip\{[^}]*color:/.test(src));

console.log('\n② 抽獎本身的 VIP 口徑（這一支沒動，確認浮水印跟它是同一個判準）');
{
  const g=n=>{ const m=src.match(new RegExp('function '+n+'\\([^)]*\\)\\{[^\\n]*\\n')); return m[0]; };
  const effTier=m=>m.level;   // 沙箱：自動等級直接讀 level（正式庫這兩位 level 都是 vip）
  const V=new Function('effTier', g('lottoIsVip')+'return lottoIsVip;')(effTier);
  eq('★★ 陳世勳／陳智傑（level=vip）→ VIP', [V({level:'vip'}), V({level:'vip'})], [true,true]);
  eq('★★ 林昭邦（主顧客）、李慧玲（會員）→ 不是 VIP', [V({level:'loyal'}), V({level:'regular'})], [false,false]);
  eq('★ 查不到會員 → 不當 VIP（寧可照常顯示數字）', V(undefined), false);
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
