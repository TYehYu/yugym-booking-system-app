/* 運動按摩的課別標籤〔按摩〕（2026-11-24）
   使用者：「本週日 9:30 王嘉綺是運動按摩，左上角的標籤幫我新增〔運動〕」，同日改名「運動改成按摩」。
   ・桌機行事曆標準卡第一列、手機週檢視、首頁任務卡／圓點：運動按摩補〔按摩〕
   ・體驗／場租／待安排的狀態標籤優先，照舊
   ・待簽約／待繳費：桌機課卡本來就不顯示標籤（靠紅框）→ 這種卡位的運動按摩改顯示〔按摩〕（王嘉綺 11/29 那筆就是待簽約卡位）
   ・只改顯示：bkTag／bkName 不動 → 家人使用的運動按摩仍顯示「王・媽媽」 */
const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)throw new Error('切不到 '+n);let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const ctx={window:{},bkIsOpenHold:b=>!!(b&&b.pending_contract&&!b.member_id&&!b.trial_name),bkIsInstHold:()=>false,
  bkIsMassage:b=>!!(b&&b.category==='運動按摩'),bkIsGroup:b=>b&&b.category==='小班肌力',bkPocketNow:()=>({key:''})};
vm.createContext(ctx);
vm.runInContext([grabFn('bkTag'),grabFn('bkTagAbbr'),grabFn('bkTagExtra'),grabFn('bkTagShow'),grabFn('bkName')].join('\n')
  +"\nconst BK_TAG_AB="+src.match(/const BK_TAG_AB=(\{[^}]*\});/)[1]+";\nglobalThis.BK_TAG_AB=BK_TAG_AB;",ctx);
const M=(o)=>Object.assign({id:'B',member_id:'M1',category:'運動按摩',status:'booked'},o||{});

console.log('① 標籤規則');
eq('★ 運動按摩（沒有狀態標籤）→ 〔按摩〕', ctx.bkTagShow(M()), '按摩');
eq('★ 王嘉綺那一筆的形狀（運動按摩、已預約、一般會員）→ 〔按摩〕', ctx.bkTagShow(M({date:'2026-11-29',start_time:'09:30',venue_unit:'group_1'})), '按摩');
eq('　　體驗 → 照舊〔體驗〕', ctx.bkTagShow(M({category:'體驗'})), '體驗');
eq('　　場租 → 照舊〔場租〕', ctx.bkTagShow(M({category:'場租'})), '場租');
eq('　　空堂（待安排）→ 照舊〔待安排〕，不被〔按摩〕蓋掉', ctx.bkTagShow(M({member_id:null,pending_contract:true})), '待安排');
eq('　　待簽約的運動按摩：bkTagShow 仍回〔待簽約〕（手機／首頁照舊）；桌機課卡另走 bkTagExtra 補〔按摩〕（見 ③）', ctx.bkTagShow(M({pending_contract:true})), '待簽約');
eq('★ 待簽約卡位的運動按摩（王嘉綺 11/29 實際資料的形狀）→ bkTagExtra 回〔按摩〕', ctx.bkTagExtra(M({pending_contract:true,ticket_id:null,contract_id:null})), '按摩');
eq('　　私人教練、團課、自主訓練 → 沒有標籤（不誤加）', [ctx.bkTagShow(M({category:'私人教練'})),ctx.bkTagShow(M({category:'小班肌力'})),ctx.bkTagShow(M({category:'自主訓練'}))], ['','','']);
eq('　　一字版：按', ctx.bkTagAbbr('按摩'), '按');

console.log('\n② 只改顯示，姓名邏輯不動');
eq('★ 運動按摩家人使用：bkTag 仍空 → 姓名仍是「王・媽媽」', ctx.bkName(M({trial_name:'媽媽'}),()=>'王'), '王・媽媽');
eq('　　bkTag 本身不回〔運動〕（避免 bkName 少顯示使用人）', ctx.bkTag(M()), '');

console.log('\n③ 畫面接線');
ok('★ 桌機行事曆標準卡第一列：沒有狀態標籤時補〔按摩〕；待簽約／待繳費（本來不顯示標籤）改顯示〔按摩〕', /\(\(_nameTag==='待簽約' \|\| _nameTag==='待繳費'\) \? bkTagExtra\(b\) : \(_nameTag\|\|bkTagExtra\(b\)\)\)/.test(src));
ok('★ 手機週檢視第二列標籤', /dispTag=bkTagShow\(b\);/.test(src));
ok('★ 首頁任務卡、首頁圓點', /const _tag = _isGrp \? '' : bkTagShow\(b\);/.test(src) && /const _lb2=_grpN2\?'':bkTagShow\(b\);/.test(src));
ok('★ bkTagExtra 用現成的 bkIsMassage（不新增散裝課別比較）', /function bkTagExtra\(b\)\{ return \(b && typeof bkIsMassage==='function' && bkIsMassage\(b\)\) \? '按摩' : ''; \}/.test(src));
console.log(fail?`\n✗ ${pass} 通過 / ${fail} 失敗`:`\n✓ ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
