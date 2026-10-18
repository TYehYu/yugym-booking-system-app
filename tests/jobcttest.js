/* 職務契約進系統（2026-10-16 使用者：「幫我把職務契約做在系統裡面 首頁的查看合約」）

   四份契約（正職／兼職／合作教練／主管職）原本只有 Downloads 裡的紙本 PDF。
   收進 index.html 之後，首頁［查看合約］先挑一份，再走既有的列印／PDF 那一套。

   這支測試盯三件容易壞的事：
     ① 條文內容真的在（不是只有標題）——尤其是三種身分的分野字句
     ② ctBodyHTML 認得「第一條」抬頭（不認就全部變成沒縮排的散句）
     ③ 權限：櫃檯看不到職務契約 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* ── 把 JOB_CONTRACTS 與兩支小函式抽出來實跑 ── */
const i=src.indexOf('const JOB_CT_VERSION=');
const j=src.indexOf('function jobCtSignBlock(');   // ⚠ 別寫死括號內容，1018 加了參數 c
let d=0,end=-1;
for(let k=src.indexOf('{',j);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d){end=k+1;break;} } }
ok('★★ 抽得到 JOB_CONTRACTS 區塊', i>0 && j>i && end>j, {i,j,end});
const api=new Function(src.slice(i,end)+'\nreturn {JOB_CT_VERSION,JOB_CONTRACTS,jobCtGet,jobCtSignBlock};')();
const byId=x=>api.jobCtGet(x);

console.log('\n① 六份契約＋一份表單，欄位齊');
/* 2026-10-16 使用者：「我們還有一個是只有櫃檯值班的正職」——
   查正式庫（余東翰）：can_teach=false、base_salary=35000、duty_hourly=0、
   weekly_work_days=5、need_punch=true。
   ⚠ 不能跟正職教練共用一份：那份的核心是「max(教練課費, 保障底薪)」，
     櫃檯沒有課費，是單純月薪，而且值班含在月薪裡不另計時薪。 */
ok('★★★ 六份職務契約（正職教練／正職櫃檯／兼職／工讀／合作／主管職）',
   api.JOB_CONTRACTS.filter(c=>c.grp!=='form').length===6,
   api.JOB_CONTRACTS.filter(c=>c.grp!=='form').map(c=>c.id));
/* 2026-10-18 使用者：「最急迫的是mango的　我需要自願離職單跟合作教練契約」。
   ⚠ 離職單是**人事表單不是契約** —— grp:'form' 讓選單分成兩組，
     混在契約清單裡會讓人以為它也是要「簽約」的東西。 */
ok('★★★ 另有人事表單（自願離職申請書）',
   api.JOB_CONTRACTS.filter(c=>c.grp==='form').map(c=>c.id).join()==='quit');
ok('★★★ 每一份都有 id／name／sub／tag／body', api.JOB_CONTRACTS.every(c=>c.id&&c.name&&c.sub&&c.tag&&c.body));
ok('★★ id 不重複', new Set(api.JOB_CONTRACTS.map(c=>c.id)).size===7);
ok('★★ jobCtGet 查得到、查不到回 null', !!byId('full') && byId('nope')===null);
/* ⚠ 門檻 1018 一路降到 700：離職單被使用者刪短了五次（到職日、工資結算金額、
   合計應領、第六條整條…），剩 772 字。這一條只是要擋「只有標題的空殼」，不是在比長度。 */
ok('★★ 每一份都夠長（不是只有標題的空殼）', api.JOB_CONTRACTS.every(c=>c.body.length>700),
   api.JOB_CONTRACTS.map(c=>c.body.length));

console.log('\n② 甲方＝登記名「筋實堂」，不是品牌名（見 yugym-biz-identity）');
ok('★★★ 每一份的甲方都寫筋實堂＋統編', api.JOB_CONTRACTS.every(c=>
   c.body.indexOf('筋實堂')>=0 && c.body.indexOf('91788490')>=0));
ok('★★★ 對外文件不可用品牌名當立約人', api.JOB_CONTRACTS.every(c=>
   c.body.indexOf('YUGYM')<0 && c.body.indexOf('有肌訓練')<0));
ok('★★ 契約的簽名區是甲方／乙方（不是會員／教練）', (()=>{
  const s=api.jobCtSignBlock(byId('coop'));
  return s.indexOf('甲方（雇主）')>=0 && s.indexOf('乙方')>=0 && s.indexOf('會員簽名')<0;
})(), api.jobCtSignBlock(byId('coop')));
/* ⚠ 1018 複查發現：人事表單用「甲方／乙方」會讀起來像雙方合意終止，
   正好稀釋掉這份文件唯一的用途 —— 證明是本人自願提出的。 */
ok('★★★ 人事表單的簽名區是申請人／公司收件，不可出現甲乙方', (()=>{
  const s=api.jobCtSignBlock(byId('quit'));
  return s.indexOf('申請人　簽章')>=0 && s.indexOf('公司　收件')>=0
      && s.indexOf('甲方')<0 && s.indexOf('乙方')<0;
})(), api.jobCtSignBlock(byId('quit')));
ok('★★ 沒帶參數時仍回契約版（舊呼叫不會爆）',
   api.jobCtSignBlock().indexOf('甲方（雇主）')>=0);
ok('★★ 列印頁尾的「一式二份」表單與契約講法不同',
   /c\.grp==='form'\?'本表一式二份，申請人與公司各執一份。':'本契約一式二份/.test(src));
ok('★★ 列印有把契約本身傳進簽名區（不然表單會拿到甲乙方）',
   /\$\{jobCtSignBlock\(c\)\}/.test(src));

console.log('\n③ 三種身分的分野要寫得死（這是整件事的重點）');
/* ⚠ 合作教練最怕被認定為假承攬：三個要件（不適用勞基法、不投保、無值班義務）
   任何一句被改掉就失去防線 —— 釘住。 */
const coop=byId('coop');
ok('★★★ 合作教練：明寫不適用勞動基準法', coop.body.indexOf('不適用勞動基準法')>=0);
/* ⚠ 2026-10-18 使用者：「只要留下雙方是平等互惠的合作關係就好　不要過多說明」。
   條文從法律用語改成一句白話，斷言要跟著改 —— 盯的是**實質**不是句型：
   平等互惠（非受僱）／不投保／無值班義務，三件事一件都不能少。 */
ok('★★★ 承攬：明寫平等互惠的合作關係（＝不是受僱人）',
   coop.body.indexOf('雙方是平等互惠的合作關係')>=0);
ok('★★★ 承攬：公司不保勞保、不提繳勞退',
   coop.body.indexOf('不幫你保勞保')>=0 && coop.body.indexOf('不提繳勞退')>=0);
ok('★★★ 承攬：無值班義務、無最低排課',
   coop.body.indexOf('沒有值班義務')>=0 && coop.body.indexOf('沒有最低排課')>=0);
ok('★★★ 合作教練：執行業務所得＋扣繳憑單', coop.body.indexOf('扣繳憑單')>=0);
/* 2026-10-16 使用者看預覽時指出：「乙方得自備發票或收據請款」這一條我們目前都沒有。
   店裡的實際做法就是甲方扣繳、開扣繳憑單，教練不開發票 —— 契約改成照實寫。
   ⚠ 這一條別再改回「自備發票」：寫了沒做，反而留下一個對不上的約定。 */
/* ⚠ 2026-10-18 使用者指著第四條說「移除第三跟第五項」——
   「你不用另外開發票或收據」整句拿掉，所以只剩反面斷言：
   不可以寫成「乙方自備發票請款」（我們沒有在這樣做，寫了就是寫一個對不上的約定）。 */
ok('★★★ 承攬：不要求教練開發票（照實際做法寫）', coop.body.indexOf('自備發票')<0);
/* 「沒有底薪」從條文拿掉了，但它是承攬最關鍵的特徵之一 —— 摘要那一列要留著。 */
ok('★★★ 承攬：摘要仍寫明沒有底薪',
   coop.sum.some(r=>r[1].indexOf('沒有底薪')>=0));
/* 2026-10-16 使用者再指出：「我們沒有提供教練自行帶會員進來運動的服務
   系統的場租目前只提供給教練帶自己的家人來使用」——
   原本第五條留了一格「乙方自行帶入之會員：＿＿＿」給雙方議定，那是憑空想像的服務。
   ⚠ 這兩條互相搭配：會員一律屬甲方（所以乙方不得帶學員進來），場租只能帶家屬、不得授課。
     少了後面那半句，場租就會變成繞過前半句的後門。 */
ok('★★★ 承攬：沒有「自行帶入之會員」這種東西',
   coop.body.indexOf('自行帶入之會員')<0 && coop.body.indexOf('會員關係屬於公司')>=0);
/* ⚠ 2026-10-18 使用者指著第五條說「移除第二項」——「別處的學員不可以帶進來上課」拿掉了。
   第五條 1「會員關係屬於公司」仍在，這一條才是會員歸屬的本體；剩下的保密與不勸誘也都留著。 */
ok('★★★ 承攬：會員歸屬、保密、不勸誘三件事都還在',
   coop.body.indexOf('會員關係屬於公司')>=0
   && coop.body.indexOf('要保密，合作結束後仍然有效')>=0
   && coop.body.indexOf('不可以勸誘公司的會員離開公司')>=0);
/* ⚠ 2026-10-18 使用者指著第三條說「移除第二跟第五項」——
   場租帶家屬那一條整條拿掉（場租是另一回事，不綁在承攬契約裡），
   自備證照器材那一條也拿掉。
   「別處的學員不可以帶進來上課」留在第五條，後門沒有因此打開。 */
ok('★★★ 承攬：第三條不再提場租與自備成本',
   coop.body.indexOf('帶家屬')<0 && coop.body.indexOf('執業成本')<0);
/* 2026-10-16 使用者第三輪：「這個目前也沒有　專業責任保險目前也沒有要求」。
   ① 取消的報酬本來留一格給雙方議定 —— 但系統裡早就有明確規則：
      bkCounts 排除 status==='cancelled'，教練課費又另外要求 completed／checked_in，
      所以**取消的課一律算不到教練頭上**，連 24 小時內取消（會員照扣堂數）也一樣。
      契約照這個寫，不要留白。
   ⚠ 這一條與程式連動：哪天改成「臨時取消也要給教練錢」，契約與 bkCounts 要一起改。
   ② 專業責任保險沒有在要求 —— 「應投保」改成「建議投保」。
      ⚠ 第八條後兩項（乙方自負賠償、甲方不負職災補償）一定要留著，
        那才是真正在用的責任劃分；連同保險一起刪會把防線拆掉。 */
/* ⚠ 「被取消的課不計報酬」這一句涵蓋所有取消，包含 24 小時內（會員照扣堂數那種）。
   原本另外寫一句講 24 小時的，是解釋不是新規則，1018 精簡時併回這一句。
   與程式連動：哪天改成「臨時取消也要給教練錢」，契約與 bkCounts 要一起改。 */
ok('★★★ 承攬：取消的課不計報酬（與 bkCounts 一致），不留空格',
   coop.body.indexOf('被取消的課不計報酬')>=0 && coop.body.indexOf('報酬之計算方式為')<0);
/* ⚠ 1018 使用者定版：「建議加保」——是建議不是條件。
   「應自行投保」「提供保單影本」那種強制寫法不可以回來（會變成合作的前提條件）。 */
ok('★★★ 承攬：專業責任險是建議、不是強制', (()=>{
   const b=coop.body;
   return b.indexOf('建議加保專業責任險')>=0
       && b.indexOf('應自行投保')<0 && b.indexOf('保單影本')<0;
})());
/* ⚠ 責任劃分是實質防線，不是叮嚀 —— 精簡的時候差點連它一起刪掉。
   1018 使用者最後定版的講法（逐字照抄，這是他自己挑的字）：
     「會員在課堂上受傷，由教練全權負責，公司僅協助處理。」
   同一次把「自己受傷沒有職災補償」那一項拿掉了 —— 承攬本來就不適用勞基法職災補償，
   第一條已經寫明不適用勞基法，所以刪掉的是重述，不是防線。 */
ok('★★★ 但責任劃分要留著（會員受傷由教練全權負責）',
   coop.body.indexOf('由教練全權負責，公司僅協助處理')>=0);
ok('★★★ 承攬不得有保障底薪（有底薪＝從屬性）', coop.body.indexOf('保障底薪')<0);
/* 臨時場務支援那一條是 Ann 的情況（使用者：「Ann值班算是合作工讀的方式」）——
   個案委託、可拒絕、不列固定班表，缺一句就會把它變成常態值班。 */
ok('★★★ 承攬：臨時場務支援是個案委託、可以拒絕',
   coop.body.indexOf('個案接受公司委託')>=0 && coop.body.indexOf('你可以拒絕')>=0);
/* ⚠ 支援時數改成「照雙方確認的時數算」。原本寫「以系統進出紀錄為準」——
   那等於自己把出勤管理寫進承攬契約裡，是從屬性的證據，1018 精簡時一併拿掉。 */
ok('★★★ 承攬：支援時數雙方確認，不是出勤管理',
   coop.body.indexOf('照雙方確認的時數算')>=0 && coop.body.indexOf('進出紀錄')<0);

const full=byId('full'), part=byId('part');
ok('★★★ 正職：保障底薪 29,500（當年度基本工資）', full.body.indexOf('29,500')>=0);
ok('★★★ 正職：底薪與課費取高者、不相加', full.body.indexOf('取高的那個，不相加')>=0);
ok('★★ 正職：累進費率四段都在', ['600 元','650 元','675 元','700 元'].every(x=>full.body.indexOf(x)>=0));
/* 2026-10-16 使用者：「正職教練每日值班6小時」。
   系統的班別定義（salary_templates._shift_quick）早／中／晚／假日晚班剛好都是 6 小時，
   所以這是補寫沒寫到的事實，不是改制度。
   ⚠ 一定要配「值班時段內授課不另計工時」那半句 —— 少了它，
     「每日值班 6 小時」＋「還要上課」會被讀成每天超過 8 小時，自己打自己第 1 項。 */
ok('★★★ 正職教練：每天值班 6 小時', full.body.indexOf('每天值班 6 小時')>=0);
ok('★★★ 正職教練：值班時段內授課不另計工時（配套，缺了會自相矛盾）',
   full.body.indexOf('值班時段內上的課，不另外算工時')>=0);
ok('★★ 正職教練：班別註明 6 小時（與系統 _shift_quick 一致）',
   full.body.indexOf('班別都是 6 小時')>=0);
ok('★★★ 摘要也要講 6 小時（條文改了摘要沒改＝員工看到的是舊的）',
   byId('full').sum.some(r=>r[1].indexOf('每天值班 6 小時')>=0));
/* 櫃檯沒有被一起改 —— 使用者只講了教練，別自作主張 */
ok('★★ 櫃檯那份沒有被順手改到', byId('desk').body.indexOf('每天值班 6 小時')<0);
ok('★★★ 兼職：部分工時、無底薪', part.body.indexOf('部分工時勞工')>=0 && part.body.indexOf('你沒有底薪')>=0);
ok('★★★ 兼職：特休按年資與工時比例給', part.body.indexOf('照年資與工時比例給')>=0);
ok('★★ 兼職仍要加保勞保與提繳勞退（兼職≠承攬）',
   part.body.indexOf('辦勞保')>=0 && part.body.indexOf('提繳勞退')>=0);

const mgr=byId('mgr');
ok('★★★ 主管職：是附約，不是獨立委任或承攬', mgr.body.indexOf('不是另外的委任或承攬')>=0);
ok('★★★ 主管職：津貼與團隊獎金屬工資（要計入投保薪資）',
   mgr.body.indexOf('都算工資')>=0 && mgr.body.indexOf('勞保投保薪資')>=0);
ok('★★★ 主管職：不適用責任制（非 84-1 工作者）', mgr.body.indexOf('不適用責任制')>=0);
/* 店長獎金規則＝教練課＋團課合計（yugym-leader-bonus-rule，0827 二次確認）——
   契約寫錯會跟系統算出來的不一樣。 */
ok('★★★ 主管職：團隊獎金堂數＝教練課與團體課合計', mgr.body.indexOf('教練課與團體課合計')>=0);
ok('★★ 主管職：門檻 80／100 堂與 4,000／2,000 元', ['滿 80 堂','滿 100 堂','4,000 元','2,000 元'].every(x=>mgr.body.indexOf(x)>=0));

const desk=byId('desk');
console.log('\n③b 正職櫃檯：月薪制，沒有課費');
ok('★★★ 櫃檯：明寫沒有授課義務', desk.body.indexOf('你沒有授課義務')>=0);
/* ⚠ 櫃檯這份絕對不可以出現教練課費／累進費率 —— 那是另一份的東西，
   混進來會讓薪資結構對不上系統（can_teach=false 的人算不出課費）。 */
ok('★★★ 櫃檯：沒有教練課費、沒有累進費率、沒有達標獎金', (()=>{
  const b=desk.body;
  return b.indexOf('教練課費')<0 && b.indexOf('累進')<0 && b.indexOf('達標獎金')<0;
})());
ok('★★★ 櫃檯：值班含在月薪，不另計時薪（對應 duty_hourly=0）',
   desk.body.indexOf('值班已經含在月薪裡，不另外算值班時薪')>=0);
ok('★★★ 櫃檯：月薪不低於當年度基本工資', desk.body.indexOf('不低於當年度基本工資')>=0);
ok('★★ 櫃檯：請假時薪用月薪 ÷ 130（與正職教練同一套除數）',
   desk.body.indexOf('月薪 ÷ 130')>=0);
/* 余東翰 is_manager=true —— 櫃檯也可能兼主管，兩份契約要接得起來 */
ok('★★★ 櫃檯：兼主管時指向主管職務協議書', desk.body.indexOf('依主管職務協議書辦理')>=0);
/* 櫃檯經手現金，這一條是正職教練那份沒有的 */
ok('★★★ 櫃檯：款項保管（短溢款回報、不得挪用墊補）',
   desk.body.indexOf('短少或多收要馬上回報')>=0 && desk.body.indexOf('不可以自己挪用或墊錢補上')>=0);
ok('★★ 櫃檯：仍是正職，勞健保勞退特休照給',
   desk.body.indexOf('辦勞保')>=0 && desk.body.indexOf('提繳勞退')>=0
   && desk.body.indexOf('第五條　特休')>=0);

const intern=byId('intern');
console.log('\n③c 工讀生：排班再彈性也還是員工');
/* 2026-10-16 使用者：「你少給我一個工讀的合約」。
   正式庫三人（曹智詠／羅威／翁立安）設定一致：無底薪、值班 200／時、課費 600／堂、
   要打卡、weekly_work_days 為空（無固定週班）。三人目前都沒有勞保。
   ⚠⚠ 這份最關鍵的就是第一條與第六條 ——
     使用者說過「工讀生也沒有強制固定配班，一樣是用每月配合空班的方式」，
     而那正是目前沒保勞保的理由。勞保局立場：**排班彈性不是免保的理由**，
     只在有上班的日子加保也違法。這兩條被刪掉，等於把錯誤的理解寫回契約裡。 */
ok('★★★ 工讀：明寫是部分工時勞工、適用勞基法',
   intern.body.indexOf('部分工時勞工')>=0 && intern.body.indexOf('適用勞動基準法')>=0);
ok('★★★ 工讀：排班彈性不影響僱傭性質', intern.body.indexOf('這不改變僱傭關係')>=0);
ok('★★★ 工讀：在學學生一樣適用', intern.body.indexOf('在學學生亦同')>=0);
ok('★★★ 工讀：到職日起就要加保', intern.body.indexOf('從你到職日起辦勞保')>=0);
ok('★★★ 工讀：不因工時短／班表不固定／在學而免除加保',
   intern.body.indexOf('不會因為你工時短、班表不固定或還在念書就免除')>=0);
ok('★★★ 工讀：不得只在有出勤之日加保（勞保局明文禁止）',
   intern.body.indexOf('不可以只在你有上班的那幾天幫你加保')>=0);
ok('★★★ 工讀：值班時薪 200 且不低於基本工資時薪',
   intern.body.indexOf('值班時薪 200 元')>=0 && intern.body.indexOf('基本工資時薪')>=0);
ok('★★ 工讀：無固定班表、每月協調（照實際做法）',
   intern.body.indexOf('沒有固定班表')>=0 && intern.body.indexOf('排好下個月的班')>=0);
ok('★★ 工讀：沒證照就沒有授課義務（羅威 can_teach=false）',
   intern.body.indexOf('沒有證照就沒有授課義務')>=0);
ok('★★ 工讀：未滿 18 歲要法定代理人同意', intern.body.indexOf('未滿 18 歲')>=0);
ok('★★ 工讀：有特休（按比例）', intern.body.indexOf('照年資與工時比例給')>=0);
/* ⚠ 工讀不是承攬 —— 不可以混進合作教練那一份的字句 */
ok('★★★ 工讀不可出現「不適用勞動基準法」或「平等互惠的合作關係」（那是承攬那份的話）',
   intern.body.indexOf('不適用勞動基準法')<0 && intern.body.indexOf('平等互惠')<0);

const quit=byId('quit');
console.log('\n③d 自願離職申請書');
/* Mango 的情況是「離職當天就簽合作契約」。沉默不會讓事實消失 ——
   把雙方都知情這件事寫在紙上，反而是「真的是自願」最好的證據。
   ⚠ 這三句少一句，這份文件就失去它存在的意義。 */
ok('★★★ 明寫是本人意願、非資遣解僱',
   quit.body.indexOf('這份申請是我自己提出的，不是資遣或解僱')>=0);
ok('★★★ 明寫沒有資遣費、不能領失業給付（簽的人要知道代價）',
   quit.body.indexOf('沒有資遣費')>=0 && quit.body.indexOf('失業給付')>=0);
/* ⚠ 1018 使用者把「之後如果要合作」整條拿掉了（年資不併計那句一起走）。
   留下來的防線是第五條 1：公司在離職日辦退保、停止提繳勞退 —— 那是實際動作，
   不是宣示，少了它連退保都沒有依據。 */
ok('★★★ 公司從離職日起退保、停止提繳勞退',
   quit.body.indexOf('停止提繳勞退')>=0);
ok('★★ 「之後如果要合作」整條已移除', quit.body.indexOf('之後如果要合作')<0);
ok('★★★ 要結清工資與未休特休（折現）',
   quit.body.indexOf('沒休完的特休')>=0 && quit.body.indexOf('折發')>=0);
ok('★★ 公司要辦退保、停止提繳勞退',
   quit.body.indexOf('辦勞保、就保、職災保險與健保退保')>=0);
ok('★★ 服務證明書不得拒絕', quit.body.indexOf('服務證明書')>=0);
ok('★★ 有交接欄（鑰匙、門禁卡、權限、會員）',
   ['場館鑰匙','門禁卡','系統權限註銷','會員交接給'].every(x=>quit.body.indexOf(x)>=0));
ok('★★★ 這是表單不是契約：不可出現「本契約」字樣', quit.body.indexOf('本契約')<0);
/* ⚠ 2026-10-18 使用者：「每一項下方的說明就不用了　這樣顯得閱讀者好像很不懂」——
   摘要每一列的第三格（小字說明）整批拿掉，斷言不可以再去讀 sum[0][2]。 */
ok('★★ 摘要第一列就講清楚這是「你自行提出」的', quit.sum[0][1].indexOf('自行提出')>=0);
ok('★★★ 承攬與離職單的摘要沒有第三格小字說明',
   byId('coop').sum.every(r=>r.length===2) && quit.sum.every(r=>r.length===2),
   [byId('coop').sum.map(r=>r.length), quit.sum.map(r=>r.length)]);

console.log('\n④ 兩份正職契約都要滿足勞基法施行細則 §7 的必要之點');
[['工作場所','上班地點：公司場館'],['工作開始終止之時間','每週最多 40 小時'],
 ['休假例假','例假'],['特別休假','第五條　特休'],['工資議定','應發 ＝'],
 ['工資給付日期','每月 5 號發薪'],['退休','提繳勞退'],['災害補償','職業災害'],
 ['勞工保險','辦勞保'],['契約終止','預告'],['獎懲','獎懲'],['應遵守之紀律','工作規則']]
 .forEach(([what,needle])=>ok('★★ §7 '+what+'（教練）', full.body.indexOf(needle)>=0));
[['工作場所','上班地點：公司場館'],['工作開始終止之時間','每週最多 40 小時'],
 ['休假例假','例假'],['特別休假','第五條　特休'],['工資議定','應發 ＝'],
 ['工資給付日期','每月 5 號發薪'],['退休','提繳勞退'],['災害補償','職業災害'],
 ['勞工保險','辦勞保'],['契約終止','預告'],['獎懲','獎懲'],['應遵守之紀律','工作規則']]
 .forEach(([what,needle])=>ok('★★ §7 '+what+'（櫃檯）', desk.body.indexOf(needle)>=0));

console.log('\n⑤ 排版：ctBodyHTML 要認得「第一條」抬頭');
/* 不認的話，每一條的標題會跟內文一樣沒有加粗，整份契約讀起來是一團散句。 */
const bi=src.indexOf('function ctBodyHTML(');
let bd=0,bend=-1;
for(let k=src.indexOf('{',bi);k<src.length;k++){ if(src[k]==='{')bd++; else if(src[k]==='}'){bd--; if(!bd){bend=k+1;break;} } }
const ctBodyHTML=new Function(src.slice(bi,bend)+'\nreturn ctBodyHTML;')();
const h=ctBodyHTML('第一條　工作地點與職務內容');
ok('★★★ 「第一條」被當成章節抬頭（ct-h2）', h.indexOf('ct-h2')>=0, h);
ok('★★★ 會員合約的「一、」沒有被改壞', ctBodyHTML('一、課程使用規則').indexOf('ct-h2')>=0);
ok('★★ 「1.」仍然走懸掛縮排（ct-li）', ctBodyHTML('1. 團體課程授課。').indexOf('ct-li')>=0);
ok('★★ 「（一）」仍然走懸掛縮排（費率表就是靠它對齊）',
   ctBodyHTML('（一）第 1 至 59 堂，每堂 600 元。').indexOf('ct-li')>=0);
ok('★★ 全形空白開頭的段落有縮排（不是 ct-p0）', (()=>{
  const r=ctBodyHTML('　工作地點為甲方營業場所。');
  return r.indexOf('ct-p')>=0 && r.indexOf('ct-p0')<0;
})());
/* 每一份的第一條都要被認出來，否則那一份的排版整個失效 */
ok('★★★ 每一份契約的每個「第N條」都認得出來', api.JOB_CONTRACTS.every(c=>{
  const heads=c.body.split('\n').filter(l=>/^第[一二三四五六七八九十百]+條/.test(l));
  /* ⚠ 下限 1018 從 7 降到 6：離職單被刪到剩六條。這一條盯的是「每個第N條都被認出來」，
     不是在數有幾條 —— 條數是使用者的決定。 */
  return heads.length>=6 && heads.every(l=>ctBodyHTML(l).indexOf('ct-h2')>=0);
}), api.JOB_CONTRACTS.map(c=>c.body.split('\n').filter(l=>/^第/.test(l)).length));

console.log('\n⑥ 權限與接線');
ok('★★★ 職務契約只給管理員／店長（櫃檯直接開會員合約）',
   /function openContractQuickView\(\)\{\s*if\(typeof isManagerUp!=='function' \|\| !isManagerUp\(\)\)\{ openMemberContractView\(\); return; \}/.test(src));
ok('★★★ 首頁的［查看合約］還是叫 openContractQuickView',
   src.indexOf('onclick="openContractQuickView()"><svg')>=0);
ok('★★ 會員合約被拆成自己的一支（選單才叫得動它）', src.indexOf('function openMemberContractView()')>=0);
ok('★★ 四支入口都在', ['function openJobContractView(','function openJobContractPrint(',
   'function jobCtGet(','function jobCtSignBlock('].every(x=>src.indexOf(x)>=0));
ok('★★★ 選單分成「職務契約」與「人事表單」兩組',
   /grp!=='form' && !c\.draft\)\.map\(c=>row\(/.test(src)
   && /grp==='form' && !c\.draft\)\.map\(c=>row\(/.test(src)
   && src.indexOf('人事表單　<span')>0);
/* ⚠ 2026-10-18 使用者：「先上承攬契約跟離職單　其他正職　兼職　工讀　主管
   先不要上　我還沒細看」。條文留在 JOB_CONTRACTS 裡不刪，只是掛 draft:true 不列出來 ——
   看完把旗標拿掉就上架。這一條盯的是「沒有人把未定稿的偷偷放出去」。 */
ok('★★★ 只有承攬與離職單會出現在選單',
   api.JOB_CONTRACTS.filter(c=>!c.draft).map(c=>c.id).sort().join()==='coop,quit',
   api.JOB_CONTRACTS.filter(c=>!c.draft).map(c=>c.id));
ok('★★★ 未定稿的五份條文還在（只是不上架，不是刪掉）',
   ['full','desk','part','intern','mgr'].every(id=>{
     const c=byId(id); return c && c.draft===true && c.body.length>800; }));
ok('★★ 選單用 .bk-opt（名字在左、說明靠右的定版列）',
   /openContractQuickView[\s\S]{0,1200}class="bk-opt"/.test(src));
ok('★★ 列印走既有的 ctPrintOpen／ctBodyHTML（不另寫版型）',
   /function openJobContractPrint[\s\S]{0,400}ctPrintOpen\(/.test(src) &&
   /function openJobContractPrint[\s\S]{0,500}ctBodyHTML\(c\.body\)/.test(src));
ok('★★ 契約正文在彈窗裡有跳脫（本文是資料不是樣板）',
   /function openJobContractView[\s\S]{0,600}esc\(c\.body\)/.test(src));
/* 範本是空白的：不可以夾帶任何員工真名（職務契約會印出來給人簽，帶錯名字很糟） */
ok('★★★ 範本不帶員工姓名', api.JOB_CONTRACTS.every(c=>
   ['黃沛瀞','黃美蓉','鄭百益','曾邦宏','余東翰','曹子安','郭若邑','林柏灝']
     .every(n=>c.body.indexOf(n)<0)));
ok('★★ 留白用全形底線（印出來才有地方寫）', api.JOB_CONTRACTS.every(c=>c.body.indexOf('＿')>=0));
/* ⚠ 1018：每次簽都填一樣的數字，就不該是空格 —— 直接寫死，簽的時候少三個決定。 */
ok('★★★ 承攬的三個數字已寫死（24 小時／30 天／200 元）', (()=>{
  const b=byId('coop').body;
  return b.indexOf('要在 24 小時前通知')>=0
      && b.indexOf('任一方提前 30 天以書面通知')>=0
      && b.indexOf('支援費每小時 200 元')>=0;
})());
/* ⑤ 第七條拿「證照失效」當終止事由，全文就必須有地方要求證照，否則前後對不上。 */
ok('★★★ 有要求教練維持證照（第七條 2 才有依據）',
   byId('coop').body.indexOf('你要維持有效的教練證照')>=0
   && byId('coop').body.indexOf('證照失效')>=0);
/* ④ 代課教練要有門檻：公司對「誰來上自己的會員」要有否決權。 */
ok('★★★ 代課教練公司可以不同意', byId('coop').body.indexOf('公司可以不同意')>=0);
/* ⑥ 執行業務所得單次給付滿 2 萬，公司有代扣補充保費的法定義務。 */
ok('★★★ 有寫二代健保補充保費 2.11%',
   byId('coop').body.indexOf('二代健保補充保費 2.11%')>=0);
/* ① 離職單不可以讓人簽一句簽名當天還不是事實的話。 */
ok('★★★ 離職單不再寫「都已經結清」',
   byId('quit').body.indexOf('都已經依第三條結清')<0
   && byId('quit').body.indexOf('依第三條與當月薪資單結算')>=0);
/* ⚠ 2026-10-16 踩到：工讀那份的正文寫了 <b>，但正文會經過 esc()／ctBodyHTML 跳脫，
   畫面上會看到字面的「<b>」。正文是資料不是樣板 —— 一個標籤都不能有。
   （摘要 sum 不跳脫，那邊可以用 <b>。） */
ok('★★★ 契約正文不可含 HTML 標籤（會被跳脫成字面文字）',
   api.JOB_CONTRACTS.every(c=>!/<[^>]+>/.test(c.body)),
   api.JOB_CONTRACTS.filter(c=>/<[^>]+>/.test(c.body)).map(c=>c.id));
/* 2026-10-16 使用者回報（附截圖）：「戶籍地址這樣長度不夠填寫」——
   原本地址 12 格、還跟聯絡電話擠同一行。台灣地址像
   「新北市新莊區後港一路28巷3弄2號1樓」就要 18 字，根本寫不下。
   ⚠ 底線長度是會被「順手縮短」的那種東西，釘一個下限：地址至少 24 格，而且自己一行。 */
ok('★★★ 地址欄夠長（至少 24 格）且獨佔一行', (()=>{
  const lines=[];
  api.JOB_CONTRACTS.forEach(c=>c.body.split('\n').forEach(l=>{
    if(/^(戶籍地址|通訊地址)：/.test(l)) lines.push(l);
  }));
  if(lines.length!==6) return false;              // 教練／櫃檯／兼職／工讀＋合作＋離職單
  return lines.every(l=>{
    const blanks=(l.match(/＿/g)||[]).length;
    return blanks>=24 && !/聯絡電話/.test(l);               // 不可以再跟電話擠同一行
  });
})(), (()=>{const o=[];api.JOB_CONTRACTS.forEach(c=>c.body.split('\n').forEach(l=>{
  if(/^(戶籍地址|通訊地址)：/.test(l)) o.push((l.match(/＿/g)||[]).length);}));return o;})());
/* ⚠ 1018 使用者回報（附截圖）：「電話這一項跳行了」——
   姓名＋身分證字號＋電話擠同一行，在彈窗寬度下會把最後兩格底線折到下一行變成孤兒。
   電話改成自己一行。跟地址同一個教訓：**留白欄位不要跟別人擠一行**。 */
ok('★★ 電話欄自己一行（擠在姓名那行會折行）',
   api.JOB_CONTRACTS.filter(c=>/\n電話：＿/.test(c.body)).length===6,
   api.JOB_CONTRACTS.filter(c=>!/\n電話：＿/.test(c.body)).map(c=>c.id));
ok('★★ 姓名那一行只剩姓名與身分證字號',
   api.JOB_CONTRACTS.every(c=>!/　電話：/.test(c.body)));

console.log('\n⑦ 公司地址與管轄法院（2026-10-16 使用者給的，不該每次手寫）');
/* ⚠ 新莊區屬臺灣新北地方法院。士林地院在新北只管石門、八里、淡水、三芝、汐止 ——
   別因為「離士林比較近」就改過去，管轄是看行政區不是看距離。 */
const ADDR='新北市新莊區後港一路28巷3弄2號1樓';
ok('★★★ 六份有甲方地址的都填好了（主管職附約沒有地址欄）',
   api.JOB_CONTRACTS.filter(c=>c.body.indexOf('\n地址：')>=0).length===6
   && api.JOB_CONTRACTS.filter(c=>c.body.indexOf('\n地址：'+ADDR)>=0).length===6);
ok('★★★ 地址與 BIZ_INFO 同一個（發票／出席證明也是用它）',
   src.indexOf("addr:'"+ADDR+"'")>=0);
/* 五份契約寫管轄法院；主管職是附約（依主契約）、離職單是表單，兩份沒有。 */
ok('★★★ 管轄法院五份都填臺灣新北地方法院（主管職附約與離職單除外）',
   api.JOB_CONTRACTS.filter(c=>c.body.indexOf('臺灣新北地方法院')>=0).length===5,
   api.JOB_CONTRACTS.filter(c=>c.body.indexOf('臺灣新北地方法院')<0).map(c=>c.id));
ok('★★★ 沒有留下「＿＿ 地方法院」的空格',
   api.JOB_CONTRACTS.every(c=>!/＿+\s*地方法院/.test(c.body)));
/* ⚠⚠ 這兩格是乙方自己要寫的，填掉就不能用了。
   第一次改就撞到：「地址：＿」是「戶籍地址：＿」的子字串，差點把員工那兩行一起填成公司地址。 */
ok('★★★ 乙方的戶籍／通訊地址仍然留白', (()=>{
  const f=byId('full'), pt=byId('part'), cp=byId('coop'), dk=byId('desk'), it=byId('intern');
  return [f,pt,dk,it].every(c=>c.body.indexOf('戶籍地址：＿')>=0)
      && cp.body.indexOf('通訊地址：＿')>=0
      && [f,pt,cp,dk,it].every(c=>c.body.indexOf('戶籍地址：'+ADDR)<0
                                && c.body.indexOf('通訊地址：'+ADDR)<0);
})());
ok('★★ 上班地點也填了地址（正職教練／正職櫃檯／兼職／工讀）',
   api.JOB_CONTRACTS.filter(c=>c.body.indexOf('上班地點：公司場館（'+ADDR+'）')>=0).length===4,
   api.JOB_CONTRACTS.filter(c=>c.body.indexOf('上班地點：公司場館（'+ADDR+'）')<0).map(c=>c.id));


/* ══ 正職第一階課費（2026-10-16 使用者：「正職第一階段應該要改成600」）══════════
   程式裡寫死 625、正式庫設定 600。實際算薪吃的是資料庫那一份（載入時覆寫預設），
   所以沒有人領錯錢 —— 但預設值與實際不符是陷阱：資料庫那列被刪、或新環境沒種子，
   就會靜悄悄用 625 算薪，而且不會有任何錯誤訊息。
   ⚠ 四個地方都要是 600：SALARY_TPL_DEFAULT、兩處「沒設定時的預設級距」、說明文字的舉例。
     只改第一個，員工編輯畫面新增級距時還是會冒出 625。 */
console.log('\n⑧ 正職第一階課費＝600（程式預設要與正式庫一致）');
ok('★★★ 全檔沒有殘留 625 的級距費率', !/rate:\s*625/.test(src), (src.match(/.{40}rate:\s*625.{20}/g)||[]));
ok('★★★ 說明文字的舉例也是 600（不然員工看到的跟實際不一樣）',
   src.indexOf('例：1-59 堂每堂 600 元')>=0 && src.indexOf('例：1-59 堂每堂 625 元')<0);
ok('★★★ SALARY_TPL_DEFAULT 的第一階是 600',
   /\{min:1,\s*max:59,\s*rate:600\}/.test(src.replace(/\s+/g,m=>m.includes('\n')?'\n':' ')));
ok('★★ 兩處「沒設定時的預設級距」都是 600',
   (src.match(/cfg\.pt_tiers:\[\{min:1,max:59,rate:600\}\]/g)||[]).length===2);
/* 契約寫的也要是 600 —— 這是同一個數字的兩個出口，分開改一定會歪 */
ok('★★★ 正職教練契約第一階也是 600（與程式同一個數字）',
   byId('full').body.indexOf('第 1～59 堂，每堂 600 元')>=0);

/* ══ 重點摘要（2026-10-16 使用者：「合約內容會不會有點多　對於我們這些有閱讀障礙的
   孩子　可以做個精簡建議嗎」→ 採方案 B：條文不動，前面加一頁白話摘要）══════════
   ⚠ 摘要與條文是同一件事的兩個出口 —— 改條文沒回頭改摘要，兩邊就會講不一樣的話，
     而且員工只會看摘要。下面幾條就是盯這個。 */
/* ⚠ 2026-10-18 使用者：「契約裡面有一些看似善意的提醒　其實會讓看的人不太舒服
   可以不要過多解釋」。拿掉的是叮嚀，不是事實：
     「簽之前要確定」「確認無誤再簽」「沒上課就沒有錢」
     「班表不固定、還在念書，一樣要保」「公司請你走不能用這張」
     「（建議約定：…）」「公司建議你投保」
   ⚠ 法律上有效果的句子一句都沒動 —— 例如離職單第二條 3 的「我知道拿不到資遣費」，
     那是**本人聲明**，和摘要裡的叮嚀是兩件事，不可以一起拿掉。 */
console.log('\n⑧b 不要過多解釋');
{
  const all=api.JOB_CONTRACTS.map(c=>c.body+JSON.stringify(c.sum)).join('\n');
  const nag=['簽之前要確定','確認無誤再簽','建議約定','公司建議你',
             '沒上課就沒有錢','還在念書，一樣要保','公司請你走不能用這張',
             '這幾項要老闆同意','排定後要準時到'];
  nag.forEach(x=>ok('★★★ 不再出現「'+x+'」', all.indexOf(x)<0));
}
ok('★★★ 但本人聲明還在（那是法律效果，不是叮嚀）',
   byId('quit').body.indexOf('我知道沒有資遣費，也不能請領失業給付')>=0);
ok('★★★ 合作教練「不適用勞基法」也還在', byId('coop').body.indexOf('不適用勞動基準法')>=0);
ok('★★ 責任劃分沒被一起拿掉',
   byId('coop').body.indexOf('由教練全權負責')>=0);

console.log('\n⑨ 重點摘要');
const SUMAPI=new Function('c','forPrint', src.slice(src.indexOf('function jobCtSumHTML('),
  (function(){ const a=src.indexOf('function jobCtSumHTML('); let d=0,b=src.indexOf('{',a);
    for(;b<src.length;b++){ if(src[b]==='{')d++; else if(src[b]==='}'){d--; if(!d)return b+1;} } })())
  +'\nreturn jobCtSumHTML(c,forPrint);');

/* ⚠ 1018 使用者把離職單摘要刪到剩三列（「之後要合作」「簽了之後」都拿掉）。
   條文都還在 —— 沒有資遣費那一句是第二條 3 的**本人聲明**，摘要只是導讀。
   所以下限一路降到 3 列。 */
ok('★★★ 七份都有摘要', api.JOB_CONTRACTS.every(c=>Array.isArray(c.sum)&&c.sum.length>=3),
   api.JOB_CONTRACTS.map(c=>(c.sum||[]).length));
/* 摘要可以短，但條文裡那句代價一定要在 —— 簽的人必須知道。 */
ok('★★★ 離職單條文仍寫明沒有資遣費、不能領失業給付',
   byId('quit').body.indexOf('我知道沒有資遣費，也不能請領失業給付')>=0);
/* ⚠ 1018 使用者：承攬那份「移除左邊的標題　只留下右邊的說明」。
   所以標籤可以是空的，內容不行 —— 空內容才是漏寫。 */
ok('★★★ 每一列都有內容', api.JOB_CONTRACTS.every(c=>c.sum.every(r=>r[1])));
ok('★★★ 沒有標籤的那一列會橫跨兩欄（不留空格子）',
   /\(r\[0\]\?'<div class="ct-sum-k">'\+r\[0\]\+'<\/div>':''\)/.test(src)
   && /grid-column:1\/-1;/.test(src));
/* 讀不完才是原始問題 —— 摘要超過 400 字就失去意義了 */
ok('★★★ 摘要夠短（每份純文字 400 字以內）', api.JOB_CONTRACTS.every(c=>{
  const n=c.sum.map(r=>r.join('')).join('').replace(/<[^>]+>/g,'').replace(/\s/g,'').length;
  return n<=400;
}), api.JOB_CONTRACTS.map(c=>c.sum.map(r=>r.join('')).join('').replace(/<[^>]+>/g,'').replace(/\s/g,'').length));
ok('★★ 用白話標籤，不要法律用語', (()=>{
  const bad=['工資之議定','特別休假','勞工保險','契約之終止','報酬與給付'];
  return api.JOB_CONTRACTS.every(c=>c.sum.every(r=>!bad.includes(r[0])));
})());

/* 摘要講的數字要跟條文一致 —— 這是最容易走鐘的地方 */
ok('★★★ 正職教練摘要的底薪與條文一致（29,500）',
   byId('full').sum.some(r=>r[1].indexOf('29,500')>=0) && full.body.indexOf('29,500')>=0);
ok('★★★ 兼職摘要的課費與條文一致（600／堂）',
   byId('part').sum.some(r=>r[1].indexOf('600')>=0) && part.body.indexOf('每堂 600 元')>=0);
ok('★★★ 主管摘要的津貼與條文一致（3,000）',
   byId('mgr').sum.some(r=>r[1].indexOf('3,000')>=0) && mgr.body.indexOf('3,000 元')>=0);
ok('★★★ 櫃檯摘要要講「值班含在月薪」（與 duty_hourly=0 一致）',
   byId('desk').sum.some(r=>(r[1]+(r[2]||'')).indexOf('值班已含在月薪裡')>=0));
/* 合作教練的摘要最重要：對方第一眼就要知道這不是員工 */
ok('★★★ 承攬摘要第一列就講明不是僱傭',
   byId('coop').sum[0][1].indexOf('平等互惠的合作關係')>=0
   && byId('coop').sum[0][1].indexOf('不適用勞基法')>=0);
ok('★★★ 承攬摘要要講沒有勞保勞退',
   byId('coop').sum.some(r=>r[1].indexOf('不保勞保')>=0 && r[1].indexOf('不提繳勞退')>=0));
/* 原本寫成「不可出現值班義務」的反面斷言，結果命中自己那句「沒有值班義務」
   （見 yugym-assert-hits-comment 的同一類錯）。改成正面斷言：要講「沒有」。 */
ok('★★★ 合作教練摘要：沒有底薪、沒有值班義務', (()=>{
  const t=byId('coop').sum.map(r=>r[1]+(r[2]||'')).join('');
  return t.indexOf('沒有底薪')>=0 && t.indexOf('沒有值班義務')>=0 && t.indexOf('保障底薪')<0;
})());

/* 摘要不是契約 —— 一定要有這句，不然它會被當成約定內容 */
ok('★★★ 每一份產出的摘要都寫明「以條文為準」', api.JOB_CONTRACTS.every(c=>{
  const h=SUMAPI(c,false);
  return h.indexOf('以後面的條文為準')>=0 && h.indexOf('簽名請簽在最後一頁')>=0;
}));
ok('★★ 列印版多一個分頁 class（條文從第 2 頁開始）',
   SUMAPI(byId('full'),true).indexOf('ct-sum-page')>=0
   && SUMAPI(byId('full'),false).indexOf('ct-sum-page')<0);
ok('★★ 沒有 sum 的契約不會爆（回空字串）', SUMAPI({tag:'x'},false)==='');
/* .ctr-a4 整塊是 pre-wrap，摘要自己要關掉，不然 grid 的換行會變成空白 */
ok('★★★ 摘要有關掉 pre-wrap', /\.ct-sum\{white-space:normal;/.test(src));
/* 1016 踩過：container-type 掛到 .ctr-a4 會讓 794px 的紙縮成一條 */
ok('★★★ container-type 掛在 .ct-sum 不是 .ctr-a4',
   /\.ct-sum\{[^}]*container-type:inline-size/.test(src)
   && !/\.ctr-a4\{container-type/.test(src));
ok('★★ 彈窗與列印都接上了摘要',
   /openJobContractView[\s\S]{0,500}jobCtSumHTML\(c,false\)/.test(src)
   && /openJobContractPrint[\s\S]{0,500}jobCtSumHTML\(c,true\)/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
