/* 課表動作拖移排序（2026-09-25 使用者要的）

   「現在上課寫訓練課表的時候　可以拖移調整順序嗎」
   「紀錄的當下　已經寫完紀錄發現動作1跟2順序反了」
   —— 兩筆都已經進資料庫，但人還在課上，要能當場一秒改掉。

   原本完全靠 created_at（0923 使用者：「訓練紀錄的排序　要按照教練紀錄的順序」），
   時間戳不該為了排序被竄改，所以另開 training_logs.seq。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)i=src.indexOf('async function '+n+'(');
  if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 一堂之內照 seq');
{
  const f=new Function(grab('tlSeqSort')+'\nreturn tlSeqSort;')();
  const L=(id,seq,at)=>({id,seq,created_at:at});
  eq('★★★ 有 seq 就照 seq（不管記錄先後）',
     f([L('c',3,'T3'),L('a',1,'T1'),L('b',2,'T2')]).map(x=>x.id), ['a','b','c']);
  eq('★★★ 拖過之後：第 1 跟第 2 對調（使用者回報的那個情境）',
     f([L('動作1',2,'T1'),L('動作2',1,'T2')]).map(x=>x.id), ['動作2','動作1']);
  eq('★★ 都沒有 seq → 退回 created_at（0923 定的「教練記錄的順序」沒被推翻）',
     f([L('b',null,'T2'),L('a',null,'T1')]).map(x=>x.id), ['a','b']);
  eq('★★★ 混合時有 seq 的排前面（新記的一定帶 seq，所以這只會發生在漏網的舊資料）',
     f([L('x',null,'T0'),L('a',1,'T9')]).map(x=>x.id), ['a','x']);
  eq('★★ seq 相同時用 created_at 決勝（不要靠陣列原本的順序）',
     f([L('b',1,'T2'),L('a',1,'T1')]).map(x=>x.id), ['a','b']);
  ok('★★ 不改動原陣列（呼叫端常常還要用同一份）', (()=>{
     const arr=[L('b',2,'T2'),L('a',1,'T1')]; f(arr); return arr[0].id==='b'; })());
  ok('★★ 跨堂不歸它管，理由寫在原地',
     /這支只管「一堂之內」。跨堂（哪一堂在前）一律照 created_at 降冪/.test(src));
}

console.log('\n② 新記的動作排在最後');
{
  const mk=(logs,slot)=>new Function('window', grab('tlNextSeq')+'\nreturn tlNextSeq;')(
    {_tlAllLogs:logs, _tlSlot:slot});
  const R=(bid,seq,slot)=>({id:'x'+seq, booking_id:bid, seq, slot:slot||null});
  eq('★★★ 空的一堂 → 1', mk([],1)('B1'), 1);
  eq('★★★ 已經有 3 筆 → 4', mk([R('B1',1),R('B1',2),R('B1',3)],1)('B1'), 4);
  eq('★★ 只看這一堂（別堂的不算）', mk([R('B1',1),R('B9',7),R('B9',8)],1)('B1'), 2);
  eq('★★★ 1V2 兩位各排各的：第二位看 slot=2',
     mk([R('B1',1,null),R('B1',2,null),R('B1',1,2)],2)('B1'), 2);
  eq('　　slot=null 與 slot=1 是同一位（0915 的慣例）',
     mk([R('B1',1,null),R('B1',2,1)],1)('B1'), 3);
  eq('★★ add 給「一次寫多筆」用（套用歷史／套用方案）', mk([R('B1',1)],1)('B1',2), 4);
  ok('★★★ 為什麼一定要帶 seq，理由寫在原地',
     /使用者會看到「新記的那幾個怎麼都黏在最下面拖不上去」/.test(src));
}

console.log('\n③ 三個寫入點都帶 seq');
{
  ok('★★★ 單筆記錄（tlSaveExercise）', /seq:tlNextSeq\(b\.id\),/.test(grab('tlSaveExercise')));
  ok('★★★ 套用歷史課表（多筆遞增）',
     /let _sq=tlNextSeq\(b\.id\);/.test(grab('tlDoApplyHist'))
     && /seq:\(_sq!=null\?_sq\+\+:null\),/.test(grab('tlDoApplyHist')));
  ok('★★★ 套用訓練方案（多筆遞增）',
     (src.match(/let _sq=tlNextSeq\(b\.id\);/g)||[]).length===2
     && (src.match(/seq:\(_sq!=null\?_sq\+\+:null\),/g)||[]).length===2);
}

console.log('\n④ 四個讀取端都接上（少一個就會兩種順序）');
{
  ok('★★★ 教練課表', /const logs=tlSeqSort\(allLogs\.filter\(l=>l\.booking_id===b\.id/.test(src));
  ok('★★★ 會員端每週紀錄 ＋ 共用的 tlSessionsHtml',
     (src.match(/const sess=Object\.entries\(byBk\)\.map\(\(\[bid,ls\]\)=>\{ const _ls=tlSeqSort\(ls\);/g)||[]).length===2);
  ok('★★★ 會員資料視窗 ＋ 會員檔案頁（原本沒排，吃外層降冪所以是倒著看的）',
     (src.match(/const sessions=Object\.entries\(byBk\)\.map\(\(\[bid,ls\]\)=>\{ const _ls=tlSeqSort\(ls\);/g)||[]).length===2);
  ok('★★ 舊的 created_at 課內排序已經收乾淨',
     !/const logs=allLogs\.filter\(l=>l\.booking_id===b\.id[\s\S]{0,80}?\.sort\(\(a,b\)=>\(a\.created_at/.test(src));
}

console.log('\n⑤ 拖移本身');
{
  const D=grab('tlLpStart');
  ok('★★★ 長按 400ms 才成立（不是 HTML5 draggable —— 手機不會觸發）',
     /},400\);/.test(D) && !/draggable/.test(D));
  ok('★★★ 還沒成立就移動超過 8px ＝ 在捲畫面，取消', /if\(Math\.abs\(ev\.clientY-startY\)>8\)/.test(D));
  ok('★★★ 三道防觸控的機制都在（這是方案那邊踩完的坑）',
     /el\.style\.touchAction='none'/.test(D)                        /* ① */
     && /\{passive:false\}/.test(D) && /if\(armed\) ev\.preventDefault\(\)/.test(D)  /* ② */
     && /const onCancel=\(\)=>\{ if\(!armed\) finish\(false\); \}/.test(D));         /* ③ */
  ok('★★★ 拖移中只搬 DOM，不重畫（重畫＝節點被銷毀＝pointercancel）',
     !/renderTrainingLogSheet\(\)/.test(D) && /box\.insertBefore\(el, before\)/.test(D));
  ok('★★ ✕ 不進拖移（不然要刪的時候會變成拖）',
     /e\.target\.closest\('\.tl-del'\)\) return;/.test(D));
  ok('★★★ 放開後那一次 click 要吃掉，不然一拖完就跳修改視窗',
     /window\._tlDragged=1;/.test(D)
     && /if\(window\._tlDragged\)\{ window\._tlDragged=0; return; \}/.test(grab('tlEditLog')));
  ok('★★ 只有教練端掛得到（會員端唯讀不給拖）',
     /\$\{editable\?` data-lid="\$\{l\.id\}" onclick="tlEditLog\('\$\{l\.id\}'\)" onpointerdown="tlLpStart\(event,'\$\{l\.id\}'\)"`:''\}/.test(src));
}

console.log('\n⑥ 存回去');
{
  const S=grab('tlSaveOrder');
  ok('★★★ 只寫有變的那幾筆（交換相鄰兩個就只寫 2 筆，不是整堂 18 筆）',
     /if\(!rec \|\| Number\(rec\.seq\)===k\+1\) continue;/.test(S));
  ok('★★★ 手上的快取要同步，否則接著新增會算出重複的 seq',
     /\(window\._tlAllLogs\|\|\[\]\)\.forEach\(x=>\{ const i=ids\.indexOf\(x&&x\.id\); if\(i>=0\) x\.seq=i\+1; \}\);/.test(S));
  ok('★★ 存不成功要出聲（不能安靜吞掉 —— 使用者會以為排好了）',
     /showToast\('順序沒存成功：'/.test(S));
  ok('★★ 不重畫課表（DOM 已經是對的，重畫只會閃一下）',
     !/renderTrainingLogSheet\(\)/.test(S));
}

console.log('\n⑦ migration');
{
  const sql=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260925_training_logs_seq.sql','utf8');
  ok('★★★ 分組鍵是 (booking_id, slot)：1V2 兩位在同一堂裡各排各的',
     /partition by booking_id, coalesce\(slot, 1\)/.test(sql));
  ok('★★ 回填照 created_at（原本的順序一格都不動）', /order by created_at, id/.test(sql));
  ok('★★ 有索引（讀取端一律 order by seq）', /training_logs_bk_seq_idx/.test(sql));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
