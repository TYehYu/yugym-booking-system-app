/* 課卡顯示層（2026-07-31 重構）

   使用者：「所以首頁課卡應該要從行事曆這邊抓資料連動 不要自己再開一個路徑」

   四個畫課卡的地方原本各寫各的（桌機行事曆／手機週檢視／首頁任務卡／首頁圓點），
   同一條規則要改四次，一天之內被咬兩次 ——
   行事曆補好「體驗顯示客戶姓名」「全員請假蓋假章」，首頁那兩處都沒跟到。

   抽出 bkName／bkTag／bkNameFull／bkStampKind：只回「要顯示什麼」，
   不決定「長什麼樣」，版面仍由各畫面自己排。 */
const fs=require('fs');
/* 2026-07-31：「是不是團課」抽成共用的 bkIsGroup（見 TK_POCKETS.group）——
   沙箱裡給一個等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.bkIsSelf=b=>!!(b&&b.category==='自主訓練');
globalThis.bkIsMassage=b=>!!(b&&b.category==='運動按摩');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

/* 2026-08-04「綁定會員」上線後：pending＋member 不再必然是待繳費，改由 bkIsInstHold
   （分期備註標記）判別 —— 一併注入真的 bkIsInstHold 實跑。 */
const api=new Function('grpAllOnLeave','grpAllDone',
  g('function bkIsInstHold(b){','\n}\n')+'\n'
  +g('function bkTag(b){','\n}\n')+'\n'+g('function bkName(b, nameOf){','\n}\n')+'\n'
  +g('function bkNameFull(b, nameOf){','\n}\n')+'\n'+g('function bkStampKind(b){','\n}\n')
  +'\nreturn {bkTag,bkName,bkNameFull,bkStampKind};')(b=>!!(b&&b._allLeave), b=>!!(b&&b._allDone));

const NAMES={M1:'林小明', M2:'王大華'};
const nameOf=id=>NAMES[id]||'';

console.log('標籤 bkTag');
eq('★ 待簽約（沒綁會員）', api.bkTag({pending_contract:true}), '待簽約');
eq('★ 待繳費（分期保留：有會員＋分期標記）', api.bkTag({pending_contract:true,member_id:'M1',note:'分期待繳費保留（收款後自動補扣）'}), '待繳費');
eq('★ 純綁定會員（無分期標記）仍是待簽約', api.bkTag({pending_contract:true,member_id:'M1'}), '待簽約');
eq('★ 體驗', api.bkTag({category:'體驗'}), '體驗');
eq('★ 場租', api.bkTag({category:'場租'}), '場租');
eq('　　一般教練課沒有標籤', api.bkTag({category:'私人教練',member_id:'M1'}), '');
eq('　　自主訓練沒有標籤', api.bkTag({category:'自主訓練',member_id:'M1'}), '');
eq('　　null 不會爆', api.bkTag(null), '');
ok('★ 待簽約的判斷排在體驗前面（體驗課也可能待簽約）',
   api.bkTag({category:'體驗',pending_contract:true})==='待簽約');

console.log('\n姓名 bkName');
eq('★ 有會員 → 會員名', api.bkName({member_id:'M1'}, nameOf), '林小明');
eq('★ 體驗（沒綁會員）→ 客戶名', api.bkName({category:'體驗',trial_name:'程凱郁'}, nameOf), '程凱郁');
eq('★ 待簽約 → 客戶名', api.bkName({pending_contract:true,trial_name:'陳先生'}, nameOf), '陳先生');
eq('★ 場租 → 使用人', api.bkName({category:'場租',trial_name:'魚大東'}, nameOf), '魚大東');
eq('　　體驗沒填名字 → 體驗客戶', api.bkName({category:'體驗'}, nameOf), '體驗客戶');
eq('　　場租沒填名字 → 場地租借', api.bkName({category:'場租'}, nameOf), '場地租借');
eq('　　待簽約沒填名字 → 客戶', api.bkName({pending_contract:true}, nameOf), '客戶');
eq('　　會員查不到名字 → —', api.bkName({member_id:'ZZ'}, nameOf), '—');
eq('　　什麼都沒有 → —', api.bkName({category:'自主訓練'}, nameOf), '—');
eq('　　null 不會爆', api.bkName(null, nameOf), '—');
eq('★ 已綁會員的待繳費仍顯示會員名，不是客戶名',
   api.bkName({member_id:'M1',pending_contract:true,trial_name:'不該用這個'}, nameOf), '林小明');

console.log('\n完整字串 bkNameFull（Hover 提示用）');
eq('★ 體驗', api.bkNameFull({category:'體驗',trial_name:'程凱郁'}, nameOf), '程凱郁（體驗）');
eq('★ 待繳費（分期保留）', api.bkNameFull({member_id:'M1',pending_contract:true,note:'分期待繳費保留（收款後自動補扣）'}, nameOf), '林小明（待繳費）');
eq('★ 純綁定 → （待簽約）', api.bkNameFull({member_id:'M1',pending_contract:true}, nameOf), '林小明（待簽約）');
eq('　　沒有標籤時不加括號', api.bkNameFull({member_id:'M2'}, nameOf), '王大華');

console.log('\n狀態章 bkStampKind（順序固定）');
eq('★ 取消優先於一切', api.bkStampKind({status:'cancelled',_allLeave:true}), 'cancel');
eq('★ 全員請假排在已簽到前面', api.bkStampKind({status:'booked',_allLeave:true}), 'leave');
eq('★ 已簽到', api.bkStampKind({status:'checked_in'}), 'done');
eq('★ 已完成也算已簽到', api.bkStampKind({status:'completed'}), 'done');
/* 2026-07-31 使用者回報：有些會員還沒簽到，簽到圓章就出現了 → 改成全部名額都處理完才蓋 */
eq('★ 團課要全部名額都處理完才算已簽到', api.bkStampKind({status:'checked_in',category:'小班肌力',_allDone:true}), 'done');
eq('★ 只有部分人簽到 → 不蓋章（整堂 status 已被寫成 checked_in 也一樣）',
   api.bkStampKind({status:'checked_in',category:'小班肌力',_allDone:false}), '');
eq('　　團課只有請假不算簽到', api.bkStampKind({status:'booked',category:'小班肌力',_allDone:false}), '');
eq('　　補簽', api.bkStampKind({status:'booked',makeup_granted:true}), 'makeup');
eq('　　還沒簽到 → 沒有章', api.bkStampKind({status:'booked'}), '');
eq('　　null 不會爆', api.bkStampKind(null), '');
ok('　　章的文字集中在一個表', /const BK_STAMP_TEXT=\{cancel:'刪', leave:'假', done:'簽', makeup:'!'\};/.test(src));

console.log('\n四個畫面都改用共用層');
ok('★ ① 桌機行事曆（四種情況都走同一支）',
   (src.match(/_nameBase=bkName\(b,id=>memMap\[id\]\); _nameTag=bkTag\(b\); memName=bkNameFull\(b,id=>memMap\[id\]\);/g)||[]).length===4);
ok('★ ② 手機週檢視', /else \{ disp=bkName\(b,id=>memMap\[id\]\); dispTag=bkTag\(b\); if\(disp==='—'\) disp='課程'; \}/.test(src));
/* 2026-08-01：人數改用共用的 grpHeadLabel（有人請假就標「會來的/報名的」） */
ok('★ ③ 首頁任務卡',
   /const nm = _isGrp \? grpHeadLabel\(b\) : bkName\(b,_nameOf\);/.test(src)
   && /const _tag = _isGrp \? '' : bkTag\(b\);/.test(src));
ok('★ ④ 首頁圓點',
   /const nm2=_grpN2\?grpHeadLabel\(b\):bkName\(b,_nameOf2\);/.test(src)
   && /const _lb2=_grpN2\?'':bkTag\(b\);/.test(src));
ok('★ 狀態章：手機週檢視、首頁任務卡、首頁圓點都吃 bkStampKind',
   (src.match(/bkStampKind\(b\)/g)||[]).length>=3);
ok('　　nameOf 由呼叫端傳（各畫面的 map 存法不同：有的存物件、有的存字串）',
   /const _nameOf=id=>memMap\[id\]\?memMap\[id\]\.name:'';/.test(src)
   && /bkName\(b,id=>memMap\[id\]\)/.test(src));
ok('　　團課主行維持各畫面自己處理（有的顯示人數、有的顯示到課人頭）',
   /團課的主行各畫面不同（有的顯示人數、有的顯示到課人頭），維持各自處理/.test(src));
ok('　　為什麼要抽出來，寫在程式裡',
   /2026-07-31 一天之內\s*\n\s*就被咬兩次/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
