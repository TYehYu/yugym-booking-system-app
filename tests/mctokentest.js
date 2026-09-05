/* 桌機幕僚台（body.mc-mode）圓角接上設計 token —— 2026-09-05
   使用者指示：「接著做 還是要注意不要影響目前在營運的系統」

   ══ 背景 ══
   :root 早就定義好 --radius-xs/sm/md/lg/xl/2xl/full，但桌機家族 118 次圓角
   只有 1 次用 token。而且寫死的值幾乎正好落在 token 上（6/8/10/12/14/16px、999px），
   所以替換是機械式的、且**保值**：展開 var() 之後與原本一字不差。

   ══ 為什麼可以斷定不影響營運 ══
   ① 這些 token 全站只定義一次（唯一被重新定義的 --text 是顏色，不是尺寸），
      所以 var(--radius-md) 在任何主題／斷點下都是 10px，不會因情境而變。
   ② 替換後把每一條規則的 var(--radius-*) 展開回字面值，與 HEAD 逐條比對：
      消失 0、新增 0、內容不同 0（那 67 處替換在比對裡根本不出現）。

   ══ --radius-pill 這個命名地雷 ══
   它是 20px，但這個 codebase 實際的膠囊圓角是 999px（--radius-full，用了 27 次）。
   下一個人伸手拿「pill」會拿到 20px。三個使用者（.tag／.dsys-badge／.tl-live-badge）
   都是 11px 字、上下 padding 2–3px 的小標籤，量到高度 19px。
   CSS 規範的 overlapping curves 規則：兩個半徑之和超過邊長時，全部按 f=邊長/總和
   等比縮小 → 19px 高的盒子，20px 與 999px 都會被夾成 9.5px，渲染相同。
   實際用 foreignObject→canvas 逐像素驗過：19px 的標籤 0 個像素不同；
   另外放的 43px 與 63px 對照組則有差異（180／128 px）——證明這個測法抓得到差異，
   不是假陰性。閾值就在「最短邊 40px」，標籤要斷成三行才會碰到。 */
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
let pass=0,fail=0;
const ok=(m,c,x)=>{ c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✗ '+m+(x!==undefined?'  → '+JSON.stringify(x):''))); };

const styles=[]; { let i=0; for(;;){ const a=src.indexOf('<style',i); if(a<0)break;
  const s=src.indexOf('>',a)+1, e=src.indexOf('</style>',s); styles.push(src.slice(s,e)); i=e; } }
const css=styles.join('\n');
const cssNC=css.replace(/\/\*[\s\S]*?\*\//g,'');

console.log('① token 的值不能被改（改了就會連動一整批規則）');
const WANT={'--radius-xs':'6px','--radius-sm':'8px','--radius-md':'10px','--radius-lg':'12px',
            '--radius-xl':'14px','--radius-2xl':'16px','--radius-full':'999px'};
Object.entries(WANT).forEach(([k,v])=>{
  const m=cssNC.match(new RegExp(k.replace(/-/g,'\\-')+'\\s*:\\s*([^;}]+)'));
  ok(`★★★ ${k} = ${v}`, !!m && m[1].trim()===v, m&&m[1].trim());
});
/* 每個 token 只准定義一次 —— 有第二處定義（例如 body.ink 底下）就代表
   「同一個 token 在不同情境是不同值」，那時候把字面值換成它就不再是保值替換。 */
Object.keys(WANT).forEach(k=>{
  const n=(cssNC.match(new RegExp(k.replace(/-/g,'\\-')+'\\s*:','g'))||[]).length;
  ok(`　 ${k} 只定義一次（多一處就不是保值替換了）`, n===1, n);
});

console.log('\n② --radius-pill 已退場');
ok('★★★ 定義移除（20px 這個「膠囊」是騙人的，實際膠囊是 999px）',
   !/--radius-pill\s*:/.test(cssNC));
ok('★★★ 三個使用者改吃 --radius-full', !/var\(--radius-pill\)/.test(src));
ok('★★ 為什麼能併（夾成短邊一半）與怎麼驗的，寫在本檔開頭',
   /overlapping curves/.test(fs.readFileSync(__filename,'utf8'))
   && /19px 的標籤 0 個像素不同/.test(fs.readFileSync(__filename,'utf8')));

console.log('\n③ 桌機家族的圓角一律走 token（離軌值除外）');
/* 只掃桌機家族：selector 含 mc-mode／.mc-*／.mcal */
const mask=t=>{ const o=t.split(''); let m;
  const re=/\/\*[\s\S]*?\*\//g; while((m=re.exec(t))) for(let p=m.index;p<re.lastIndex;p++) if(!/[\r\n]/.test(o[p])) o[p]=' ';
  return o.join(''); };
const isMc=s=>/mc-mode/.test(s)||/(^|[\s>~+(,])\.mc[-A-Za-z0-9_]*/.test(s)||/\.mcal/.test(s);
const bad=[];
styles.forEach(seg=>{
  const M=mask(seg); let i=0;
  while(i<M.length){
    const j=M.indexOf('{',i); if(j<0) break;
    const head=M.slice(i,j).trim(); let d=1,k=j+1;
    while(k<M.length&&d){ if(M[k]==='{')d++; else if(M[k]==='}')d--; k++; }
    if(!head.startsWith('@') && head && isMc(head)){
      const body=seg.slice(j+1,k-1);
      const re=/border(?:-[a-z]+)*-radius\s*:\s*([^;}]+)/g; let m;
      while((m=re.exec(body))){
        const v=m[1].replace('!important','').trim();
        if(/^(6|8|10|12|14|16|999)px$/.test(v)) bad.push(head.slice(0,50)+' → '+v);
      }
    }
    i=k;
  }
});
ok('★★★ 沒有落在 token 上卻還寫死的圓角', bad.length===0, bad.slice(0,6));
/* 離軌值刻意留著：1px/3px 是捲軸拇指與軸線、4px/5px 是進度條與 ink 模式的方鈕、
   50% 是正圓、0 是刻意拉平。它們沒有對應的 token，硬塞一個只會讓 token 表變雜。 */
ok('★★ 離軌的小圓角沒有被順手改掉（它們本來就不該有 token）',
   /border-radius:1px/.test(cssNC) && /border-radius:3px/.test(cssNC));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
