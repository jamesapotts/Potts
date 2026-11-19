"""Local-mode end-to-end tests for Our Life (phone + desktop)."""
import sys, json, os
from playwright.sync_api import sync_playwright
from icalendar import Calendar

BASE = sys.argv[1]  # http://127.0.0.1:PORT/
SHOTS = sys.argv[2]
results = []
def check(name, cond, info=''):
    results.append((name, bool(cond), info))

V1_DATA = {"items": [
    {"id": 1, "type": "Task", "title": "Call dentist", "owner": "James", "date": "2026-11-18", "notes": "Personal", "done": False},
    {"id": "abc", "type": "Task", "title": "Old real task <b>x</b>", "owner": "Keith", "date": "2026-11-10", "notes": "", "done": False},
    {"id": 7, "type": "Project", "title": "Kitchen organization", "owner": "Shared", "date": "", "notes": "40", "done": False},
    {"id": "g1", "type": "Grocery", "title": "Cheese", "owner": "Shared", "category": "Dairy & Eggs", "done": False},
    {"id": "g2", "type": "Grocery", "title": "Toilet paper", "owner": "Shared", "category": "Household Essentials", "done": False},
    {"id": "r1", "type": "Reminder", "title": "Lost reminder from V1", "owner": "Shared", "date": "", "notes": ""},
], "brain": [{"text": "legacy inbox thought", "created": "2026-10-01T10:00:00Z", "owner": "James"}]}

with sync_playwright() as p:
    b = p.chromium.launch()
    for label, vp in [("phone", {"width": 390, "height": 844}), ("desktop", {"width": 1280, "height": 900})]:
        ctx = b.new_context(viewport=vp, accept_downloads=True)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        pg.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
        pg.on("dialog", lambda d: d.accept())
        # Seed V1-format data to prove migration
        pg.goto(BASE)
        pg.evaluate("d=>localStorage.setItem('ourLifeV1', JSON.stringify(d))", V1_DATA)
        pg.reload()
        pg.wait_for_selector("#appShell:not([hidden])")
        txt = lambda: pg.inner_text("body")

        # Navigation: every section reachable
        for page in ["home", "tasks", "calendar", "meals", "groceries", "homeapt", "brain", "workout"]:
            btn = pg.locator(f"#nav [data-page='{page}']")
            if btn.is_visible():
                btn.click()
            else:
                pg.click("#nav .more-btn")
                pg.click(f"#moreModal [data-goto='{page}']")
            check(f"[{label}] reach {page}", pg.locator(f"#{page}").is_visible())
        pg.locator("#nav [data-page='home']").click()

        # Migration checks
        all_text = pg.evaluate("document.querySelector('.app').textContent")
        check(f"[{label}] V1 legacy brain migrated", "legacy inbox thought" in all_text)
        check(f"[{label}] V1 reminder now visible", "Lost reminder from V1" in all_text)
        check(f"[{label}] HTML escaped", "Old real task <b>x</b>" in all_text and pg.locator("#taskList b").count() == 0)
        proj = pg.evaluate("window.__ourLife.items.find(x=>x.type==='Project')")
        check(f"[{label}] project % migrated", proj["progress"] == 40 and proj["notes"] == "", proj)
        check(f"[{label}] overdue label shown", "Overdue" in pg.evaluate("document.getElementById('taskList').textContent"))

        def quick(type_, title, **fields):
            pg.click(".fab")
            pg.select_option("#type", type_)
            pg.fill("#titleInput", title)
            for sel, val in fields.items():
                if sel.startswith("select:"):
                    pg.select_option(sel[7:], val)
                else:
                    pg.fill(sel, val)
            pg.click("#itemForm button[type=submit]")

        quick("Task", "T-new", **{"#dateInput": "2026-11-18"})
        quick("Event", "E-evening", **{"#dateInput": "2026-11-20", "#startTimeInput": "19:00", "#locationInput": "Home, Niles; OH"})
        quick("Event", "E-allday", **{"#dateInput": "2026-11-21", "#notesInput": "A long note " * 12})
        quick("Grocery", "Bananas", **{"select:#departmentInput": "Produce"})
        quick("Meal", "Meal-no-date")
        quick("Reminder", "R-today", **{"#dateInput": "2026-11-18"})
        quick("Idea", "Deep clean bathroom", **{"select:#brainCategoryInput": "Cleaning"})
        quick("Workout", "Run", **{"#durationInput": "30", "#caloriesInput": "300"})
        quick("Project", "Paint hallway", **{"#progressInput": "25"})

        items = pg.evaluate("window.__ourLife.items.filter(x=>!x.deleted)")
        get = lambda t: next((x for x in items if x["title"] == t), None)
        check(f"[{label}] grocery manual dept", get("Bananas")["category"] == "Produce")
        check(f"[{label}] brain category", get("Deep clean bathroom")["category"] == "Cleaning")
        check(f"[{label}] workout fields", get("Run")["duration"] == 30 and get("Run")["calories"] == 300)
        all_text = pg.evaluate("document.querySelector('.app').textContent")
        for t in ["Meal-no-date", "R-today", "Deep clean bathroom", "Paint hallway", "Bananas"]:
            check(f"[{label}] rendered {t}", t in all_text)
        check(f"[{label}] reminder on Home today", "R-today" in pg.inner_text("#todayTasks") if pg.locator("#todayTasks").is_visible() else "R-today" in pg.evaluate("document.getElementById('todayTasks').textContent"))
        check(f"[{label}] Cleaning group", "Deep clean bathroom" in pg.evaluate("[...document.querySelectorAll('#brainList .section-label')].find(e=>e.textContent.startsWith('Cleaning'))?.nextElementSibling?.textContent||''"))

        # Modal resets after cancel
        pg.click(".fab"); pg.fill("#titleInput", "stale"); pg.click("#itemForm [data-act='close-modal']")
        pg.click(".fab")
        check(f"[{label}] modal resets", pg.input_value("#titleInput") == "" and pg.input_value("#type") == "Task")
        pg.keyboard.press("Escape")
        check(f"[{label}] Escape closes modal", not pg.locator("#modal").is_visible())

        # Edit
        tid = get("T-new")["id"]
        pg.locator("#nav [data-page='tasks']").click()
        pg.click(f"#taskList [data-act='edit'][data-id='{tid}']")
        check(f"[{label}] edit prefilled", pg.input_value("#titleInput") == "T-new" and pg.input_value("#dateInput") == "2026-11-18")
        pg.fill("#titleInput", "T-edited"); pg.select_option("#owner", "Keith")
        pg.click("#itemForm button[type=submit]")
        e = pg.evaluate(f"window.__ourLife.items.find(x=>x.id==='{tid}')")
        check(f"[{label}] edit saved", e["title"] == "T-edited" and e["owner"] == "Keith")
        check(f"[{label}] no duplicate on edit", pg.evaluate("window.__ourLife.items.filter(x=>x.title.startsWith('T-')).length") == 1)

        # Toggle, filter contrast
        pg.check(f"#taskList [data-act='toggle'][data-id='{tid}']")
        check(f"[{label}] toggle done", pg.evaluate(f"window.__ourLife.items.find(x=>x.id==='{tid}').done"))
        pg.click("#taskFilters [data-filter='Keith']")
        sel = pg.eval_on_selector("#taskFilters [data-filter='Keith']", "b=>[getComputedStyle(b).backgroundColor,getComputedStyle(b).color]")
        uns = pg.eval_on_selector("#taskFilters [data-filter='All']", "b=>[getComputedStyle(b).backgroundColor,getComputedStyle(b).color]")
        check(f"[{label}] selected filter navy/white", sel == ["rgb(39, 54, 74)", "rgb(255, 255, 255)"], sel)
        check(f"[{label}] unselected filter white/navy", uns == ["rgb(255, 255, 255)", "rgb(39, 54, 74)"], uns)
        check(f"[{label}] filter works", "T-edited" in pg.inner_text("#taskList") and "Call dentist" not in pg.inner_text("#taskList"))
        pg.click("#taskFilters [data-filter='All']")
        pills = pg.eval_on_selector_all(".pill", "ps=>[...new Set(ps.map(p=>p.textContent+'|'+getComputedStyle(p).backgroundColor))]")
        check(f"[{label}] owner pills distinct colors", len({x.split('|')[1] for x in pills}) == 3, pills)

        # Delete + undo
        pg.click(f"#taskList [data-act='delete'][data-id='{tid}']")
        check(f"[{label}] deleted", "T-edited" not in pg.inner_text("#taskList"))
        pg.click(".toast button")
        check(f"[{label}] undo restores", "T-edited" in pg.inner_text("#taskList"))

        # Calendar + ICS
        pg.locator("#nav [data-page='calendar']").click()
        pg.click("[data-act='day'][data-date='2026-11-20']")
        check(f"[{label}] day agenda shows event", "E-evening" in pg.inner_text("#eventList"))
        with pg.expect_download() as dl:
            pg.click("#eventList [data-act='ics']")
        ics = open(dl.value.path(), "rb").read()
        cal = Calendar.from_ical(ics)
        ev = [c for c in cal.walk("VEVENT")][0]
        st, en = ev.decoded("DTSTART"), ev.decoded("DTEND")
        check(f"[{label}] ics end after start", en > st and (en - st).seconds == 3600, (st, en))
        check(f"[{label}] ics location escaped", str(ev.get("LOCATION")) == "Home, Niles; OH", ev.get("LOCATION"))
        with pg.expect_download() as dl2:
            pg.click("#calendar [data-act='export-upcoming']")
        cal2 = Calendar.from_ical(open(dl2.value.path(), "rb").read())
        evs = {str(c.get("SUMMARY")): c for c in cal2.walk("VEVENT")}
        check(f"[{label}] bulk export has both", {"E-evening", "E-allday"} <= set(evs), list(evs))
        ad = evs.get("E-allday")
        check(f"[{label}] all-day uses DATE", ad is not None and ad.get("DTSTART").params.get("VALUE") == "DATE" or (ad and not hasattr(ad.decoded("DTSTART"), "hour")))
        raw2 = open(dl2.value.path(), "rb").read().split(b"\r\n")
        check(f"[{label}] ics lines <=75 bytes", max(len(l) for l in raw2) <= 75, max(len(l) for l in raw2))

        # Meals week nav
        pg.locator("#nav [data-page='home']").click()
        if label == "phone":
            pg.click("#nav .more-btn"); pg.click("#moreModal [data-goto='meals']")
        else:
            pg.click("#nav [data-page='meals']")
        w0 = pg.inner_text("#weekLabel"); pg.click("[data-act='week'][data-n='1']"); w1 = pg.inner_text("#weekLabel")
        check(f"[{label}] week nav", w0 != w1)
        pg.click("[data-act='week'][data-n='0']")
        check(f"[{label}] meal ideas card", pg.locator("#mealIdeasCard").is_visible() and "Meal-no-date" in pg.inner_text("#mealIdeas"))

        # Viewer persistence
        pg.select_option("#viewer", "Keith"); pg.reload(); pg.wait_for_selector("#appShell:not([hidden])")
        check(f"[{label}] viewer persists", pg.input_value("#viewer") == "Keith")
        check(f"[{label}] data persists reload", "Deep clean bathroom" in pg.evaluate("document.querySelector('.app').textContent"))

        # Backup round-trip: export, wipe, import
        pg.click("[data-act='open-settings']")
        with pg.expect_download() as dl3:
            pg.click("[data-act='export-json']")
        backup = json.load(open(dl3.value.path()))
        n = len(backup["items"])
        pg.evaluate("localStorage.removeItem('ourLifeV1')"); pg.reload(); pg.wait_for_selector("#appShell:not([hidden])")
        pg.click("[data-act='open-settings']")
        pg.set_input_files("#importFile", dl3.value.path())
        pg.wait_for_timeout(300)
        restored = pg.evaluate("window.__ourLife.items.filter(x=>!x.deleted).map(x=>x.title)")
        check(f"[{label}] backup restore", "Deep clean bathroom" in restored and "Run" in restored, (n, len(restored)))
        pg.keyboard.press("Escape")

        # Screenshots of key pages
        pg.evaluate("localStorage.setItem('ourLifeV1', JSON.stringify(%s))" % json.dumps(V1_DATA)); pg.reload(); pg.wait_for_selector("#appShell:not([hidden])")
        pg.select_option("#viewer", "James")
        pg.screenshot(path=f"{SHOTS}/{label}-home.png", full_page=True)
        pg.locator("#nav [data-page='tasks']").click(); pg.screenshot(path=f"{SHOTS}/{label}-tasks.png", full_page=True)
        pg.locator("#nav [data-page='calendar']").click(); pg.screenshot(path=f"{SHOTS}/{label}-calendar.png", full_page=True)
        if label == "phone":
            pg.click("#nav .more-btn"); pg.screenshot(path=f"{SHOTS}/{label}-more.png"); pg.keyboard.press("Escape")
        pg.click(".fab"); pg.select_option("#type", "Workout"); pg.screenshot(path=f"{SHOTS}/{label}-quickadd.png"); pg.keyboard.press("Escape")

        check(f"[{label}] no JS/CSP errors", not errors, errors)
        ctx.close()
    b.close()

fails = [r for r in results if not r[1]]
for n, ok, info in results:
    if not ok: print("FAIL", n, info)
print(f"{len(results)-len(fails)}/{len(results)} passed")
