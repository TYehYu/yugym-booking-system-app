'''Run repo tests against this worktree without changing HOME or losing relative require resolution.'''
from pathlib import Path
import subprocess,json
root=Path(__file__).resolve().parents[3]
names=[r['test'] for r in json.loads((root/'docs/purchase-hardening/related_results.json').read_text())]+['invoicerecoverytest','installmentpaydisplaytest']
bootstrap=r'''
const fs=require('fs'),Module=require('module'),path=require('path');const root=process.argv[1],test=process.argv[2],old=Module._extensions['.js'];
Module._extensions['.js']=function(m,file){if(file.startsWith(path.join(root,'tests')+path.sep)){let s=fs.readFileSync(file,'utf8');s=s.replace(/process\.env\.HOME\s*\+\s*(['"])\/Projects\/yugym-booking-system-app([^'"]*)\1/g,(_,q,tail)=>JSON.stringify(root+tail));return m._compile(s,file)}return old(m,file)};require(path.join(root,'tests',test+'.js'));
'''
results=[]
for n in names:
 r=subprocess.run(['node','-e',bootstrap,str(root),n],capture_output=True,text=True);results.append({'test':n,'exit':r.returncode,'output':r.stdout+r.stderr})
p=Path(__file__).resolve().parent/'related_results.json';p.write_text(json.dumps(results,ensure_ascii=False,indent=2));print('Files:',len(results),'Failures:',[r['test'] for r in results if r['exit']])
