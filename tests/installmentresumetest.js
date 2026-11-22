const fs=require('fs'),path=require('path'),assert=require('assert');
const s=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const a=s.indexOf('const HS_ERR='),b=s.indexOf('function hsRefresh(',a);
const msg=new Function(s.slice(a,b)+';return hsMsg;')();
assert.match(msg({error_code:'INSTALLMENT_PAID_QUOTA_REQUIRED'}),/沒有已付款可用堂數/);
assert.match(msg({error_code:'INSTALLMENT_PAID_QUOTA_REQUIRED'}),/沒有扣堂或更動預約/);
assert.match(msg({error_code:'NOT_DESK'}),/櫃檯或管理員/);
assert.match(msg({error_code:'ANCHOR_NOT_ELIGIBLE'}),/沒有任何變動/);
console.log('4 passed, 0 failed');
