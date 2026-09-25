/* 會員檔案頁的「訓練紀錄」分頁一直是空的（2026-09-25 使用者回報）

   「這邊的訓練紀錄　沒有同步嗎　還是因為我不是該會員的教練呢」

   都不是。張雅雯有 29 筆紀錄、使用者是 admin（RLS 的 tlog_select_scoped 第一條
   就是 is_admin()），資料與權限都沒問題 —— 是**載入順序**：

     ① ppLoadCtx 只在 `PP.recView==='training'` 時才撈 trainLogs
     ② 但進會員頁時 recView 是 null，ppRecordHtml 開頭才把它設成 'tickets'
        → ①的條件永遠不成立
     ③ 之後點「訓練紀錄」走 ppShowRecord → ppRenderBody()，那是**同步**的，
        不會重跑 ppLoadCtx
     → c.trainLogs 永遠是 []，這個分頁從 0909 做好以來就沒顯示過東西

   ⚠ 「只有真的要看時才撈」的原意是對的（ctx 每開一位會員就組一次，
     多撈一張大表會拖慢每一次開會員資料）—— 所以修法不是改成一律撈，
     而是把補撈搬到「切到那一頁的時候」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)i=src.indexOf('async function '+n+'(');
  if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 切到那一頁時會補載');
{
  const S=grab('ppShowRecord');
  ok('★★★ ppShowRecord 切到 training 時呼叫 ppLoadTrain',
     /if\(kind==='training'\) ppLoadTrain\(\);/.test(S));
  ok('★★ 補載排在 ppRenderBody 之後（先把畫面畫出來，資料回來再補一次）',
     S.indexOf('ppRenderBody();') < S.indexOf('ppLoadTrain()'));
  ok('★★ 其他分頁不受影響（只有 training 會多打一次）',
     (S.match(/ppLoadTrain\(\)/g)||[]).length===1);
}

console.log('\n② ppLoadTrain 本身');
{
  const L=grab('ppLoadTrain');
  ok('★★★ 只載一次（_trainLoaded 擋住重複）',
     /if\(!c \|\| c\._trainLoaded\) return;/.test(L) && /c\._trainLoaded=true;/.test(L));
  ok('★★★ 濾掉 slot=2（1V2 第二位的紀錄借掛在這位會員身上）',
     /Number\(l\.slot\)!==2/.test(L));
  ok('★★★ 一起載 tlBkMetaLoad（日期要用 booking 的上課日，而 tlSessionsHtml 是同步的）',
     /await tlBkMetaLoad\(\);/.test(L));
  ok('★★★ 載完要確認還停在同一位會員、同一頁才重畫（載入中切走就不要硬畫）',
     /if\(PP && PP\.id===_id && PP\.recView==='training'\) ppRenderBody\(\);/.test(L));
  ok('★★ 抓 id 抓在 await 之前（await 期間使用者可能已經換了一位）',
     L.indexOf('const _id=PP.id;') < L.indexOf('await dbGetAll'));
  ok('★★ 失敗就給空陣列，不要留著上一位的資料', /catch\(_\)\{ c\.trainLogs=\[\]; \}/.test(L));
}

console.log('\n③ 換會員時旗標要清掉');
{
  ok('★★★ ctx 初始化時 _trainLoaded=false',
     /c\.trainLogs=\[\]; c\._trainLoaded=false;/.test(src));
  ok('★★★ 換會員時整個 ctx 重建（旗標自然跟著清）',
     /Object\.assign\(PP,\{kind, id, rec, draft:null, tab:'basic', editing:false, ctx:\{\}/.test(src));
}

console.log('\n④ 原本的「只有要看才撈」沒有被改成一律撈');
{
  ok('★★★ ppLoadCtx 仍然只在已經停在 training 時才撈（例如重新整理停在那一頁）',
     /if\(PP\.recView==='training'\)\{ await ppLoadTrain\(\); \}/.test(src));
  ok('★★ 原意寫在原地（ctx 每開一位會員就組一次，多撈一張大表會拖慢）',
     /多撈一張大表會拖慢每一次開會員資料/.test(src));
  ok('★★★ 成因寫在原地（下一個人不要以為是 RLS 或同步問題）',
     /這個分頁\*\*從 0909 做好以來一直是空的\*\*/.test(src)
     && /而\*\*進會員頁時 recView 還是 null\*\*/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
