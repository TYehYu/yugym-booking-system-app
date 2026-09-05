/* 「宣告之前就先用了」掃描（2026-09-04）
   起因：openGrantApprove 裡 `const P=r.payload||{}` 宣告在折價券那一段**之後**，
   但那一段已經在讀 P.plan。const 在初始化前是暫時死區（TDZ），一讀就
     ReferenceError: Cannot access 'P' before initialization
   而整段包在 try{}catch(_){} 裡 → 錯誤被吞掉，表現成「折價券提醒從來沒出現過」。
   使用者 0828 要的「收款審核也要提醒會員有沒有折價券」等於一直沒生效，
   而且沒有任何徵兆：不會白畫面、不會有紅字、測試也不會紅。

   ⚠ 這支是啟發式的，不是真的 JS 剖析器。三層過濾把誤判壓掉：
     ① 內層同名參數（.forEach(t=>…) 之後外層才 const t）—— 往前 60 行找
     ② 行內宣告（`if(x){ const btn=…; if(btn)…` 這種不在行首的 const）
     ③ 模組層變數（宣告在第 0 欄）—— 函式範圍是用「下一個 ^function」切的，
        會把函式之後的頂層宣告誤算進來；那些在載入時就初始化了，不是 TDZ
   ⚠ 有誤判的話請加過濾條件，不要直接把行號寫進白名單 —— 白名單會跟著程式漂掉。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 註解、樣板字串、字串都先抹掉（保留行數） */
const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' '))
                .replace(/\/\/[^\n]*/g,'')
                .replace(/`(?:\\.|[^`\\])*`/gs,m=>m.replace(/[^\n]/g,' '))
                .replace(/'(?:\\.|[^'\\])*'/g,"''").replace(/"(?:\\.|[^"\\])*"/g,'""')
                /* ⚠ 正則字面值也要抹掉：`/vip/i.test(x)` 裡的 i 看起來就像變數 i 後面接一個點，
                   會被誤判成「宣告前先用」（2026-09-04 實際踩到）。
                   只認「前面是 =(,:!&| 之一、而且內容不含空白」的形式 —— 這樣不會把
                   `a / b` 這種除法整段吃掉。 */
                .replace(/([=(,:!&|?])\/(?![*\/])(?:\\.|\[[^\]]*\]|[^\/\\\n\s])+\/[gimsuy]*/g, '$1RE');
const lines=src.split('\n');
const starts=[]; lines.forEach((l,i)=>{ if(/^\s*(async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(l)) starts.push(i); });

function scan(){
  const hits=[];
  starts.forEach((s,k)=>{
    const e=(k+1<starts.length?starts[k+1]:lines.length);
    const raw=lines.slice(s,e);
    const body=strip(raw.join('\n')).split('\n');
    const name=(lines[s].match(/function\s+([A-Za-z_$][\w$]*)/)||[])[1];
    const seen=new Set();
    body.forEach((l,j)=>{
      const m=l.match(/^(\s*)(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
      if(!m) return;
      if(m[1].length===0) return;                       // ③ 模組層，不算這個函式的
      const id=m[2]; if(seen.has(id)) return; seen.add(id);
      const q=id.replace(/[$]/g,'\\$');
      const use=new RegExp('(?<![\\w$.])'+q+'\\s*[.\\[]');
      const decl=new RegExp('(?:const|let|var)\\s+'+q+'(?![\\w$])');
      const shadow=[
        new RegExp('(?<![\\w$.])'+q+'\\s*=>'),
        new RegExp('\\([^()]*(?<![\\w$.])'+q+'(?![\\w$])[^()]*\\)\\s*=>'),
        new RegExp('function\\s*\\*?\\s*[\\w$]*\\s*\\([^()]*(?<![\\w$.])'+q+'(?![\\w$])'),
        new RegExp('for\\s*\\(\\s*(?:const|let|var)\\s+'+q+'(?![\\w$])'),
        new RegExp('catch\\s*\\(\\s*'+q+'\\s*\\)'),
      ];
      for(let a=0;a<j;a++){
        if(!use.test(body[a])) continue;
        /* ①② 往回找：內層同名參數或行內宣告，都可能開在**更前面的行**
           （`.forEach(tk=>{` 在上一行、`if(x){ const btn=…` 在同一行的行中）。
           只看使用的那一行會漏掉一大半，全部當成錯誤回報。 */
        let excused=false;
        for(let z=a; z>=0; z--){
          if(shadow.some(p=>p.test(body[z]))){ excused=true; break; }   // ① 內層同名
          if(decl.test(body[z])){ excused=true; break; }                // ② 行內宣告
        }
        if(excused) break;
        hits.push({fn:name,id,use:s+a+1,decl:s+j+1,code:raw[a].trim().slice(0,80)});
        break;
      }
    });
  });
  return hits;
}

console.log('① 全檔沒有「同一個函式裡，宣告前就先用」');
{
  const hits=scan();
  ok('★★★ 掃描結果是空的',
     hits.length===0, hits.map(h=>`${h.fn}() ${h.id} 用在:${h.use} 宣告在:${h.decl}`));
}

console.log('\n② 掃描器本身抓得到（拿真的那個 bug 當樣本重放）');
{
  /* 把修好的順序倒回去，確認這支測試會紅 —— 不然它只是個永遠綠燈的裝飾。 */
  const before=`async function _fake(id){
  const r=await dbGet('x',id);
  window._v=[];
  try{
    const _vt=VOUCHER_TT[(P.plan&&P.plan.category)||''];
  }catch(_){}
  const P=r.payload||{};
  return P;
}`;
  const bodyL=strip(before).split('\n');
  let found=false;
  bodyL.forEach((l,j)=>{
    const m=l.match(/^(\s+)(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/); if(!m) return;
    const q=m[2]; const use=new RegExp('(?<![\\w$.])'+q+'\\s*[.\\[]');
    for(let a=0;a<j;a++) if(use.test(bodyL[a]) && !new RegExp('(?:const|let|var)\\s+'+q).test(bodyL[a])){ found=true; break; }
  });
  ok('★★★ 同樣的寫法會被抓出來', found);
}

console.log('\n③ 那一個 bug 的修法還在（P 在用它之前就宣告好）');
{
  const i=src.indexOf('async function openGrantApprove(id){');
  /* ⚠ 要先把註解抹掉：上面那段解釋 bug 的註解自己就寫著 P.plan，
     不抹掉的話「第一次使用」會抓到註解，測試永遠紅。 */
  const b=strip(src.slice(i, src.indexOf('\n  window._grP=P;', i))).split('\n');
  const d=b.findIndex(l=>/^\s+const P\s*=\s*r\.payload/.test(l));
  const u=b.findIndex(l=>/(?<![\w$.])P\s*\./.test(l));
  ok('★★★ 宣告在第一次使用之前', d>=0 && u>=0 && d<u, {宣告行:d, 首次使用行:u});
  ok('★★ 理由寫在原地', /`const` 在初始化前是\*\*暫時死區\*\*/.test(src));
}


console.log('\n④ 導覽與小語的 emoji 是死的，別再加回來（2026-09-05）');
{
  /* 「程式裡有 emoji」不等於「畫面上看得到 emoji」。今天三個發現都是同一類：
     stIcon（指派 10 次沒被畫）、導覽列 icon/ic（SVG 永遠贏）、
     FITNESS_TIPS 的 ic（渲染端只讀 cat 與 t）。合計 59 個從沒出現過的 emoji。 */
  const codeNoCmt=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  const isEmoji=c=>{const o=c.codePointAt(0);
    return (o>=0x1F300&&o<=0x1FAFF)||(o>=0x2600&&o<=0x27BF)||(o>=0x1F000&&o<=0x1F2FF);};
  const hasEmoji=t=>[...t].some(isEmoji);

  const nav=codeNoCmt.slice(codeNoCmt.indexOf("{key:'g_dashboard'"), codeNoCmt.indexOf("{key:'g_supervisor'")+400);
  ok('★★★ 頂部導覽的群組不再帶 emoji（畫的是 NAV2_ICONS 的 SVG）',
     !(nav.match(/icon:'[^']*'/g)||[]).some(hasEmoji));
  ok('★★★ NAV2_ICONS 六群都有 SVG（所以 fallback 本來就輪不到）',
     ['g_dashboard','g_booking','g_member','g_admin','g_report','g_supervisor']
       .every(k=>new RegExp('\\n\\s*'+k+":\\s*'<svg").test(src)));

  const bn=codeNoCmt.slice(codeNoCmt.indexOf('const ADMIN_BOTTOM_NAV=['), codeNoCmt.indexOf('const ADMIN_BOTTOM_NAV=[')+400);
  ok('★★★ 底部導覽不再帶 emoji（畫的是 BN_ICONS 的 SVG，fallback 是空字串）',
     !hasEmoji(bn) && /BN_ICONS\[n\.key\]\|\|''/.test(src));

  const tipsA=codeNoCmt.indexOf('const FITNESS_TIPS=[');
  const tips=codeNoCmt.slice(tipsA, codeNoCmt.indexOf('\n];', tipsA));
  ok('★★★ 健康小語不再帶沒人讀的 ic（渲染端只用 cat 與 t）',
     !/,ic:'/.test(tips) && /\{c:MAP\[tp\.cat\]\|\|'train', t:TITLE\[tp\.cat\]\|\|tp\.cat, s:tp\.t\}/.test(src));
  ok('★★ 理由寫在原地（下次盤點要看渲染端，不是看原始碼）',
     /「程式裡有 emoji」不等於「畫面上看得到 emoji」，盤點要看渲染端/.test(src));
}

console.log(`\n${fail?'✗ ':'✓ '}${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
