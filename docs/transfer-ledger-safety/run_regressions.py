"""Run legacy tests against an explicit worktree without changing HOME."""
import json,subprocess,concurrent.futures
from pathlib import Path
P=Path(__file__).resolve().parents[2]
hook=Path('/private/tmp/yugym-transfer-test-path.cjs')
hook.write_text("const fs=require('fs');const original=fs.readFileSync;const path=require('path');const root=process.env.YUGYM_TEST_ROOT;const canonical=path.join(require('os').homedir(),'Projects/yugym-booking-system-app');fs.readFileSync=function(p,...args){if(typeof p==='string'&&(p===canonical||p.startsWith(canonical+'/')))p=root+p.slice(canonical.length);return original.call(this,p,...args);};")
tests=['p0cmoverpctest','bkmovetktest','tkmovetest','swaptktest','refundatomictest','cancelnettest','cancelbusytest','coachdeducttest','deskcancelrpctest','grpseatcancelrpctest','grpseatduptest','gtcapdroptest','holdsettletest','renewalholdtest','instholdtest','recurinstholdtest','bookinghealthtest','quotaguardtest','p0eactivationtest','transferledgersafetytest']
tests=[t for t in tests if (P/'tests'/(t+'.js')).exists()]
def run(t,root=P):
 import os
 env=dict(os.environ,YUGYM_TEST_ROOT=str(root))
 try:
  r=subprocess.run(['node','-r',str(hook),str(root/'tests'/(t+'.js'))],env=env,capture_output=True,text=True,timeout=45)
  return dict(test=t,exit=r.returncode,output=r.stdout+r.stderr)
 except subprocess.TimeoutExpired:return dict(test=t,exit=124,output='TIMEOUT')
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(run,tests))
(P/'docs/transfer-ledger-safety/REGRESSION_RESULTS.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
print(json.dumps({'files':len(rows),'passed':sum(r['exit']==0 for r in rows),'failures':[{'test':r['test'],'exit':r['exit'],'output':r['output'][-1500:]} for r in rows if r['exit']]},ensure_ascii=False))
