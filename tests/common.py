from playwright.sync_api import sync_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--disable-gpu-sandbox']
EXE='/opt/pw-browsers/chromium-1228/chrome-linux64/chrome'
def open_app(p, html, hide_wheel=True, w=1500, h=900):
    b=p.chromium.launch(executable_path=EXE,args=ARGS)
    pg=b.new_page(viewport={'width':w,'height':h}); pg.errs=[]
    pg.on('pageerror',lambda e:pg.errs.append('PAGEERR '+str(e)[:300]))
    pg.on('console',lambda m: pg.errs.append('C:'+m.text[:200]) if m.type=='error' else None)
    pg.goto('file://'+html); pg.wait_for_timeout(2500)
    try: pg.get_by_role('button',name='Done').click(timeout=15000)
    except Exception as e: pass
    try: pg.wait_for_function("()=>!document.querySelector('#skPop.open, #skPop.on, #skPop .box:not([hidden])') || document.querySelector('#skPop').offsetParent===null",timeout=5000)
    except Exception as e: pass
    pg.wait_for_timeout(500)
    if hide_wheel: pg.evaluate("()=>{const n=document.querySelector('#nw'); if(n) n.style.display='none'}")
    return b,pg
def box_scene(pg, extra=''):
    pg.evaluate('''()=>{const P=PRISM,F=P.F,st=P.st; st.doc=F.newDoc(); P.regenerate(); P.commitFeature({type:'primitive',params:{kind:'box',w:80,d:50,h:30,pos:[0,0,0]}},true); const b=st.bodies[0]; st.sel={type:'body',bodyId:b.key,bodyIds:[b.key]}; P.fitView(); P.redraw(); '''+extra+'''}''')
def shot(pg, path):
    pg.screenshot(path=path, clip={'x':260,'y':134,'width':970,'height':690})
