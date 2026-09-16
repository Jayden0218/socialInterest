import pathlib, json
exec(pathlib.Path('_icons.py').read_text())
CSS = pathlib.Path('_shared.css').read_text()
FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap">'

def page(body, extra_css=''):
    return f'''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  {FONT}
  <style>
{CSS}{extra_css}
  </style>
</helmet>
{body}
</x-dc>
</body>
</html>
'''

I = ICONS
def ic(name, size=24, color=None):
    s = I[name].replace('width="24" height="24"', f'width="{size}" height="{size}"')
    return f'<span style="display:inline-flex;color:{color}">{s}</span>' if color else s

INTEREST = {'Birding':'#00798D','Ceramics':'#A04D39','Climbing':'#2D7B44','Cooking':'#A14B46',
 'Cycling':'#007C7D','Gardening':'#617214','Music':'#7458A1','Painting':'#964B78',
 'Photography':'#4866AB','Running':'#A04A53','Travel':'#0D70A4','Baking':'#9A541B'}

def nav(active='feed'):
    items=[('feed','home','Feed'),('discover','explore','Explore'),None,
           ('chats','chats','Chats'),('you','profile','You')]
    out=[]
    for it in items:
        if it is None:
            out.append(f'<div class="nav-item"><div class="compose">{ic("plus",22)}</div></div>')
            continue
        k,icon,label=it
        on=' on' if k==active else ''
        out.append(f'<div class="nav-item{on}">{ic(icon,23)}<span class="t-tab">{label}</span></div>')
    return f'<div class="nav">{"".join(out)}</div>'

def topbar(title, right=None, back=False):
    left = (f'<span style="display:flex;align-items:center;gap:10px">{ic("back",22)}'
            f'<span class="t-title">{title}</span></span>') if back else f'<span class="t-display">{title}</span>'
    r = right or ''
    return (f'<div style="flex:none;display:flex;align-items:center;justify-content:space-between;'
            f'padding:2px 16px 10px;min-height:44px">{left}'
            f'<span style="display:flex;gap:6px;color:var(--tx2)">{r}</span></div>')

def card(ph, h, title, interest, likes, comments):
    col = INTEREST[interest]
    return f'''<div style="background:var(--raised);border-radius:var(--r-card);overflow:hidden">
  <div class="ph {ph}" style="height:{h}px"></div>
  <div style="padding:9px 10px 11px;display:flex;flex-direction:column;gap:5px">
    <div class="t-label" style="color:var(--tx)">{title}</div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span class="t-small" style="color:{col};font-weight:600">{interest}</span>
      <span style="display:flex;align-items:center;gap:9px;color:var(--tx3)">
        <span style="display:flex;align-items:center;gap:3px">{ic("heart",13)}<span class="t-small">{likes}</span></span>
        <span style="display:flex;align-items:center;gap:3px">{ic("comment",13)}<span class="t-small">{comments}</span></span>
      </span>
    </div>
  </div>
</div>'''

# ─── 1. Home feed ────────────────────────────────────────────────────────────
tabs = '''<div style="flex:none;display:flex;gap:20px;padding:0 16px 12px;border-bottom:1px solid var(--hair)">
  <span class="t-body" style="font-weight:700;color:var(--tx);padding-bottom:9px;
    box-shadow:inset 0 -2px 0 var(--accent)">For you</span>
  <span class="t-body" style="font-weight:500;color:var(--tx3);padding-bottom:9px">Following</span>
</div>'''

L = [card('ph-1',196,'Goldcrest, finally still','Birding',34,6),
     card('ph-3',150,'Six hours of drizzle on the ridge','Climbing',88,12),
     card('ph-5',176,'第一次 sourdough that actually rose','Baking',51,9)]
R = [card('ph-2',150,'Trimming the foot, wet clay','Ceramics',62,4),
     card('ph-6',204,'Bass amp rebuilt from a parts bin','Music',27,3),
     card('ph-4',142,'Tomatoes, week eleven','Gardening',40,7)]

feed = f'''<div class="phone">
  <div class="safe-top"></div>
  {topbar('socialInterest', ic('search',22))}
  {tabs}
  <div class="scroll" style="padding:12px 16px">
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start">
      <div style="display:flex;flex-direction:column;gap:12px">{''.join(L)}</div>
      <div style="display:flex;flex-direction:column;gap:12px">{''.join(R)}</div>
    </div>
  </div>
  {nav('feed')}
</div>'''
pathlib.Path('Main.dc.html').write_text(page(feed))

# ─── 2. The icon set ─────────────────────────────────────────────────────────
order=['home','explore','plus','chats','activity','profile','heart','comment',
       'share','save','back','search','more','close','camera','check']
cells=''.join(f'''<div style="display:flex;flex-direction:column;align-items:center;gap:9px;
  background:var(--raised);border-radius:var(--r-card);padding:18px 8px">
  <span style="color:var(--tx)">{ic(n,26)}</span>
  <span class="t-small" style="color:var(--tx3)">{n}</span></div>''' for n in order)
icons_board = f'''<div style="width:880px;min-height:520px;background:var(--bg);padding:32px">
  <div class="t-display" style="margin-bottom:6px">One icon set</div>
  <div class="t-body" style="color:var(--tx2);max-width:560px;margin-bottom:6px">
    24px grid · 1.75 stroke · round caps and joins · currentColor. Every action and every
    destination draws from this set. Nothing in the product may stand in for an icon with a
    typographic character.</div>
  <div class="t-caption" style="color:var(--danger);margin-bottom:22px">
    Replaces: an 8&times;8 dot for each of five navigation destinations, and &hearts; for a reaction.</div>
  <div style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:12px">{cells}</div>
  <div style="display:flex;gap:26px;margin-top:26px;align-items:center">
    <span class="t-caption" style="color:var(--tx3)">Sizes in use</span>
    <span style="display:flex;align-items:end;gap:18px;color:var(--tx)">
      <span style="display:flex;flex-direction:column;align-items:center;gap:6px">{ic('heart',13)}<span class="t-small" style="color:var(--tx3)">13 · counts</span></span>
      <span style="display:flex;flex-direction:column;align-items:center;gap:6px">{ic('heart',20)}<span class="t-small" style="color:var(--tx3)">20 · actions</span></span>
      <span style="display:flex;flex-direction:column;align-items:center;gap:6px">{ic('heart',23)}<span class="t-small" style="color:var(--tx3)">23 · nav</span></span>
    </span>
  </div>
</div>'''
pathlib.Path('Icons.dc.html').write_text(page(icons_board))
print('Main.dc.html, Icons.dc.html')

# ─── 3. Card anatomy ─────────────────────────────────────────────────────────
def anno(t):
    return f'<div class="t-caption" style="color:var(--tx3);max-width:250px">{t}</div>'
before = f'''<div style="width:186px">
  <div class="t-caption" style="color:var(--danger);font-weight:700;margin-bottom:8px">NOW — 47% photograph</div>
  <div style="background:var(--raised);border-radius:var(--r-card);overflow:hidden">
    <div class="ph ph-1" style="height:118px"></div>
    <div style="padding:10px;display:flex;flex-direction:column;gap:7px;
      outline:1.5px dashed var(--danger);outline-offset:-4px">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="width:20px;height:20px;border-radius:999px;background:#7458A1"></div>
        <span class="t-small" style="color:var(--tx2)">discoverer</span>
        <span style="flex:1"></span><span class="t-small" style="color:var(--tx3)">&hearts; 0 &middot; 0</span>
      </div>
      <div class="t-label" style="color:#2D7B44">Analogue 784701</div>
    </div>
  </div>
</div>'''
after = f'''<div style="width:186px">
  <div class="t-caption" style="color:var(--accent);font-weight:700;margin-bottom:8px">AFTER — 78% photograph</div>
  {card('ph-1',196,'Goldcrest, finally still','Birding',34,6)}
</div>'''
anatomy = f'''<div style="width:720px;min-height:600px;background:var(--bg);padding:32px">
  <div class="t-display" style="margin-bottom:6px">The card is mostly chrome</div>
  <div class="t-body" style="color:var(--tx2);max-width:600px;margin-bottom:24px">
    On a product whose premise is photographs, the photograph is currently the minority of the
    card. The avatar and handle are the largest cut: they repeat down a two-column grid and say
    nothing a reader needs before tapping.</div>
  <div style="display:flex;gap:44px;align-items:start">
    {before}{after}
    <div style="display:flex;flex-direction:column;gap:14px;padding-top:26px;max-width:250px">
      {anno('<b>Avatar and handle removed.</b> Authorship belongs on post detail and on a profile, not on every tile in a grid.')}
      {anno('<b>Title first, two lines.</b> It is the only thing a reader needs to decide whether to tap.')}
      {anno('<b>Interest keeps its own hue</b> and stays a word, never a chip — the one rule the current build already gets right.')}
      {anno('<b>Counts get real icons</b> at 13px, replacing &hearts; and a middot.')}
    </div>
  </div>
</div>'''
pathlib.Path('CardAnatomy.dc.html').write_text(anatomy and page(anatomy))

# ─── 4. Explore ──────────────────────────────────────────────────────────────
def tile(name, ph2, posts):
    col=INTEREST[name]
    mos=''.join(f'<div class="ph {p}"></div>' for p in ph2)
    return f'''<div style="background:var(--raised);border-radius:var(--r-card);overflow:hidden">
  <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:44px 44px;gap:1px">{mos}</div>
  <div style="padding:9px 10px 11px;display:flex;flex-direction:column;gap:3px">
    <span class="t-label" style="color:{col}">{name}</span>
    <span class="t-small" style="color:var(--tx3)">{posts} posts</span>
  </div>
</div>'''
tiles=[tile('Birding',['ph-1','ph-5','ph-3','ph-2'],'1,204'),
       tile('Ceramics',['ph-2','ph-4','ph-6','ph-1'],'860'),
       tile('Climbing',['ph-3','ph-1','ph-5','ph-6'],'2,391'),
       tile('Gardening',['ph-5','ph-2','ph-1','ph-4'],'1,733'),
       tile('Music',['ph-6','ph-3','ph-2','ph-5'],'944'),
       tile('Travel',['ph-3','ph-6','ph-4','ph-1'],'4,117')]
explore=f'''<div class="phone">
  <div class="safe-top"></div>
  {topbar('Explore')}
  <div style="flex:none;padding:0 16px 12px">
    <div style="display:flex;align-items:center;gap:9px;background:var(--sunken);
      border-radius:var(--r-field);padding:10px 14px;color:var(--tx3)">
      {ic('search',18)}<span class="t-body" style="color:var(--tx3)">Interests, people, places</span>
    </div>
  </div>
  <div class="scroll" style="padding:0 16px">
    <div class="t-caption" style="color:var(--tx3);margin-bottom:10px">Busy this week</div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">{''.join(tiles)}</div>
  </div>
  {nav('discover')}
</div>'''
pathlib.Path('Explore.dc.html').write_text(page(explore))
print('CardAnatomy.dc.html, Explore.dc.html')

# ─── 5. Post detail ──────────────────────────────────────────────────────────
def act(icon,label):
    return (f'<span style="display:flex;align-items:center;gap:6px;color:var(--tx2);min-height:44px">'
            f'{ic(icon,20)}<span class="t-caption">{label}</span></span>')
def comment_row(initial,colr,who,text):
    return f'''<div style="display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--hair)">
  <div style="width:28px;height:28px;border-radius:999px;background:{colr};flex:none;
    display:flex;align-items:center;justify-content:center;color:#fff;font-size:11.5px;font-weight:700">{initial}</div>
  <div style="display:flex;flex-direction:column;gap:2px">
    <span class="t-caption" style="color:var(--tx)">{who}</span>
    <span class="t-body" style="color:var(--tx2)">{text}</span>
  </div></div>'''
detail=f'''<div class="phone">
  <div class="safe-top"></div>
  {topbar('Birding', ic('more',22), back=True)}
  <div class="scroll" style="overflow-y:hidden">
    <div class="ph ph-1" style="height:390px"></div>
    <div style="padding:14px 16px 0">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="width:34px;height:34px;border-radius:999px;background:#00798D;
          display:flex;align-items:center;justify-content:center;color:#fff;font-size:13.5px;font-weight:700">M</div>
        <div style="display:flex;flex-direction:column">
          <span class="t-caption" style="color:var(--tx)">mara</span>
          <span class="t-small" style="color:var(--tx3)">2 hours ago</span>
        </div>
        <span style="flex:1"></span>
        <span class="t-caption" style="color:var(--accent);font-weight:700;
          border:1.5px solid var(--accent);border-radius:var(--r-btn);padding:14px 16px">Follow</span>
      </div>
      <div class="t-body" style="color:var(--tx);margin-bottom:8px">
        Goldcrest, finally still. Fourth morning at the same hedge — they never stop moving,
        so this is mostly luck and a very cold hour.</div>
      <div class="t-caption" style="color:#00798D;font-weight:700;margin-bottom:12px">Birding</div>
      <div style="display:flex;gap:22px;border-top:1px solid var(--hair);padding-top:4px">
        {act('heart','34')}{act('comment','6')}{act('share','Share')}
        <span style="flex:1"></span>{act('save','')}
      </div>
      {comment_row('J','#617214','jonas','That light on the crown is worth the cold.')}
      {comment_row('P','#964B78','priya','Fourth morning is dedication. Lovely.')}
    </div>
  </div>
  {nav('feed')}
</div>'''
pathlib.Path('PostDetail.dc.html').write_text(page(detail))

# ─── 6. Profile ──────────────────────────────────────────────────────────────
grid=''.join(f'<div class="ph {p}" style="aspect-ratio:1"></div>'
             for p in ['ph-1','ph-3','ph-5','ph-2','ph-6','ph-4','ph-5','ph-1','ph-3'])
def stat(n,l):
    return (f'<div style="display:flex;flex-direction:column;align-items:center;gap:1px">'
            f'<span class="t-title">{n}</span><span class="t-small" style="color:var(--tx3)">{l}</span></div>')
profile=f'''<div class="phone">
  <div class="safe-top"></div>
  {topbar('@mara', ic('more',22))}
  <div class="scroll">
    <div style="padding:0 16px 14px">
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:12px">
        <div style="width:66px;height:66px;border-radius:999px;background:#00798D;flex:none;
          display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px;font-weight:700">M</div>
        <div style="display:flex;gap:26px;flex:1;justify-content:space-around">
          {stat('128','posts')}{stat('1,204','followers')}{stat('213','following')}
        </div>
      </div>
      <div class="t-label" style="margin-bottom:3px">Mara Oyelaran</div>
      <div class="t-body" style="color:var(--tx2);margin-bottom:12px">
        Cold mornings, small birds. Mostly hedgerows within a bus ride of home.</div>
      <div style="display:flex;gap:8px">
        <span class="t-caption" style="flex:1;text-align:center;color:var(--on-accent);background:var(--accent);
          border-radius:var(--r-btn);padding:14px 0;font-weight:700">Follow</span>
        <span class="t-caption" style="flex:1;text-align:center;color:var(--tx);border:1.5px solid var(--strong);
          border-radius:var(--r-btn);padding:14px 0;font-weight:700">Message</span>
      </div>
    </div>
    <div style="display:flex;gap:22px;padding:0 16px;border-bottom:1px solid var(--hair)">
      <span class="t-caption" style="font-weight:700;padding-bottom:9px;box-shadow:inset 0 -2px 0 var(--accent)">Posts</span>
      <span class="t-caption" style="color:var(--tx3);padding-bottom:9px">Interests</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px;margin-top:2px">{grid}</div>
  </div>
  {nav('you')}
</div>'''
pathlib.Path('Profile.dc.html').write_text(page(profile))
print('PostDetail.dc.html, Profile.dc.html')

# ─── 7. Compose ──────────────────────────────────────────────────────────────
slots=''.join(f'<div class="ph {p}" style="width:76px;height:76px;border-radius:10px;flex:none"></div>'
              for p in ['ph-1','ph-3'])
chips=''.join(f'''<span class="t-caption" style="color:{INTEREST[n]};font-weight:700;
  border:1.5px solid {"var(--accent)" if n=="Birding" else "var(--hair)"};border-radius:var(--r-btn);
  padding:14px 13px;white-space:nowrap">{n}</span>''' for n in ['Birding','Gardening','Travel','Climbing'])
compose=f'''<div class="phone">
  <div class="safe-top"></div>
  <div style="flex:none;display:flex;align-items:center;justify-content:space-between;padding:2px 16px 10px;min-height:44px">
    <span style="display:flex;align-items:center;gap:10px;color:var(--tx2)">{ic('close',22)}</span>
    <span class="t-title">New post</span>
    <span class="t-caption" style="color:var(--on-accent);background:var(--accent);border-radius:var(--r-btn);
      padding:14px 16px;font-weight:700">Publish</span>
  </div>
  <div class="scroll" style="padding:0 16px">
    <div style="display:flex;gap:9px;align-items:center;margin-bottom:18px">
      <div style="width:76px;height:76px;border-radius:10px;border:1.5px dashed var(--strong);flex:none;
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--tx3)">
        {ic('camera',22)}<span class="t-small">Add</span></div>
      {slots}
      <span class="t-small" style="color:var(--tx3);margin-left:2px">2 / 10</span>
    </div>
    <div class="t-caption" style="color:var(--tx3);margin-bottom:7px">Caption</div>
    <div class="t-body" style="color:var(--tx);background:var(--sunken);border-radius:var(--r-card);
      padding:13px 14px;min-height:92px;margin-bottom:20px">
      Goldcrest, finally still. Fourth morning at the same hedge.</div>
    <div class="t-caption" style="color:var(--tx3);margin-bottom:9px">
      Interest <span style="color:var(--danger)">&middot; required</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">{chips}</div>
    <div style="display:flex;align-items:center;gap:10px;color:var(--tx2);padding:13px 0;border-top:1px solid var(--hair)">
      {ic('search',20)}<span class="t-body" style="flex:1">Add a place</span>
      <span class="t-small" style="color:var(--tx3)">Optional</span></div>
  </div>
</div>'''
pathlib.Path('Compose.dc.html').write_text(page(compose))

# ─── 8. Activity and Chats ───────────────────────────────────────────────────
def act_row(icon,colr,txt,when,unread=False):
    dot='<span style="width:7px;height:7px;border-radius:999px;background:var(--accent);flex:none"></span>' if unread else ''
    return f'''<div style="display:flex;gap:12px;align-items:center;padding:13px 0;border-bottom:1px solid var(--hair)">
  <span style="color:{colr};flex:none">{ic(icon,20)}</span>
  <div style="flex:1;display:flex;flex-direction:column;gap:1px">
    <span class="t-body" style="color:var(--tx)">{txt}</span>
    <span class="t-small" style="color:var(--tx3)">{when}</span></div>{dot}</div>'''
activity=f'''<div class="phone">
  <div class="safe-top"></div>
  {topbar('Activity')}
  <div class="scroll" style="padding:0 16px">
    {act_row('heart','#C0392B','<b>jonas</b> and 4 others liked Goldcrest, finally still','2h',True)}
    {act_row('comment','#4866AB','<b>priya</b> commented: “Fourth morning is dedication.”','5h',True)}
    {act_row('profile','#1F6B3F','<b>tomas</b> started following you','Yesterday')}
    {act_row('heart','#C0392B','<b>saoirse</b> liked Tomatoes, week eleven','2 days')}
  </div>
  {nav('feed')}
</div>'''
pathlib.Path('Activity.dc.html').write_text(page(activity))

def chat_row(initial,colr,who,msg,when,unread=False):
    w='700' if unread else '500'
    dot=('<span style="width:8px;height:8px;border-radius:999px;background:var(--accent);flex:none"></span>'
         if unread else '')
    return f'''<div style="display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--hair)">
  <div style="width:44px;height:44px;border-radius:999px;background:{colr};flex:none;
    display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:700">{initial}</div>
  <div style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
      <span class="t-label" style="color:var(--tx)">{who}</span>
      <span class="t-small" style="color:var(--tx3);flex:none">{when}</span></div>
    <span class="t-caption" style="color:var(--tx2);font-weight:{w};overflow:hidden;
      text-overflow:ellipsis;white-space:nowrap">{msg}</span></div>{dot}</div>'''
chats=f'''<div class="phone">
  <div class="safe-top"></div>
  {topbar('Chats', ic('plus',22))}
  <div class="scroll" style="padding:0 16px">
    {chat_row('J','#617214','jonas','Is the hedge the one past the level crossing?','2h',True)}
    {chat_row('P','#964B78','priya','Sent you a post','Yesterday')}
    {chat_row('T','#0D70A4','Tuesday climbers','tomas: 6pm still works for me','Mon')}
    {chat_row('S','#A04D39','saoirse','Thank you! I will try the slower prove.','Sun')}
  </div>
  {nav('chats')}
</div>'''
pathlib.Path('Chats.dc.html').write_text(page(chats))
print('Compose.dc.html, Activity.dc.html, Chats.dc.html')

# ─── 9. States ───────────────────────────────────────────────────────────────
SK='background:var(--sunken);border-radius:6px'
def skel_card(h):
    return f'''<div style="background:var(--raised);border-radius:var(--r-card);overflow:hidden">
  <div style="height:{h}px;{SK};border-radius:0"></div>
  <div style="padding:9px 10px 11px;display:flex;flex-direction:column;gap:7px">
    <div style="height:11px;width:88%;{SK}"></div>
    <div style="height:11px;width:56%;{SK}"></div>
    <div style="display:flex;justify-content:space-between">
      <div style="height:9px;width:38%;{SK}"></div><div style="height:9px;width:22%;{SK}"></div></div>
  </div></div>'''
def mini(label, inner, tone='var(--tx3)'):
    return f'''<div style="display:flex;flex-direction:column;gap:10px">
  <div class="t-caption" style="color:{tone};font-weight:700">{label}</div>
  <div class="phone" style="height:560px;border:1px solid var(--hair);border-radius:18px;overflow:hidden">{inner}</div></div>'''
loading=f'''<div class="safe-top" style="height:20px"></div>{topbar('socialInterest', ic('search',22))}
  <div class="scroll" style="padding:12px 16px">
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start">
      <div style="display:flex;flex-direction:column;gap:12px">{skel_card(150)}{skel_card(120)}</div>
      <div style="display:flex;flex-direction:column;gap:12px">{skel_card(118)}{skel_card(152)}</div>
    </div></div>'''
empty=f'''<div class="safe-top" style="height:20px"></div>{topbar('socialInterest', ic('search',22))}
  <div class="scroll" style="display:flex;flex-direction:column;align-items:center;
    justify-content:center;text-align:center;padding:0 40px;gap:9px">
    <span style="color:var(--strong)">{ic('explore',40)}</span>
    <div class="t-title" style="margin-top:4px">Nothing here yet</div>
    <div class="t-body" style="color:var(--tx2)">Follow a few interests and your feed fills up.</div>
    <div class="t-caption" style="color:var(--on-accent);background:var(--accent);border-radius:var(--r-btn);
      padding:14px 20px;font-weight:700;margin-top:6px">Explore interests</div>
  </div>'''
failed=f'''<div class="safe-top" style="height:20px"></div>{topbar('socialInterest', ic('search',22))}
  <div class="scroll" style="display:flex;flex-direction:column;align-items:center;
    justify-content:center;text-align:center;padding:0 40px;gap:9px">
    <span style="color:var(--danger)">{ic('close',36)}</span>
    <div class="t-title" style="margin-top:4px">Could not load your feed</div>
    <div class="t-body" style="color:var(--tx2)">The server did not answer. Your connection may be down.</div>
    <div class="t-caption" style="color:var(--tx);border:1.5px solid var(--strong);border-radius:var(--r-btn);
      padding:14px 20px;font-weight:700;margin-top:6px">Try again</div>
  </div>'''
states=f'''<div style="width:1290px;min-height:760px;background:var(--bg);padding:32px">
  <div class="t-display" style="margin-bottom:6px">Four states, never a blank screen</div>
  <div class="t-body" style="color:var(--tx2);max-width:680px;margin-bottom:24px">
    Today every one of these is the same empty rectangle on four of five surfaces. Loading is a
    skeleton shaped like the content that replaces it — never a centred spinner. Empty names an
    action and offers the control. Failed is distinguishable from empty and offers a retry.</div>
  <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:26px">
    {mini('LOADING — skeleton, not a spinner', loading)}
    {mini('EMPTY — says what to do next', empty)}
    {mini('FAILED — distinguishable, retryable', failed, 'var(--danger)')}
  </div></div>'''
pathlib.Path('States.dc.html').write_text(page(states))

# ─── 10. Auth ────────────────────────────────────────────────────────────────
def field(label, val, dots=False):
    shown = '&bull;'*len(val) if dots else val
    c = 'var(--tx)' if val else 'var(--tx3)'
    return f'''<div style="display:flex;flex-direction:column;gap:6px">
  <span class="t-small" style="color:var(--tx3)">{label}</span>
  <div class="t-body" style="color:{c};background:var(--sunken);border-radius:var(--r-field);
    padding:12px 16px;letter-spacing:{'1.5px' if dots else 'normal'}">{shown}</div></div>'''
def auth_screen(title, cta, fields, footer):
    return f'''<div class="phone">
  <div class="safe-top"></div>
  <div style="flex:none;display:flex;align-items:center;justify-content:space-between;padding:2px 16px 14px">
    <span class="t-display">{title}</span>
    <span class="t-caption" style="color:var(--on-accent);background:var(--accent);border-radius:var(--r-btn);
      padding:14px 18px;font-weight:700">{cta}</span>
  </div>
  <div class="scroll" style="padding:0 16px">
    <div class="t-title" style="font-size:24px;line-height:31px;margin-bottom:6px">
      Things worth paying attention to.</div>
    <div class="t-body" style="color:var(--tx2);margin-bottom:22px">
      Photos and video from people deep in the things they love.</div>
    <div style="display:flex;flex-direction:column;gap:13px">{fields}</div>
    <div class="t-caption" style="color:var(--accent);text-align:center;font-weight:700;margin-top:22px">{footer}</div>
  </div></div>'''
signin=auth_screen('Sign in','Sign in',
  field('Email','jo@example.com')+field('Password','password12',True),'Create an account')
signup=auth_screen('Create account','Create',
  field('Email','')+field('Password','',True)+field('Handle','')+field('Name',''),'Sign in instead')
auth=f'''<div style="width:900px;min-height:940px;background:var(--bg);padding:32px">
  <div class="t-display" style="margin-bottom:6px">Sign in and sign up</div>
  <div class="t-body" style="color:var(--tx2);max-width:640px;margin-bottom:8px">
    The submit sits <b>above</b> the fields. A soft keyboard opens below the field being typed
    into, so a control above every field cannot be covered at any keyboard height.</div>
  <div class="t-caption" style="color:var(--tx3);margin-bottom:22px">
    Three device runs were spent signed out before this became an invariant rather than a measurement.</div>
  <div style="display:flex;gap:40px">{signin}{signup}</div></div>'''
pathlib.Path('Auth.dc.html').write_text(page(auth))
print('States.dc.html, Auth.dc.html')

# ═══ MISSING SCREENS — every control in the set above now has a destination ═══
def row(left, mid, right='', border=True):
    b='border-bottom:1px solid var(--hair)' if border else ''
    return f'''<div style="display:flex;align-items:center;gap:12px;padding:13px 0;{b};min-height:44px">
  {left}<div style="flex:1;min-width:0">{mid}</div>{right}</div>'''
def pill(txt, solid=True):
    if solid: return (f'<span class="t-caption" style="color:var(--on-accent);background:var(--accent);'
        f'border-radius:var(--r-btn);padding:14px 18px;font-weight:700;white-space:nowrap">{txt}</span>')
    return (f'<span class="t-caption" style="color:var(--tx);border:1.5px solid var(--strong);'
        f'border-radius:var(--r-btn);padding:14px 18px;font-weight:700;white-space:nowrap">{txt}</span>')

# ─── Interest space — the product's premise, and the biggest gap ─────────────
isp_cards=''.join(card(p,h,t,'Birding',l,c) for p,h,t,l,c in
  [('ph-1',176,'Goldcrest, finally still',34,6),('ph-5',142,'Redwing on the old orchard',22,2),
   ('ph-3',150,'Nuthatch, four seconds of patience',61,9),('ph-2',186,'Sanderlings at low tide',45,5)])
interest=f'''<div class="phone">
  <div class="safe-top"></div>
  {topbar('Birding', ic('more',22), back=True)}
  <div class="scroll" style="padding:0 16px">
    <div style="background:var(--raised);border-radius:var(--r-card);padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span class="t-title" style="color:#00798D">Birding</span>
        <span style="flex:1"></span>{pill('Follow')}</div>
      <div class="t-body" style="color:var(--tx2);margin-bottom:10px">
        Watching, identifying and photographing wild birds.</div>
      <div style="display:flex;gap:18px">
        <span class="t-small" style="color:var(--tx3)"><b style="color:var(--tx)">1,204</b> posts</span>
        <span class="t-small" style="color:var(--tx3)"><b style="color:var(--tx)">318</b> followers</span></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      {''.join(f'<span class="t-small" style="color:#00798D;border:1.5px solid var(--hair);border-radius:var(--r-btn);padding:9px 12px;font-weight:600">{s}</span>' for s in ['Waders','Raptors','Garden birds','Seabirds'])}
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start">
      <div style="display:flex;flex-direction:column;gap:12px">{isp_cards[0:0] or ''}{card('ph-1',176,'Goldcrest, finally still','Birding',34,6)}{card('ph-3',150,'Nuthatch, four seconds','Birding',61,9)}</div>
      <div style="display:flex;flex-direction:column;gap:12px">{card('ph-5',142,'Redwing on the old orchard','Birding',22,2)}{card('ph-2',186,'Sanderlings at low tide','Birding',45,5)}</div>
    </div>
  </div>
  {nav('discover')}
</div>'''
pathlib.Path('InterestSpace.dc.html').write_text(page(interest))

# ─── Cold start — every new account lands here ───────────────────────────────
def seed_tile(name, on=False):
    col=INTEREST[name]
    bd=f'2px solid {col}' if on else '1.5px solid var(--hair)'
    tick=f'<span style="position:absolute;top:7px;right:7px;color:{col}">{ic("check",17)}</span>' if on else ''
    return f'''<div style="position:relative;background:var(--raised);border:{bd};border-radius:var(--r-card);
      padding:14px 12px;min-height:44px;display:flex;align-items:center">
      <span class="t-label" style="color:{col}">{name}</span>{tick}</div>'''
cold=f'''<div class="phone">
  <div class="safe-top"></div>
  <div style="flex:none;display:flex;align-items:center;justify-content:space-between;padding:2px 16px 14px">
    <span class="t-display">What are you into?</span>
    <span class="t-caption" style="color:var(--tx3);font-weight:600;min-height:44px;display:flex;align-items:center">Skip</span>
  </div>
  <div class="scroll" style="padding:0 16px">
    <div class="t-body" style="color:var(--tx2);margin-bottom:18px">
      Pick a few and your feed starts with something in it. You can change this whenever.</div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
      {seed_tile('Birding',True)}{seed_tile('Ceramics')}{seed_tile('Climbing',True)}
      {seed_tile('Cooking')}{seed_tile('Cycling')}{seed_tile('Gardening',True)}
      {seed_tile('Music')}{seed_tile('Painting')}{seed_tile('Photography')}
      {seed_tile('Running')}{seed_tile('Travel')}{seed_tile('Baking')}
    </div>
  </div>
  <div style="flex:none;padding:12px 16px 26px;background:var(--bg);border-top:1px solid var(--hair)">
    <div class="t-caption" style="text-align:center;color:var(--on-accent);background:var(--accent);
      border-radius:var(--r-btn);padding:15px 0;font-weight:700">Continue with 3</div>
  </div>
</div>'''
pathlib.Path('ColdStart.dc.html').write_text(page(cold))
print('InterestSpace.dc.html, ColdStart.dc.html')

# ─── Conversation ────────────────────────────────────────────────────────────
def bubble(txt, mine=False, when=''):
    bg='var(--accent)' if mine else 'var(--raised)'
    fg='var(--on-accent)' if mine else 'var(--tx)'
    al='flex-end' if mine else 'flex-start'
    rad='18px 18px 4px 18px' if mine else '18px 18px 18px 4px'
    return f'''<div style="display:flex;flex-direction:column;align-items:{al};gap:3px">
  <div class="t-body" style="background:{bg};color:{fg};border-radius:{rad};padding:10px 14px;max-width:255px">{txt}</div>
  <span class="t-small" style="color:var(--tx3)">{when}</span></div>'''
conv=f'''<div class="phone">
  <div class="safe-top"></div>
  <div style="flex:none;display:flex;align-items:center;gap:10px;padding:2px 16px 10px;min-height:44px;
    border-bottom:1px solid var(--hair)">
    <span style="color:var(--tx2)">{ic('back',22)}</span>
    <div style="width:32px;height:32px;border-radius:999px;background:#617214;display:flex;
      align-items:center;justify-content:center;color:#fff;font-size:12.5px;font-weight:700">J</div>
    <span class="t-label">jonas</span><span style="flex:1"></span>
    <span style="color:var(--tx2)">{ic('more',22)}</span>
  </div>
  <div class="scroll" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px;justify-content:flex-end">
    {bubble('Is the hedge the one past the level crossing?', False, '09:12')}
    {bubble('That one. Go early — they are gone by nine.', True, '09:20')}
    {bubble('Sent you a post', False, '09:22')}
    <div style="align-self:flex-start;background:var(--raised);border-radius:18px 18px 18px 4px;
      padding:8px;width:190px">
      <div class="ph ph-5" style="height:120px;border-radius:12px"></div>
      <div class="t-small" style="color:var(--tx2);padding:8px 4px 2px">Redwing on the old orchard</div>
    </div>
  </div>
  <div style="flex:none;padding:10px 16px 26px;border-top:1px solid var(--hair);background:var(--bg);
    display:flex;align-items:center;gap:10px">
    <span style="color:var(--tx3)">{ic('camera',22)}</span>
    <div class="t-body" style="flex:1;color:var(--tx3);background:var(--sunken);
      border-radius:var(--r-field);padding:12px 16px">Message</div>
    <span style="color:var(--accent)">{ic('share',22)}</span>
  </div>
</div>'''
pathlib.Path('Conversation.dc.html').write_text(page(conv))

# ─── Search results ──────────────────────────────────────────────────────────
def res_person(initial,colr,who,name,sub):
    av=(f'<div style="width:42px;height:42px;border-radius:999px;background:{colr};flex:none;display:flex;'
        f'align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:700">{initial}</div>')
    return row(av, f'<div class="t-label">{who}</div><div class="t-small" style="color:var(--tx3)">{name} · {sub}</div>',
               pill('Follow'))
search=f'''<div class="phone">
  <div class="safe-top"></div>
  <div style="flex:none;display:flex;align-items:center;gap:10px;padding:2px 16px 12px">
    <span style="color:var(--tx2)">{ic('back',22)}</span>
    <div style="flex:1;display:flex;align-items:center;gap:9px;background:var(--sunken);
      border-radius:var(--r-field);padding:11px 14px">
      {ic('search',18)}<span class="t-body" style="color:var(--tx)">bird</span></div>
  </div>
  <div style="flex:none;display:flex;gap:20px;padding:0 16px;border-bottom:1px solid var(--hair)">
    <span class="t-caption" style="font-weight:700;padding-bottom:10px;box-shadow:inset 0 -2px 0 var(--accent)">Interests</span>
    <span class="t-caption" style="color:var(--tx3);padding-bottom:10px">People</span>
    <span class="t-caption" style="color:var(--tx3);padding-bottom:10px">Posts</span>
    <span class="t-caption" style="color:var(--tx3);padding-bottom:10px">Places</span>
  </div>
  <div class="scroll" style="padding:0 16px">
    {row(f'<span style="color:#00798D">{ic("explore",20)}</span>',
         '<div class="t-label" style="color:#00798D">Birding</div><div class="t-small" style="color:var(--tx3)">1,204 posts</div>')}
    {row(f'<span style="color:#00798D">{ic("explore",20)}</span>',
         '<div class="t-label" style="color:#00798D">Garden birds</div><div class="t-small" style="color:var(--tx3)">in Birding · 402 posts</div>')}
    {row(f'<span style="color:#00798D">{ic("explore",20)}</span>',
         '<div class="t-label" style="color:#00798D">Seabirds</div><div class="t-small" style="color:var(--tx3)">in Birding · 188 posts</div>')}
    <div class="t-caption" style="color:var(--tx3);padding:16px 0 4px">People</div>
    {res_person('M','#00798D','mara','Mara Oyelaran','1,204 followers')}
    {res_person('T','#0D70A4','tomas','Tomas Leitner','86 followers')}
  </div>
  {nav('discover')}
</div>'''
pathlib.Path('Search.dc.html').write_text(page(search))
print('Conversation.dc.html, Search.dc.html')

# ─── Own profile (differs from someone else's) ───────────────────────────────
own_grid=''.join(f'<div class="ph {p}" style="aspect-ratio:1"></div>' for p in
  ['ph-5','ph-1','ph-2','ph-6','ph-3','ph-4'])
ownprofile=f'''<div class="phone">
  <div class="safe-top"></div>
  {topbar('@you', ic('more',22))}
  <div class="scroll">
    <div style="padding:0 16px 14px">
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:12px">
        <div style="width:66px;height:66px;border-radius:999px;background:var(--accent);flex:none;
          display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px;font-weight:700">Y</div>
        <div style="display:flex;gap:26px;flex:1;justify-content:space-around">
          {stat('6','posts')}{stat('12','followers')}{stat('31','following')}</div>
      </div>
      <div class="t-label" style="margin-bottom:3px">Your name</div>
      <div class="t-body" style="color:var(--tx2);margin-bottom:12px">Gardening, mostly badly.</div>
      <div style="display:flex;gap:8px">
        <span class="t-caption" style="flex:1;text-align:center;color:var(--tx);border:1.5px solid var(--strong);
          border-radius:var(--r-btn);padding:14px 0;font-weight:700">Edit profile</span>
        <span class="t-caption" style="flex:1;text-align:center;color:var(--tx);border:1.5px solid var(--strong);
          border-radius:var(--r-btn);padding:14px 0;font-weight:700">Share profile</span>
      </div>
    </div>
    <div style="display:flex;gap:22px;padding:0 16px;border-bottom:1px solid var(--hair)">
      <span class="t-caption" style="font-weight:700;padding-bottom:10px;box-shadow:inset 0 -2px 0 var(--accent)">Posts</span>
      <span class="t-caption" style="color:var(--tx3);padding-bottom:10px">Saved</span>
      <span class="t-caption" style="color:var(--tx3);padding-bottom:10px">Interests</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px;margin-top:2px">{own_grid}</div>
  </div>
  {nav('you')}
</div>'''
pathlib.Path('OwnProfile.dc.html').write_text(page(ownprofile))

# ─── Saved & collections ─────────────────────────────────────────────────────
def coll(name,n,phs):
    mos=''.join(f'<div class="ph {p}"></div>' for p in phs)
    return f'''<div style="background:var(--raised);border-radius:var(--r-card);overflow:hidden">
  <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:50px 50px;gap:1px">{mos}</div>
  <div style="padding:9px 10px 11px"><div class="t-label">{name}</div>
  <div class="t-small" style="color:var(--tx3)">{n} saved</div></div></div>'''
saved=f'''<div class="phone">
  <div class="safe-top"></div>
  {topbar('Saved', ic('plus',22), back=True)}
  <div style="flex:none;display:flex;gap:20px;padding:0 16px;border-bottom:1px solid var(--hair)">
    <span class="t-caption" style="font-weight:700;padding-bottom:10px;box-shadow:inset 0 -2px 0 var(--accent)">All</span>
    <span class="t-caption" style="color:var(--tx3);padding-bottom:10px">Collections</span>
  </div>
  <div class="scroll" style="padding:14px 16px">
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
      {coll('Hedgerow mornings',14,['ph-1','ph-5','ph-3','ph-2'])}
      {coll('Glaze tests',31,['ph-2','ph-4','ph-6','ph-1'])}
      {coll('Someday routes',8,['ph-3','ph-6','ph-5','ph-4'])}
      {coll('Bread',22,['ph-5','ph-2','ph-1','ph-3'])}
    </div>
  </div>
  {nav('you')}
</div>'''
pathlib.Path('Saved.dc.html').write_text(page(saved))

# ─── Edit profile ────────────────────────────────────────────────────────────
def sw(label, on=True):
    bg='var(--accent)' if on else 'var(--strong)'
    knob='right:3px' if on else 'left:3px'
    return row('', f'<span class="t-body">{label}</span>',
      f'<div style="width:44px;height:26px;border-radius:999px;background:{bg};position:relative;flex:none">'
      f'<div style="position:absolute;top:3px;{knob};width:20px;height:20px;border-radius:999px;background:#fff"></div></div>')
editp=f'''<div class="phone">
  <div class="safe-top"></div>
  <div style="flex:none;display:flex;align-items:center;justify-content:space-between;padding:2px 16px 10px;min-height:44px">
    <span style="color:var(--tx2)">{ic('back',22)}</span>
    <span class="t-title">Edit profile</span>{pill('Save')}
  </div>
  <div class="scroll" style="padding:0 16px">
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:6px 0 18px">
      <div style="width:76px;height:76px;border-radius:999px;background:var(--accent);display:flex;
        align-items:center;justify-content:center;color:#fff;font-size:30px;font-weight:700">Y</div>
      <span class="t-caption" style="color:var(--accent);font-weight:700;min-height:44px;display:flex;align-items:center">Change photo</span>
    </div>
    {field('Name','Your name')}<div style="height:12px"></div>
    {field('Handle','@you')}<div style="height:12px"></div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <span class="t-small" style="color:var(--tx3)">Bio</span>
      <div class="t-body" style="background:var(--sunken);border-radius:var(--r-card);padding:12px 16px;min-height:72px">Gardening, mostly badly.</div>
    </div>
    <div class="t-caption" style="color:var(--tx3);padding:20px 0 2px">Notifications</div>
    {sw('Reactions')}{sw('Comments')}{sw('New followers',False)}{sw('Messages')}{sw('Mentions')}
    <div class="t-caption" style="color:var(--tx3);padding:20px 0 2px">Account</div>
    {row('', '<span class="t-body">Private account</span>',
      '<div style="width:44px;height:26px;border-radius:999px;background:var(--strong);position:relative;flex:none">'
      '<div style="position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:999px;background:#fff"></div></div>')}
    {row(f'<span style="color:var(--tx2)">{ic("save",20)}</span>','<span class="t-body">Removed content</span>',
         f'<span style="color:var(--tx3)">{ic("back",18)}</span>')}
    <div style="padding:18px 0 30px;display:flex;flex-direction:column;gap:10px">
      <span class="t-caption" style="text-align:center;color:var(--tx);border:1.5px solid var(--strong);
        border-radius:var(--r-btn);padding:14px 0;font-weight:700">Sign out</span>
      <span class="t-caption" style="text-align:center;color:var(--danger);font-weight:700;
        min-height:44px;display:flex;align-items:center;justify-content:center">Delete account</span>
    </div>
  </div>
</div>'''
pathlib.Path('EditProfile.dc.html').write_text(page(editp))
print('OwnProfile.dc.html, Saved.dc.html, EditProfile.dc.html')

# ─── Media picker, place picker, new message ─────────────────────────────────
mp_grid=''.join(f'''<div class="ph {p}" style="aspect-ratio:1;position:relative">
  {'<span style="position:absolute;top:6px;right:6px;width:20px;height:20px;border-radius:999px;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff">'+ic('check',13)+'</span>' if i in (0,4) else '<span style="position:absolute;top:6px;right:6px;width:20px;height:20px;border-radius:999px;border:2px solid rgba(255,255,255,.85)"></span>'}
  </div>''' for i,p in enumerate(['ph-1','ph-3','ph-5','ph-2','ph-6','ph-4','ph-1','ph-5','ph-3','ph-2','ph-4','ph-6']))
mediapicker=f'''<div class="phone">
  <div class="safe-top"></div>
  <div style="flex:none;display:flex;align-items:center;justify-content:space-between;padding:2px 16px 10px;min-height:44px">
    <span style="color:var(--tx2)">{ic('close',22)}</span>
    <span class="t-title">Recents</span>{pill('Add 2')}
  </div>
  <div class="scroll">
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px">{mp_grid}</div>
  </div>
  <div style="flex:none;display:flex;gap:10px;padding:12px 16px 26px;border-top:1px solid var(--hair)">
    <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;
      border:1.5px solid var(--strong);border-radius:var(--r-btn);padding:14px 0;color:var(--tx)">
      {ic('camera',20)}<span class="t-caption" style="font-weight:700">Take a photo</span></div>
  </div>
</div>'''
pathlib.Path('MediaPicker.dc.html').write_text(page(mediapicker))

placeboard=f'''<div class="phone">
  <div class="safe-top"></div>
  {topbar('Hollow Ponds', ic('more',22), back=True)}
  <div class="scroll" style="padding:0 16px">
    <div style="background:var(--raised);border-radius:var(--r-card);padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span class="t-title">Hollow Ponds</span><span style="flex:1"></span>{pill('Follow')}</div>
      <div class="t-caption" style="color:var(--tx3);margin-bottom:10px">Leyton, London</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="color:#8A6116;letter-spacing:2px">{'★'*4}<span style="color:var(--strong)">★</span></span>
        <span class="t-caption" style="color:var(--tx2)">4.2 · 38 reviews</span></div>
    </div>
    <div style="display:flex;gap:20px;border-bottom:1px solid var(--hair);margin-bottom:12px">
      <span class="t-caption" style="font-weight:700;padding-bottom:10px;box-shadow:inset 0 -2px 0 var(--accent)">Posts</span>
      <span class="t-caption" style="color:var(--tx3);padding-bottom:10px">Reviews</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start">
      <div style="display:flex;flex-direction:column;gap:12px">{card('ph-5',150,'Early mist over the water','Birding',18,2)}</div>
      <div style="display:flex;flex-direction:column;gap:12px">{card('ph-3',176,'Swans, unimpressed','Birding',26,4)}</div>
    </div>
  </div>
  {nav('discover')}
</div>'''
pathlib.Path('Place.dc.html').write_text(page(placeboard))

def pick_row(initial,colr,who,name,checked=False):
    av=(f'<div style="width:42px;height:42px;border-radius:999px;background:{colr};flex:none;display:flex;'
        f'align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:700">{initial}</div>')
    box=(f'<span style="width:22px;height:22px;border-radius:999px;background:var(--accent);display:flex;'
         f'align-items:center;justify-content:center;color:#fff">{ic("check",14)}</span>' if checked else
         '<span style="width:22px;height:22px;border-radius:999px;border:1.5px solid var(--strong)"></span>')
    return row(av, f'<div class="t-label">{who}</div><div class="t-small" style="color:var(--tx3)">{name}</div>', box)
newmsg=f'''<div class="phone">
  <div class="safe-top"></div>
  <div style="flex:none;display:flex;align-items:center;justify-content:space-between;padding:2px 16px 10px;min-height:44px">
    <span style="color:var(--tx2)">{ic('close',22)}</span>
    <span class="t-title">New message</span>{pill('Next')}
  </div>
  <div style="flex:none;padding:0 16px 12px">
    <div style="display:flex;align-items:center;gap:9px;background:var(--sunken);
      border-radius:var(--r-field);padding:11px 14px;color:var(--tx3)">
      {ic('search',18)}<span class="t-body" style="color:var(--tx3)">Search people</span></div>
  </div>
  <div class="scroll" style="padding:0 16px">
    <div class="t-caption" style="color:var(--tx3);padding:4px 0 2px">Selected · 2</div>
    {pick_row('J','#617214','jonas','Jonas Alvar',True)}
    {pick_row('P','#964B78','priya','Priya Raghavan',True)}
    <div class="t-caption" style="color:var(--tx3);padding:16px 0 2px">Suggested</div>
    {pick_row('M','#00798D','mara','Mara Oyelaran')}
    {pick_row('T','#0D70A4','tomas','Tomas Leitner')}
    {pick_row('S','#A04D39','saoirse','Saoirse Byrne')}
  </div>
</div>'''
pathlib.Path('NewMessage.dc.html').write_text(page(newmsg))
print('MediaPicker.dc.html, Place.dc.html, NewMessage.dc.html')

# ─── Action sheets ───────────────────────────────────────────────────────────
def sheet_item(icon,label,danger=False):
    c='var(--danger)' if danger else 'var(--tx)'
    return f'''<div style="display:flex;align-items:center;gap:14px;padding:15px 0;min-height:44px;color:{c}">
  {ic(icon,20)}<span class="t-body" style="color:{c}">{label}</span></div>'''
def sheet(title, items, behind):
    return f'''<div class="phone">
  <div style="position:absolute;inset:0;overflow:hidden">{behind}</div>
  <div style="position:absolute;inset:0;background:rgba(22,33,26,.38)"></div>
  <div style="position:absolute;left:0;right:0;bottom:0;background:var(--raised);
    border-radius:var(--r-sheet) var(--r-sheet) 0 0;padding:10px 20px 28px">
    <div style="width:38px;height:4px;border-radius:999px;background:var(--strong);margin:0 auto 12px"></div>
    <div class="t-caption" style="color:var(--tx3);padding-bottom:4px">{title}</div>
    {''.join(items)}
  </div></div>'''
behind_feed=f'''<div class="safe-top"></div>{topbar('socialInterest', ic('search',22))}
  <div style="padding:12px 16px"><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start">
  <div>{card('ph-1',150,'Goldcrest, finally still','Birding',34,6)}</div>
  <div>{card('ph-2',130,'Trimming the foot','Ceramics',62,4)}</div></div></div>'''
postsheet=sheet('This post', [
  sheet_item('share','Share'), sheet_item('save','Save to a collection'),
  sheet_item('close','Not interested'), sheet_item('profile','Mute mara'),
  sheet_item('more','Report post', True)], behind_feed)
pathlib.Path('PostActions.dc.html').write_text(page(postsheet))

safetysheet=sheet('mara', [
  sheet_item('chats','Message'), sheet_item('share','Share profile'),
  sheet_item('close','Mute'), sheet_item('profile','Block', True),
  sheet_item('more','Report account', True)], behind_feed)
pathlib.Path('SafetySheet.dc.html').write_text(page(safetysheet))

# ─── The flow map: every control, and where it goes ──────────────────────────
def flow(screen, rows):
    body=''.join(f'''<div style="display:grid;grid-template-columns:118px 18px 1fr;gap:8px;
      align-items:center;padding:6px 0;border-top:1px solid var(--hair)">
      <span class="t-small" style="color:var(--tx2)">{c}</span>
      <span class="t-small" style="color:var(--strong)">&rarr;</span>
      <span class="t-small" style="color:{'var(--danger)' if new else 'var(--tx)'};font-weight:600">{d}{' •' if new else ''}</span>
    </div>''' for c,d,new in rows)
    return f'''<div style="background:var(--raised);border-radius:var(--r-card);padding:14px 16px 16px">
  <div class="t-label" style="color:var(--accent);margin-bottom:6px">{screen}</div>{body}</div>'''
maps=[
 flow('Home feed',[('search icon','Search',True),('For you / Following','same screen, two states',False),
   ('a card','Post detail',False),('interest word','Interest space',True),
   ('heart / comment','inline, then Post detail',False),('5 nav icons','the five tabs',False)]),
 flow('Explore',[('search field','Search',True),('interest tile','Interest space',True),
   ('“Busy this week”','ranked, no input needed',False)]),
 flow('Interest space',[('Follow','state change',False),('sub-interest','that interest space',True),
   ('a card','Post detail',False),('⋯','report interest description',True)]),
 flow('Post detail',[('back','wherever you came from',False),('⋯','Post actions sheet',True),
   ('avatar / handle','Profile',False),('Follow','state change',False),
   ('heart','state change',False),('comment','comment composer',False),
   ('share','share sheet',True),('save','Saved / collections',True),
   ('interest word','Interest space',True)]),
 flow('Profile (someone else)',[('⋯','Safety sheet',True),('Follow','state change',False),
   ('Message','Conversation',True),('a grid tile','Post detail',False),('Interests tab','their interests',False)]),
 flow('Profile (yours)',[('Edit profile','Edit profile',True),('Share profile','share sheet',True),
   ('Saved tab','Saved / collections',True),('a grid tile','Post detail',False)]),
 flow('Compose',[('close','back, with a discard prompt',False),('Add / camera','Media picker',True),
   ('an interest chip','picks it; search opens the picker',True),('Add a place','Place picker',True),
   ('Publish','Post detail, on the new post',False)]),
 flow('Chats',[('+','New message',True),('a row','Conversation',True)]),
 flow('Conversation',[('back','Chats',False),('⋯','Safety sheet',True),
   ('camera','Media picker',True),('send','stays here',False),('a sent post','Post detail',False)]),
 flow('Activity',[('a like row','Post detail',False),('a comment row','Post detail, at the comment',False),
   ('a follow row','Profile',False)]),
 flow('Edit profile',[('Change photo','Media picker',True),('Removed content','Moderation notices',True),
   ('Sign out','Sign in',False),('Delete account','confirm, then Sign in',False)]),
 flow('Sign in / Sign up',[('Create an account','Sign up, keeping the email',False),
   ('Sign in instead','Sign in, keeping the email',False),
   ('Create','Cold start, then the feed',True),('Use a different server','reveals the address field',False)]),
]
flowmap=f'''<div style="width:1300px;min-height:900px;background:var(--bg);padding:32px">
  <div class="t-display" style="margin-bottom:6px">Where every button goes</div>
  <div class="t-body" style="color:var(--tx2);max-width:760px;margin-bottom:8px">
    Every control on every screen, and its destination. A control with nowhere to go is the
    defect this map exists to make visible — the product currently has two routes nothing can
    reach, and one of them has no renderer either.</div>
  <div class="t-caption" style="color:var(--danger);margin-bottom:22px">
    &bull; marks a destination that did not exist as an artboard before this pass — fourteen of them.</div>
  <div style="column-count:3;column-gap:18px">
    {''.join(f'<div style="break-inside:avoid;margin-bottom:18px">{m}</div>' for m in maps)}
  </div></div>'''
pathlib.Path('FlowMap.dc.html').write_text(page(flowmap))
print('PostActions.dc.html, SafetySheet.dc.html, FlowMap.dc.html')
