/* Execute the real mobile history loader, marker computation, and agenda entry.
   Cases use anonymous data shaped like the 2026-11-19 screenshot. No network/writes. */
const fs=require('fs'), vm=require('vm'), assert=require('assert');
const src=fs.readFileSync(process.env.TEST_INDEX||require('path').join(__dirname,'../index.html'),'utf8');
const helper=src.slice(src.indexOf('async function dbCalendarLastBkRows('),src.indexOf('async function _tkRowsIn('));
assert(helper.startsWith('async function dbCalendarLastBkRows('),'missing complete-history loader');
const marker=src.slice(src.indexOf('function tkRenewGroup('),src.indexOf('async function renderCalendar('));
const agendaStart=src.indexOf('async function renderCoachAgenda(');
const agendaEnd=src.slice(agendaStart+1).search(/\n(?:async )?function \w+\(/);
const agenda=src.slice(agendaStart,agendaStart+1+agendaEnd);
let pass=0;
function ok(name,condition){assert(condition,name);pass++;console.log('✓ '+name);}
const types={PT:{category:'私人教練',color:'pt'},GR:{category:'小班肌力',color:'group'}};
const T=(id,n=8,member='M')=>({id,member_id:member,ticket_type_id:'PT',sessions_total:n,sessions_remaining:0,status:'usable',purchase_date:'2026-11-01'});
const B=(id,tk,date)=>({id,ticket_id:tk,date,start_time:'18:00',status:'booked',category:'私人教練'});
function backend(rows,opt={}){
  const calls=[];
  const sb={from(table){assert.equal(table,'bookings');const f={};const q={
    select(fields,opts){assert.equal(opts.count,'exact');return q;},
    in(col,ids){f.ids=ids;return q;},gte(col,date){f.date=date;return q;},or(filter){f.filter=filter;return q;},
    order(col){assert.equal(col,'id');return q;},
    async range(from,to){calls.push({from,to,...f});if(opt.error)return {error:{message:'offline'}};
      let a=rows.filter(b=>f.ids?f.ids.includes(b.ticket_id):b.date>=f.date&&((b.member_ids||[]).some(id=>f.filter.includes(JSON.stringify(id)))||f.filter.includes('member_id.eq.'+JSON.stringify(b.member_id))));
      a=a.slice().sort((a,b)=>a.id.localeCompare(b.id));
      const count=opt.noCount?null:a.length+(opt.changed&&from>0?1:0);
      return {data:a.slice(from,to+1).slice(0,opt.cap||500),count};
    }
  };return q;}};return {sb,calls};
}
function env(rows,opt={}){
  const db=backend(rows,opt),window={};
  const e={window,sb:db.sb,dbFriendlyError:x=>new Error(x.message),tkClass5:()=>'',bkIsGroup:b=>b.category==='小班肌力',ymd:()=> '2026-11-19',TODAY:new Date('2026-11-19'),parseYmd:s=>new Date(s)};
  vm.createContext(e);vm.runInContext(marker+'\n'+helper,e);return {...e,calls:db.calls};
}
async function rejected(fn){try{await fn();return false;}catch{return true;}}
(async()=>{
  const tickets=[T('A'),T('B',10,'N'),T('C',12,'P')];
  const all=[B('a1','A','2026-11-19'),B('a2','A','2027-01-07'),B('b1','B','2026-11-19'),B('b2','B','2026-12-17'),B('c1','C','2026-11-19'),B('c2','C','2027-01-21')];
  const visible=all.filter(b=>b.date==='2026-11-19');
  let e=env(all);e.computeLastBkMarks(tickets,visible,types);
  ok('reproduce old window: all three today cards incorrectly marked',visible.every(b=>e.window._renewLastBk[b.id]));
  const loaded=await e.dbCalendarLastBkRows(tickets,visible,types);e.computeLastBkMarks(tickets,loaded,types);
  for(const b of visible)ok(b.ticket_id+': no early reminder today',!e.window._renewLastBk[b.id]);
  for(const id of ['a2','b2','c2'])ok(id+': real final class still marked',e.window._renewLastBk[id]);
  const big=Array.from({length:1203},(_,i)=>B('p'+String(i).padStart(4,'0'),'A',i===1202?'2027-01-07':'2026-11-19'));
  e=env(big);const pages=await e.dbCalendarLastBkRows([T('A',1203)],[big[0]],types);
  ok('1203 rows read, beyond API 1000-row limit',pages.length===1203&&e.calls.length===3);
  e.computeLastBkMarks([T('A',1203)],pages,types);ok('final class beyond first 1000 rows wins',e.window._renewLastBk.p1202&&!e.window._renewLastBk.p0000);
  for(const [name,opt] of [['network',{error:true}],['missing count',{noCount:true}],['server cap',{cap:100}],['changes during paging',{changed:true}]]){
    e=env(big,opt);ok(name+': refuses incomplete history',await rejected(()=>e.dbCalendarLastBkRows([T('A')],[big[0]],types)));
  }
  e=env([]);ok('empty history for visible booking is rejected',await rejected(()=>e.dbCalendarLastBkRows([T('A')],[visible[0]],types)));
  e=env([all[0]]);ok('one missing ticket in nonempty response rejected',await rejected(()=>e.dbCalendarLastBkRows(tickets,visible,types)));
  const other=T('A2',2);other.purchase_date=tickets[0].purchase_date;
  e=env([all[0],B('other','A2','2027-02-01')]);const cross=await e.dbCalendarLastBkRows([tickets[0],other],[all[0]],types);
  e.computeLastBkMarks([tickets[0],other],cross,types);ok('other same-category ticket later class included',e.window._renewDoneBk.a1&&!e.window._renewLastBk.a1);
  const groups=[{id:'g1',date:'2026-11-19',start_time:'19:30',status:'booked',category:'小班肌力',member_ids:['G1','G2']},{id:'g2',date:'2026-12-03',start_time:'19:30',status:'booked',category:'小班肌力',member_ids:['G1','G2']}];
  e=env(groups);const groupRows=await e.dbCalendarLastBkRows([],groups.slice(0,1),types);e.computeLastBkMarks([],groupRows,types);
  ok('group later classes loaded, not mistaken for final today',!e.window._renewLastBk.g1&&e.window._renewLastBk.g2);
  ok('group query restricted by participants and minimum date',e.calls[0].date==='2026-11-19'&&e.calls[0].filter.includes('member_ids.cs.'));
  const inst=T('I',8);inst.installment={};inst.unlocked_sessions=4;
  const ib=Array.from({length:8},(_,i)=>B('i'+i,'I','2026-12-'+String(i+1).padStart(2,'0')));
  e=env(ib);e.computeLastBkMarks([inst],await e.dbCalendarLastBkRows([inst],[ib[0]],types),types);
  ok('installment payment only at actual unlocked boundary',e.window._installLastBk.i3&&!e.window._installLastBk.i0);
  for(const mode of ['success','error','empty','stale']){
    e=env(mode==='empty'?[]:all,mode==='error'?{error:true}:{});
    e.window._renewLastBk={stale:true};e.window._installLastBk={stale:true};
    let computes=0;const compute=e.computeLastBkMarks;
    Object.assign(e,{SESSION:{id:'coach'},document:{getElementById:()=>({innerHTML:''})},performance:{now:()=>0},
      dbPeek:t=>({data:t==='member_tickets'?tickets:t==='ticket_types'?Object.values(types).map((t,i)=>({...t,id:['PT','GR'][i]})):[]}),
      dbGetAll:async()=>[],dbBookingsRange:async()=>visible,dbBookingsForCoach:async()=>[],_calDiag:()=>{},
      computeLastBkMarks(...args){computes++;compute(...args);e.window._cagAgendaGen=-1;}
    });
    if(mode==='stale'){const read=e.dbCalendarLastBkRows;e.dbCalendarLastBkRows=async(...args)=>{const r=await read(...args);e.window._cagAgendaGen=-1;return r;};}
    vm.createContext(e);vm.runInContext(agenda,e);await e.renderCoachAgenda();
    if(mode==='success')ok('real agenda uses full history',computes===1&&!e.window._renewLastBk.a1&&e.window._renewLastBk.a2);
    else if(mode==='stale')ok('outdated request cannot overwrite newer marks',computes===0&&e.window._renewLastBk.stale);
    else ok('real agenda '+mode+': clears previous marks, no narrow-window fallback',computes===1&&Object.keys(e.window._renewLastBk).length===0&&Object.keys(e.window._installLastBk).length===0);
  }
  console.log(pass+' passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
