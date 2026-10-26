import sys,json
from playwright.sync_api import sync_playwright
html=sys.argv[1]; js=open(sys.argv[2]).read()
shot=sys.argv[3] if len(sys.argv)>3 else None
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1228/chrome-linux64/chrome',args=['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':1500,'height':900})
    errs=[]
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)[:300]))
    pg.on('console',lambda m: errs.append('C:'+m.text[:200]) if m.type=='error' else None)
    pg.goto('file://'+html); pg.wait_for_timeout(2500)
    try:
        r=pg.evaluate('async()=>{'+js+'}')
        print(json.dumps(r,indent=1,default=str)[:6000])
    except Exception as e: print('EVALERR',str(e)[:800])
    if shot: pg.screenshot(path=shot)
    print('ERRS',errs[:10])
    b.close()
