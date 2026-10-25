import json, os, time
from playwright.sync_api import sync_playwright
CHROME='/opt/pw-browsers/chromium-1228/chrome-linux64/chrome'
class B:
    def __init__(s,html,skin='classic',w=1500,h=900):
        s.pw=sync_playwright().start(); s.b=s.pw.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        s.errs=[]; s.pg=s.b.new_page(viewport={'width':w,'height':h}); s.pg.set_default_timeout(120000)
        s.pg.on('pageerror',lambda e:s.errs.append(str(e)[:300])); s.pg.add_init_script("try{localStorage.setItem('aakar.uiSkin','%s')}catch(e){}"%skin)
        s.pg.goto('file://'+html); s.pg.wait_for_timeout(5500); s.pg.evaluate("()=>document.querySelectorAll('.open').forEach(x=>x.classList.remove('open'))")
    def ev(s,js,arg=None): return s.pg.evaluate(js,arg) if arg is not None else s.pg.evaluate(js)
    def close(s): s.b.close(); s.pw.stop()
