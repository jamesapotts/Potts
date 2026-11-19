"""Cloud-mode tests: the REAL supabase-js library talks to a simulated Supabase (auth, REST, RPC, Realtime)
served from Python through Playwright routing. Two separate browser contexts = James's phone and Keith's phone."""
import sys, json, time, base64, re
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
SB = "https://test.supabase.co"
results = []
def check(name, cond, info=''):
    results.append((name, bool(cond), info)); print(("PASS " if cond else "FAIL ") + name, info if not cond else '')

def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')
USERS = {"james@example.com": ("pw-james", "11111111-1111-1111-1111-111111111111"),
         "keith@example.com": ("pw-keith", "22222222-2222-2222-2222-222222222222"),
         "stranger@evil.com": ("pw-x", "33333333-3333-3333-3333-333333333333")}
MEMBERS = {"james@example.com": "James", "keith@example.com": "Keith"}
db = {}            # id -> row
tokens = {}        # token -> email
sockets = []       # (ws, fmt, topic, join_ref)
state = {"fail_upserts": False}

def make_token(email):
    now = int(time.time()); uid = USERS[email][1]
    t = f"{b64({'alg':'HS256','typ':'JWT'})}.{b64({'sub':uid,'email':email,'role':'authenticated','aud':'authenticated','exp':now+3600,'iat':now,'session_id':'s'})}.sig"
    tokens[t] = email; return t, uid

def email_of(req):
    a = req.headers.get("authorization", "")
    return tokens.get(a.replace("Bearer ", ""))

def push_change(row, kind):
    for ws, fmt, topic, join_ref in list(sockets):
        payload = {"ids": [77], "data": {"type": kind, "schema": "public", "table": "items", "commit_timestamp": row["updated_at"],
                   "record": row, "old_record": {"id": row["id"]}, "errors": None,
                   "columns": [{"name": "id", "type": "text"}, {"name": "type", "type": "text"}, {"name": "data", "type": "jsonb"},
                               {"name": "deleted", "type": "bool"}, {"name": "updated_at", "type": "timestamptz"}]}}
        try: ws.send(json.dumps([join_ref, None, topic, "postgres_changes", payload]) if fmt == "arr" else json.dumps({"topic": topic, "event": "postgres_changes", "payload": payload, "ref": None}))
        except Exception as e: print("ws send failed", e)

def handle(route):
    req = route.request; u = urlparse(req.url); path = u.path; q = parse_qs(u.query)
    cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*"}
    if req.method == "OPTIONS": return route.fulfill(status=204, headers=cors)
    def ok(body, status=200, extra=None): return route.fulfill(status=status, headers={**cors, "content-type": "application/json", **(extra or {})}, body=json.dumps(body))
    if path == "/auth/v1/token":
        b = json.loads(req.post_data or "{}"); e = (b.get("email") or "").lower()
        if e not in USERS or USERS[e][0] != b.get("password"): return ok({"code": 400, "error_code": "invalid_credentials", "msg": "Invalid login credentials"}, 400)
        t, uid = make_token(e)
        return ok({"access_token": t, "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r-" + t[-6:],
                   "user": {"id": uid, "email": e, "aud": "authenticated", "role": "authenticated", "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}})
    if path == "/auth/v1/logout": return route.fulfill(status=204, headers=cors)
    if path == "/auth/v1/user":
        e = email_of(req)
        return ok({"id": USERS[e][1], "email": e, "aud": "authenticated", "role": "authenticated"} if e else {"msg": "no"}, 200 if e else 401)
    e = email_of(req); member = e in MEMBERS
    if path == "/rest/v1/rpc/my_member_name": return ok(MEMBERS.get(e))
    if path == "/rest/v1/items":
        if req.method == "GET":
            rows = sorted(db.values(), key=lambda r: r["id"]) if member else []
            off = int((q.get("offset") or ["0"])[0]); lim = int((q.get("limit") or ["1000"])[0])
            m = re.match(r"(\d+)-(\d+)", req.headers.get("range", ""))
            if m: off, lim = int(m.group(1)), int(m.group(2)) - int(m.group(1)) + 1
            return ok(rows[off:off + lim])
        if req.method == "POST":
            if state["fail_upserts"]: return ok({"message": "Service unavailable"}, 503)
            if not member: return ok({"message": "new row violates row-level security policy"}, 403)
            body = json.loads(req.post_data); body = body if isinstance(body, list) else [body]
            for r in body:
                kind = "UPDATE" if r["id"] in db else "INSERT"
                row = {**r, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())}
                db[r["id"]] = row; push_change(row, kind)
            return route.fulfill(status=201, headers=cors, body="")
    print("UNHANDLED", req.method, req.url)
    return ok({"message": "unhandled"}, 404)

def ws_handler(ws):
    def on_msg(msg):
        m = json.loads(msg)
        if isinstance(m, list): fmt = "arr"; join_ref, ref, topic, event, payload = m
        else: fmt = "obj"; join_ref, ref, topic, event, payload = m.get("join_ref"), m.get("ref"), m["topic"], m["event"], m.get("payload")
        def reply(resp):
            ws.send(json.dumps([join_ref, ref, topic, "phx_reply", {"status": "ok", "response": resp}]) if fmt == "arr" else json.dumps({"topic": topic, "event": "phx_reply", "payload": {"status": "ok", "response": resp}, "ref": ref}))
        if event == "phx_join":
            pcs = (payload.get("config") or {}).get("postgres_changes") or []
            reply({"postgres_changes": [{**pc, "id": 77} for pc in pcs]})
            sockets.append((ws, fmt, topic, join_ref))
        elif event in ("heartbeat", "access_token", "phx_leave"): reply({})
    ws.on_message(on_msg)

def config_route(key):
    return lambda route: route.fulfill(status=200, content_type="application/javascript",
        body=f"window.OUR_LIFE_CONFIG={{supabaseUrl:'{SB}',supabaseKey:'{key}'}};")

def new_phone(b, key="sb_publishable_test"):
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    ctx.route(re.compile(r".*/config\.js$"), config_route(key))
    ctx.route(re.compile(r"^https://test\.supabase\.co/.*"), handle)
    ctx.route_web_socket(re.compile(r"^wss://test\.supabase\.co/.*"), ws_handler)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.on("dialog", lambda d: d.accept())
    return ctx, pg, errs

def wait_js(pg, expr, timeout=5000):
    end=time.time()+timeout/1000
    while time.time()<end:
        if pg.evaluate("()=>{ try { return !!(" + expr + ") } catch(e) { return false } }"): return True
        pg.wait_for_timeout(100)
    raise TimeoutError(expr)

def login(pg, email, pw):
    pg.fill("#loginEmail", email); pg.fill("#loginPassword", pw); pg.click("#loginBtn")

V1 = {"items": [{"id": 1, "type": "Task", "title": "Call dentist", "owner": "James", "date": "2026-11-18", "notes": "Personal"},
                {"id": "x9", "type": "Task", "title": "Real old task", "owner": "James", "date": "2026-11-25"},
                {"id": "g9", "type": "Grocery", "title": "Old cheese", "owner": "Shared", "category": "Dairy & Eggs"}], "brain": []}

with sync_playwright() as p:
    b = p.chromium.launch()
    A, pa, ea = new_phone(b)
    pa.goto(BASE)
    pa.wait_for_selector("#loginScreen:not([hidden])")
    check("login screen shown when signed out", pa.locator("#appShell").is_hidden())
    pa.evaluate("d=>localStorage.setItem('ourLifeV1', JSON.stringify(d))", V1)
    login(pa, "james@example.com", "wrong")
    wait_js(pa, "document.getElementById('loginError').textContent.length>0")
    check("wrong password message", "incorrect" in pa.inner_text("#loginError"))
    login(pa, "james@example.com", "pw-james")
    pa.wait_for_selector("#appShell:not([hidden])")
    wait_js(pa, "document.getElementById('syncText').textContent==='Synced'", timeout=8000)
    check("James signed in, viewer=James", pa.input_value("#viewer") == "James")
    titles = sorted(r["data"]["title"] for r in db.values())
    check("old browser data imported (demo item skipped)", titles == ["Old cheese", "Real old task"], titles)
    check("imported with fresh IDs", all(len(i) > 10 for i in db))

    K, pk, ek = new_phone(b)
    pk.goto(BASE); pk.wait_for_selector("#loginScreen:not([hidden])")
    login(pk, "keith@example.com", "pw-keith"); pk.wait_for_selector("#appShell:not([hidden])")
    wait_js(pk, "document.querySelector('.app').textContent.includes('Real old task')", timeout=8000)
    check("Keith sees James's data", True)
    check("Keith viewer=Keith", pk.input_value("#viewer") == "Keith")
    time.sleep(1.0)

    # James adds a grocery → Keith sees it live
    pa.click(".fab"); pa.select_option("#type", "Grocery"); pa.fill("#titleInput", "Toilet paper"); pa.select_option("#departmentInput", "Household Essentials"); pa.click("#itemForm button[type=submit]")
    try:
        wait_js(pk, "document.querySelector('#groceryList').textContent.includes('Toilet paper')", timeout=6000); live_ok = True
    except Exception: live_ok = False
    check("live sync James→Keith (no reload)", live_ok, f"sockets={len(sockets)}")
    gid = next(r["id"] for r in db.values() if r["data"]["title"] == "Toilet paper")
    check("department stored as chosen", db[gid]["data"]["category"] == "Household Essentials")

    # Keith checks it off and deletes it → James sees it go
    pk.evaluate(f"document.querySelector('[data-act=delete][data-id=\"{gid}\"]').click()")
    try:
        wait_js(pa, "!document.querySelector('#groceryList').textContent.includes('Toilet paper')", timeout=6000); del_ok = True
    except Exception: del_ok = False
    check("delete syncs Keith→James", del_ok)
    check("delete is soft in database", db[gid]["deleted"] is True)

    # Edit syncs
    tid = next(r["id"] for r in db.values() if r["data"]["title"] == "Real old task")
    pa.locator("#nav [data-page='tasks']").click()
    pa.click(f"#taskList [data-act='edit'][data-id='{tid}']"); pa.fill("#titleInput", "Renamed task"); pa.click("#itemForm button[type=submit]")
    try:
        wait_js(pk, "document.querySelector('.app').textContent.includes('Renamed task')", timeout=6000); ed = True
    except Exception: ed = False
    check("edit syncs", ed)

    # Server outage → queued → recovers
    state["fail_upserts"] = True
    pa.click(".fab"); pa.fill("#titleInput", "Made during outage"); pa.click("#itemForm button[type=submit]")
    wait_js(pa, "document.getElementById('syncText').textContent.includes('retrying')", timeout=5000)
    check("outage shown, item kept locally", "Made during outage" in pa.inner_text("#taskList"))
    pa.reload(); pa.wait_for_selector("#appShell:not([hidden])")
    check("queued item survives reload", "Made during outage" in pa.evaluate("document.querySelector('.app').textContent"))
    state["fail_upserts"] = False
    pa.evaluate("window.dispatchEvent(new Event('online'))")
    wait_js(pa, "document.getElementById('syncText').textContent==='Synced'", timeout=8000)
    check("queued item uploaded after recovery", any(r["data"]["title"] == "Made during outage" for r in db.values()))
    check("session persisted across reload", pa.locator("#appShell").is_visible())

    # Sign out
    pa.click("[data-act='open-settings']"); pa.click("[data-act='sign-out']")
    pa.wait_for_selector("#loginScreen:not([hidden])")
    check("sign out returns to login, cache cleared", pa.evaluate("localStorage.getItem('ourLifeCloudCache')") is None)

    # Stranger
    S, ps, es = new_phone(b)
    ps.goto(BASE); ps.wait_for_selector("#loginScreen:not([hidden])")
    login(ps, "stranger@evil.com", "pw-x")
    wait_js(ps, "document.getElementById('loginError').textContent.length>0", timeout=6000)
    check("stranger refused", "not on the household list" in ps.inner_text("#loginError") and ps.locator("#appShell").is_hidden())

    # Secret key guard
    X, px, ex = new_phone(b, key="sb_secret_abc123")
    px.goto(BASE); px.wait_for_timeout(500)
    check("secret key refused", "secret" in px.inner_text("body"))

    check("no JS errors (James)", not ea, ea[:3]); check("no JS errors (Keith)", not ek, ek[:3])
    pk.screenshot(path="cloud-keith.png")
    b.close()

fails = [r for r in results if not r[1]]
print(f"\n{len(results)-len(fails)}/{len(results)} passed")
