from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
s=(root/'index.html').read_text();style=re.search(r'<style[^>]*>([\s\S]*?)</style>',s).group(1)
def grab(n):
 a=re.search(r'(?:async )?function '+n+r'\(',s).start();return s[a:s.index('\n}',a)+2]
names=['openInstallNext','instCtOfTicket','instTermsKey','instCollectTerms','instReadTerms','instTermsSummary','instCollectSync','inxFill','inxVoucherCalc']
code='\n'.join(grab(n) for n in names)
prefix=Path(__file__).with_name('preview_stubs.js').read_text()
out=Path('/private/tmp/yugym-install-ui');out.mkdir(exist_ok=True)
html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>分期收費補強・唯讀預覽</title><style>'+style+'''\nbody{margin:0;background:#ece9e2;padding:16px;box-sizing:border-box}#preview{background:var(--card,#faf7ef);max-width:560px;margin:0 auto;padding:22px;border-radius:18px;box-sizing:border-box}#note{max-width:560px;margin:0 auto 12px;color:#725315;font-size:13px}label{line-height:1.5}@media(max-width:440px){body{padding:8px}#preview{padding:16px}.modal-foot{position:static}}
</style><div id="note">唯讀預覽・假資料・不會收款</div><main id="preview"></main><script>'''+prefix+code+"\nopenInstallNext('DEMO');</script>"
(out/'index.html').write_text(html)
print(out/'index.html')
