/* 場租買了票還是不能轉正（2026-10-06 使用者：「曹子安剛剛有儲值場租　這邊為什麼不能轉正
   害我儲了兩次」）。

   正式庫實況：BK-muwdeugjutoi（10/09 13:00 子安阿嬤）pending_contract=true、
   ticket_type_id=null；曹子安在 17:47 與 17:48 連買兩張 $200 場租票（TK-muwhwmjwkdjd、
   TK-muwhxm976fb9），課卡卻一直只給〔儲值〕。

   成因：場租建立時只有「當下用票折抵」那條會寫 ticket_type_id，現場收費／先卡位寫 null。
   課卡用 listUsableTickets(…, b.ticket_type_id, …) 判斷有沒有票，type_id 是 null 時
   bkTicketTypeOk 要求 t.ticket_type_id===null → 場租票（tt-venue-rental）永遠對不上
   → _hasTk 永遠 false → 只畫〔儲值〕，買幾張都一樣。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i));};

const {bkTypeIdOf}=new Function(g('function bkTypeIdOf(b){','\n}')+'\n}\nreturn {bkTypeIdOf};')();

console.log('① bkTypeIdOf：場租把票種補回來');
ok('★★★ 場租沒寫票種 → 補成 tt-venue-rental',
   bkTypeIdOf({category:'場租', ticket_type_id:null})==='tt-venue-rental');
ok('★★★ 寫了就照用（當下用票折抵那條路）',
   bkTypeIdOf({category:'場租', ticket_type_id:'tt-venue-rental'})==='tt-venue-rental');
/* 其他課種建立時就選了票種，不要替它們亂猜 */
ok('★★★ 其他課種不補（沒有就是沒有）',
   bkTypeIdOf({category:'私人教練', ticket_type_id:null})===null
   && bkTypeIdOf({category:'自主訓練', ticket_type_id:null})===null);
ok('★★ 空值不會炸', bkTypeIdOf(null)===null && bkTypeIdOf(undefined)===null);

console.log('\n② 三條會比對票種的路都改用它');
ok('★★★ 課卡判斷「有沒有票」（決定要畫〔轉正〕還是〔儲值〕）',
   /_hasTk=\(\(await listUsableTickets\(b\.member_id, bkTypeIdOf\(b\), b\.date, b\.start_time\)\)\|\|\[\]\)\.length>0;/.test(src));
ok('★★★ 轉正時挑票', /let cand=await listUsableTickets\(memberId,bkTypeIdOf\(b\),b\.date,b\.start_time\);/.test(src));
ok('★★ 分期保留的候選與「為什麼沒票」的說明也同一套',
   /&& bkTicketTypeOk\(t, bkTypeIdOf\(b\)\)/.test(src)
   && /\.find\(x=>x\.id===bkTypeIdOf\(b\)\);/.test(src));

console.log('\n③ 新建的場租一律寫上票種');
ok('★★★ 不再是「有折抵才寫」', /coach_id:emp,ticket_id:frTkId,ticket_type_id:'tt-venue-rental',category:'場租',format:null,/.test(src)
   && !/ticket_type_id:frTkId\?'tt-venue-rental':null/.test(src));
/* ⚠ 既有資料不動：線上已經有一批 ticket_type_id 是 null 的場租，靠 bkTypeIdOf 接住 */
ok('★★ 沒有為了這件事去改既有資料（helper 看 category，不是改表）',
   /b\.ticket_type_id \|\| \(b\.category==='場租' \? 'tt-venue-rental' : null\)/.test(src));

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
