/* 會員端「我的票券」實跑一次（2026-09-29 事故後補）

   事故：v260928.1331 推上線後客戶回報「我的票券讀取不到　客人要簽約沒有畫面」。
   原因：0926 加同行票券卡時，`const card=(t,dim)` 沒有跟著改成 `(t,dim,pt)`
   （改動腳本中途 assert 失敗，只寫進了函式**內部**用到 pt 的那幾段），
   於是 pt 是未宣告的變數 → ReferenceError → 整頁畫不出來，
   待簽合約卡、票券、等級卡全部跟著消失。

   ⚠⚠ 為什麼原本的測試抓不到：memtnpartnertest 只用正則比對字串，
     「函式簽名少一個參數」在字串上完全看不出來。
     這一支改成**把整支 renderMemTickets 抓出來實跑**，跑得完才算過。

   ⚠ 這一頁是會員唯一看得到票券與合約的地方，壞掉等於客人什麼都看不到 ——
     日後再動它，這一支要先綠。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const TODAY=new Date(2026,8,29);
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const escH=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const diffDays=(a,b)=>Math.round((parseYmd(a)-parseYmd(b))/86400000);

const TYPES={'tt-pt':{id:'tt-pt',name:'教練課',category:'私人教練',color:'pt'}};
const MINE={id:'T1',member_id:'ME',ticket_type_id:'tt-pt',plan_name:'教練課 12 堂',format:'1V2',
  sessions_total:12,sessions_remaining:7,purchase_date:'2026-06-01',start_date:'2026-06-01',
  expire_date:'2026-12-31',status:'usable',source:'sale'};
/* 同行票：別人的票，我（ME）在 partners 的**值**那一側 */
const PTK=Object.assign({},MINE,{id:'T9',member_id:'OTHER',partners:{OTHER:'ME'},_ptWho:'OTHER',
  sessions_remaining:5});

function run(opts){
  const el={innerHTML:''};
  const g={
    /* C 是全域那一個 #content（index.html 19349 行），不是這支函式的區域變數 */
    C:el,
    document:{getElementById:()=>el, querySelector:()=>null, querySelectorAll:()=>[]},
    window:{_ptNames:{OTHER:'林大明'},_mcOpen:{},_ctByTicket:{},_ctSignByTicket:{},_ctInstSignByTicket:{},
            _memContracts:opts.contracts||[], _mtkTab:'pt', _allTkCache:[]},
    SESSION:{id:'ME',role:'member'},
    TODAY, ymd, parseYmd, escH, diffDays,
    _mcOpen:{},
    /* 這一頁用到的外部小工具都給替身；它們各自有自己的測試守著 */
    tkUnlimited:()=>false, tkNoTag:()=>'', fmtExpire:(d)=>String(d||'—'),
    srcLabel:()=>'銷售', lottoRuleNote:()=>'', tkExtLineHTML:()=>'', tkExtBadge:()=>'',
    ticketTokens:()=>'<span class="mtk"></span>', tkVisual:()=>({accent:'#000'}),
    isSelfPtTicket:()=>false, mtkKindOf:()=>'pt', memh2On:()=>opts.v2!==false,
    memTierBlock:()=>'<div class="tier"></div>', memTierBlockV2:()=>'<div class="tier2"></div>',
    memCreditEntryHTML:()=>'', memContractEntryHTML:()=>'', selfPtEntryHTML:()=>'', voucherEntryHTML:()=>'',
    isRealAdmin:()=>false, MTK_TABS:[['pt','教練課']],
    escH2:escH,
  };
  g.window.escH=escH;
  const code=grab('renderMemTickets');
  /* _memTkData 是模組層的變數，這裡用同名區域變數承接 */
  const wrapped=new Function(...Object.keys(g),'DATA',
    'let _memTkData=DATA;\n'+code+'\nreturn renderMemTickets;')(...Object.values(g), opts.data);
  wrapped();
  return el.innerHTML;
}

const WAL={of:id=>({stamps:[],used:5,state:'active',no:''}), noOf:()=>'', tickets:[MINE]};
const DATA={mine:[MINE],typeMap:TYPES,logs:[],WAL,partnerTks:[],bookings:[],tier:null,credit:0};

console.log('① 整頁畫得出來（事故當天壞的就是這一條）');
{
  let html='',err='';
  try{ html=run({data:DATA}); }catch(e){ err=(e&&e.message)||String(e); }
  ok('★★★ 不拋錯（card 少一個參數就會在這裡爆 ReferenceError）', !err, err);
  ok('★★★ 自己的票畫得出來', /mck-card/.test(html), html.slice(0,120));
}

console.log('\n② 有同行票時也畫得出來');
{
  let html='',err='';
  try{ html=run({data:Object.assign({},DATA,{partnerTks:[PTK]})}); }catch(e){ err=(e&&e.message)||String(e); }
  ok('★★★ 不拋錯', !err, err);
  ok('★★★ 多一區「同行的課程」', /同行的課程/.test(html));
  ok('★★★ 同行那張帶浮水印與說明', /class="tkwm"/.test(html) && /不會扣你的堂數/.test(html));
  ok('★★★ 名字寫得出來（fn_partner_names 給的）', /林大明/.test(html));
}

console.log('\n③ 待簽合約卡（事故時一起不見的那一塊）');
{
  let html='',err='';
  try{ html=run({data:DATA, contracts:[{id:'CT1',sign_type:'remote',ticket_id:null,plan_name:'教練課 12 堂',sessions:12,amount:24000}]}); }
  catch(e){ err=(e&&e.message)||String(e); }
  ok('★★★ 不拋錯', !err, err);
  ok('★★★ 待簽合約卡畫得出來（客人才簽得了名）',
     /這份合約還沒簽名/.test(html) && /memSignContract\('CT1'\)/.test(html));
}

console.log('\n④ 沒有票也要畫出空狀態，不是一片空白');
{
  let html='',err='';
  try{ html=run({data:Object.assign({},DATA,{mine:[],WAL:Object.assign({},WAL,{tickets:[]})})}); }
  catch(e){ err=(e&&e.message)||String(e); }
  ok('★★★ 不拋錯', !err, err);
  ok('★★ 寫「目前沒有票券」', /目前沒有票券/.test(html));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
