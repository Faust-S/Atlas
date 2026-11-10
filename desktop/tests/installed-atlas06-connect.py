"""Atlas 0.6 first-use onboarding witnessed in a real installed Windows app.

No Tauri test-only IPC, synthetic native writes, browser debugger, or fake
GitHub fetch. GUI creates a draft; independent Rust store readback proves Save
and restart. On API infrastructure failure this scenario is HOLD, not PASS.
"""
import ctypes
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import win32con
import win32gui
import win32process
from PIL import ImageGrab
from pywinauto import Desktop, keyboard, mouse

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
APP=Path(os.environ["ATLAS_INSTALLED_EXE"])
STORE=Path(os.environ["LOCALAPPDATA"])/"ru.iwxa.atlas"/"atlas-store-v1"
OUT=Path("desktop/tests/visual-evidence")
OUT.mkdir(parents=True,exist_ok=True)
REPO="Faust-S/Atlas"
BRANCH="work/2026-11-10-atlas-0-6"
process=None
handle=None

def screenshot(name):
    try:
        ImageGrab.grab().save(OUT/("atlas06-connect-"+name+".png"))
        print("ATLAS06_CONNECT_SCREENSHOT "+name,flush=True)
    except Exception as exc:
        print("ATLAS06_CONNECT_SCREENSHOT_UNAVAILABLE "+repr(exc)[:180],flush=True)

def launch():
    global process,handle
    process=subprocess.Popen([str(APP)],env={**os.environ,"ATLAS_CI_RENDERER_PROBE":"1"})
    until=time.monotonic()+60
    while time.monotonic()<until:
        if process.poll() is not None:
            raise AssertionError("Installed Atlas 0.6 exited before first window")
        found=[]
        def visit(hwnd,unused):
            if not win32gui.IsWindowVisible(hwnd):return
            _,pid=win32process.GetWindowThreadProcessId(hwnd)
            if pid==process.pid and "Atlas" in win32gui.GetWindowText(hwnd):
                found.append(hwnd)
        win32gui.EnumWindows(visit,None)
        if found:
            handle=found[0]
            win32gui.MoveWindow(handle,0,0,1024,710,True)
            activate()
            return
        time.sleep(0.3)
    raise AssertionError("Installed Atlas did not open its native window")

def activate():
    if not handle or not win32gui.IsWindow(handle):
        raise AssertionError("Installed Atlas window is missing")
    win32gui.ShowWindow(handle,win32con.SW_RESTORE)
    try:win32gui.SetForegroundWindow(handle)
    except Exception:pass
    time.sleep(0.2)

def window():
    return Desktop(backend="uia").window(handle=handle)

def visible_texts():
    return [str(element.window_text()) for element in window().descendants()
            if element.window_text()]

def wait_button(name,timeout=35):
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        if process.poll() is not None:raise AssertionError("Atlas closed while seeking "+name)
        found=[element for element in window().descendants(control_type="Button")
               if element.window_text()==name and element.is_visible() and element.is_enabled()]
        if len(found)==1:return found[0]
        if len(found)>1:
            raise AssertionError("Ambiguous native button "+name)
        time.sleep(0.3)
    screenshot("button-not-found")
    raise AssertionError("Missing installed button: "+name)

def click_button(name,timeout=35):
    activate()
    wait_button(name,timeout).click_input()
    time.sleep(0.3)

def click_editor_submit():
    # UIA may advertise a Button as visible even while it is below the
    # physical scroll viewport. A real user must be able to press it.
    activate()
    button=wait_button("Добавить работу",20)
    rect=button.rectangle()
    bounds=win32gui.GetWindowRect(handle)
    if not (rect.top>=bounds[1]+42 and rect.bottom<=bounds[3]-28 and
            rect.left>=bounds[0]+230 and rect.right<=bounds[2]-8):
        screenshot("source-work-submit-not-visible")
        raise AssertionError("Work submission action is not visible within the native window")
    button.click_input()
    deadline=time.monotonic()+20
    while time.monotonic()<deadline:
        if "Форма:" not in win32gui.GetWindowText(handle):
            return
        time.sleep(0.25)
    screenshot("source-work-submit-not-applied")
    raise AssertionError("Source-linked work editor stayed open after submission")

def click_scrolled_button(name,main=False):
    # The selection controls are intentionally after the discovered tree.
    # Wheel scrolling in the main workspace is ordinary real user input;
    # off-screen UIA controls must not be treated as missing buttons.
    for _ in range(12):
        matches=[element for element in window().descendants(control_type="Button")
                 if element.window_text()==name and element.is_visible() and element.is_enabled()]
        if len(matches)>1:
            raise AssertionError("Ambiguous installed action: "+name)
        bounds=win32gui.GetWindowRect(handle)
        if len(matches)==1:
            button_rect=matches[0].rectangle()
            # UIA IsVisible can be true for an element below a scroll viewport.
            # Click only when the entire physical button is inside the window.
            if (button_rect.top >= bounds[1]+108 and
                    button_rect.bottom <= bounds[3]-38 and
                    button_rect.left >= bounds[0]+236):
                activate()
                matches[0].click_input()
                time.sleep(0.35)
                return
        activate()
        # Scroll inside the main workspace, not over the fixed sidebar.
        x=bounds[0]+440 if main else bounds[2]-92
        mouse.scroll(coords=(x,bounds[1]+min(515,bounds[3]-bounds[1]-95)),
                     wheel_dist=-3)
        time.sleep(0.35)
    screenshot("scrolled-action-missing")
    raise AssertionError("Installed action not accessible after scrolling: "+name)

def set_text(name,value):
    # HTML input[list] is represented by Windows UIA as ComboBox, while
    # an ordinary text field is Edit. Both must support native typing.
    controls = []
    for role in ("Edit","ComboBox"):
        candidate=window().child_window(title=name,control_type=role)
        if candidate.exists(timeout=2) and candidate.is_visible() and candidate.is_enabled():
            controls.append(candidate)
    if len(controls)!=1:
        screenshot("input-not-found")
        raise AssertionError("Native input not uniquely accessible: "+name+
                             " (Edit/ComboBox found="+str(len(controls))+")")
    controls[0].click_input()
    keyboard.send_keys("^a")
    keyboard.send_keys(value,with_spaces=True)
    time.sleep(0.3)

def wait_text(value,timeout=90):
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        if process.poll() is not None:raise AssertionError("Atlas exited before "+value)
        matches=visible_texts()
        if any(value in text for text in matches):return
        errors=[text for text in matches if "rate-limit" in text.lower() or
                "GitHub public API 403" in text or "GitHub public API 429" in text]
        if errors:
            screenshot("github-rate-limited")
            raise AssertionError("Public GitHub API temporarily unavailable: "+repr(errors[:2]))
        time.sleep(0.4)
    screenshot("view-timeout")
    raise AssertionError("Installed UI never rendered: "+value)

def stop():
    global process,handle
    if process is None:return
    if process.poll() is None:
        activate()
        keyboard.send_keys("%{F4}")
        try:process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            win32gui.PostMessage(handle,win32con.WM_CLOSE,0,0)
            process.wait(timeout=10)
    process=None
    handle=None

def head():
    index=STORE/"head.json"
    end=time.monotonic()+6
    while True:
        try:return json.loads(index.read_text(encoding="utf-8"))
        except PermissionError:
            if time.monotonic()>end:raise
            time.sleep(0.1)

def saved_project(manifest):
    assert len(manifest["projects"])==1,"First use unexpectedly created extra projects"
    descriptor=manifest["projects"][0]
    data=(STORE/"blocks"/(descriptor["sha256"]+".json")).read_bytes()
    assert hashlib.sha256(data).hexdigest()==descriptor["sha256"]
    project=json.loads(data.decode("utf-8"))
    assert project["id"]==descriptor["id"]
    return project

def window_title_contains(text,timeout=25):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if process.poll() is not None:raise AssertionError("Atlas closed before "+text)
        if text in win32gui.GetWindowText(handle):return
        time.sleep(0.2)
    screenshot("unexpected-window-title")
    raise AssertionError("Missing window title "+text+": "+win32gui.GetWindowText(handle))

def open_source_view():
    # The project is also present in the portfolio list; use the actual
    # sidebar control rather than a potentially ambiguous project button.
    activate()
    # A native HWND can exist before WebView2 has hydrated its React content.
    # Require the real saved project to become navigable after restart.
    deadline=time.monotonic()+40
    sidebar=[]
    while time.monotonic()<deadline:
        options=[item for item in window().descendants(control_type="Button")
                 if item.window_text()=="Atlas" and item.is_visible() and item.is_enabled()]
        left=win32gui.GetWindowRect(handle)[0]
        sidebar=[item for item in options if item.rectangle().left-left<260]
        if len(sidebar)==1:break
        if len(sidebar)>1:
            screenshot("ambiguous-project-navigation")
            raise AssertionError("Multiple Atlas projects in installed sidebar")
        time.sleep(0.3)
    if len(sidebar)!=1:
        screenshot("project-navigation-missing")
        raise AssertionError("Saved Atlas project did not appear in installed sidebar")
    sidebar[0].click_input()
    window_title_contains("Atlas — Обзор")
    # The detailed views are in the existing collapsible tab group.
    summary=window().child_window(title="Дополнительные представления проекта")
    if summary.exists(timeout=2) and summary.is_visible():
        summary.click_input()
    else:
        rect=win32gui.GetWindowRect(handle)
        dpi=ctypes.windll.user32.GetDpiForWindow(handle)
        scale=dpi/96 if dpi else 1
        mouse.click(coords=(rect[0]+round(624*scale),rect[1]+round(253*scale)))
    click_button("Источники")
    window_title_contains("Atlas — Источники")
    print("ATLAS06_CONNECT_INSTALLED_SOURCES_PASS",flush=True)

def inspect_commit_tree(revision,tree):
    request=urllib.request.Request(
        "https://api.github.com/repos/"+REPO+"/git/commits/"+revision,
        headers={"Accept":"application/vnd.github+json",
                 "User-Agent":"IWXA-Atlas-0.6-Windows-qualification"})
    with urllib.request.urlopen(request,timeout=35) as response:
        assert response.status==200,"GitHub commit API unavailable"
        payload=json.load(response)
    assert payload["sha"].lower()==revision,"Root observation belongs to another commit"
    assert payload["tree"]["sha"].lower()==tree,"Observed Git tree is not from the selected commit"

def verify_refresh(previous,original_project):
    open_source_view()
    # A normal human refresh must update the currently selected branch/tree,
    # not just the CI receipt or the timestamp.
    click_scrolled_button("Проверить код и сборку")
    time.sleep(0.6)
    keyboard.send_keys("{ENTER}")
    wait_text("Публичные наблюдения обновлены в черновике",110)
    assert head()==previous,"GitHub observation wrote native data without Save"
    screenshot("source-refreshed-draft")
    click_button("Сохранить")
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        current=head()
        if current["generation"]!=previous["generation"]:break
        time.sleep(0.25)
    else:
        screenshot("source-refresh-save-timeout")
        raise AssertionError("Native Save did not publish refreshed GitHub observation")
    project=saved_project(current)
    for key in ("id","name","type","items","stages","dependencies","decisions","targets","findings"):
        assert project.get(key)==original_project.get(key),"Refresh changed plan field "+key
    assert len(project["sources"])==1
    source=project["sources"][0]
    assert source["status"]=="ok" and source["branch"]==BRANCH
    evidence=source["summary"]
    assert evidence["readiness"]=="not_assessed","Root or CI observation promoted readiness"
    assert evidence["structure"]["status"]=="observed","Root tree not refreshed"
    assert evidence["structure"]["branch"]==BRANCH
    assert evidence["structure"]["commitSha"]==evidence["branchHeads"][BRANCH]
    assert evidence["structure"]["treeSha"]!=None
    inspect_commit_tree(evidence["structure"]["commitSha"],evidence["structure"]["treeSha"])
    delta=evidence.get("changes",{}).get("structureDelta")
    before=original_project["sources"][0]["summary"]["structure"]
    after=evidence["structure"]
    if delta:
        assert delta["previousSha"]==before["commitSha"]
        assert delta["currentSha"]==after["commitSha"]
        for field in ("Folders","Files"):
            key="folders" if field=="Folders" else "files"
            assert set(delta["added"+field])==set(after[key])-set(before[key])
            assert set(delta["removed"+field])==set(before[key])-set(after[key])
    print("ATLAS06_CONNECT_LIVE_ROOT_REFRESH_SAVE_PASS",flush=True)
    stop()
    launch()
    wait_text("Портфель проектов",45)
    assert head()==current,"Refreshed native project changed after restart"
    assert saved_project(head())==project,"Refreshed project block changed after restart"
    screenshot("refreshed-source-reopened")
    print("ATLAS06_CONNECT_LIVE_ROOT_REFRESH_RESTART_PASS",flush=True)
    verify_organization_work(current,project)

def verify_organization_work(previous,original_project):
    # A source folder is visible before the plan has any work.
    open_source_view()
    click_button("Обзор")
    window_title_contains("Atlas — Обзор")
    wait_text("Состав проекта",35)
    screenshot("suggested-structure")
    assert head()==previous,"Viewing project parts changed native storage"
    click_scrolled_button("Предложить работу по каталогу src",main=True)
    wait_text("Работа по каталогу: src",35)
    assert head()==previous,"Opening a work editor wrote a task before confirmation"
    set_text("Что нужно сделать?","Проверить исходники сайта")
    screenshot("source-work-editor")
    click_editor_submit()
    assert head()==previous,"Applying the form silently saved the project"
    wait_button("Сохранить")
    click_button("Сохранить")
    until=time.monotonic()+45
    while time.monotonic()<until:
        current=head()
        if current["generation"]!=previous["generation"]:break
        time.sleep(0.2)
    else:
        screenshot("source-work-save-timeout")
        raise AssertionError("Accepted source work was not saved")
    project=saved_project(current)
    assert len(project["items"])==1,"One form produced an unexpected number of works"
    task=project["items"][0]
    assert task["title"]=="Проверить исходники сайта"
    assert task["sourceId"]==original_project["sources"][0]["id"]
    assert task["sourcePath"]=="src"
    assert task["sourceRevision"]==original_project["sources"][0]["summary"]["structure"]["commitSha"]
    assert task["state"]=="todo" and task["targetIds"]==[]
    assert project["sources"]==original_project["sources"]
    for field in ("stages","dependencies","decisions","targets","findings"):
        assert project.get(field)==original_project.get(field), "Form modified "+field
    print("ATLAS06_USER_APPROVED_SOURCE_WORK_NATIVE_SAVE_PASS",flush=True)
    stop()
    launch()
    wait_text("Портфель проектов",45)
    assert head()==current,"Accepted work changed after restart"
    assert saved_project(current)==project,"Source-linked work changed after restart"
    open_source_view()
    click_button("Таблица")
    wait_text("Проверить исходники сайта",35)
    wait_text("Каталог:",35)
    print("ATLAS06_WORK_FOLDER_LINK_VISIBLE_PASS",flush=True)
    screenshot("source-linked-work-reopened")
    print("ATLAS06_USER_APPROVED_SOURCE_WORK_RESTART_PASS",flush=True)

def qualify():
    if (STORE/"head.json").exists():
        raise AssertionError("Wizard acceptance requires a new empty Atlas profile")
    launch()
    # The first-run screen shows three distinct actions with no setup burden.
    click_button("Подключить проект")
    wait_text("1. Источник")
    set_text("Адрес подключаемого проекта GitHub","https://github.com/"+REPO)
    click_button("Посмотреть структуру")
    wait_text("Обнаружен репозиторий",90)
    # Atlas's public 'main' may be empty; the user explicitly picks the real
    # development branch and receives the tree of that exact commit.
    set_text("Ветка исходников для подключения",BRANCH)
    click_button("Изучить выбранную ветку")
    wait_text("Корневая структура",90)
    screenshot("selected-branch-preview")
    assert not (STORE/"head.json").exists(),"Read-only inspection wrote native storage"
    click_scrolled_button("Добавить в Atlas")
    window_title_contains("Atlas — Обзор",35)
    wait_button("Сохранить")
    assert not (STORE/"head.json").exists(),"Creating a project draft unexpectedly saved"
    click_button("Сохранить")
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        if (STORE/"head.json").exists():break
        time.sleep(0.25)
    else:
        screenshot("save-timeout")
        raise AssertionError("Native Atlas did not save the project")
    first=head()
    project=saved_project(first)
    assert project["name"]=="Atlas"
    assert project["type"]=="engineering"
    assert project["items"]==[] and project["stages"]==[],"Source folders invented work or plan"
    assert len(project["sources"])==1
    source=project["sources"][0]
    assert source["kind"]=="github" and source["locator"].lower()==REPO.lower()
    assert source["branch"]==BRANCH
    assert source["status"]=="ok"
    observation=source["summary"]
    assert observation["readiness"]=="not_assessed"
    assert observation["repository"].lower()==REPO.lower()
    assert observation["structure"]["status"]=="observed"
    assert observation["structure"]["branch"]==BRANCH
    assert len(observation["structure"]["folders"])>0
    assert observation["structure"]["commitSha"]==observation["branchHeads"][BRANCH]
    print("ATLAS06_CONNECT_NATIVE_SAVE_PASS",flush=True)
    stop()
    launch()
    wait_text("Портфель проектов",45)
    second=head()
    assert second==first,"Saved structure or source changed after native restart"
    assert saved_project(second)==project,"Project block changed after restart"
    screenshot("reopened-project")
    print("ATLAS06_CONNECT_BRANCH_TREE_RESTART_PASS",flush=True)
    verify_refresh(second,project)

try:
    qualify()
except Exception as exc:
    print("ATLAS06_CONNECT_WINDOWS_HOLD "+repr(exc),flush=True)
    screenshot("failure")
    raise
finally:
    stop()
