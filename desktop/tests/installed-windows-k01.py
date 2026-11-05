"""K01 Windows installed-GUI acceptance against public GitHub and native Atlas.

Real installed NSIS/Tauri/WebView2, UIA-visible actions, native store readback.
No dev server, CDP, injected app commands, token, or test-only data writes.
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from pywinauto import Application, keyboard

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
EXE = Path(os.environ["ATLAS_INSTALLED_EXE"])
STORE = Path(os.environ["LOCALAPPDATA"]) / "ru.iwxa.atlas" / "atlas-store-v1"
HEAD = STORE / "head.json"
SCREEN = Path("desktop/tests/visual-evidence")
SCREEN.mkdir(parents=True, exist_ok=True)
NAME = "K01WindowsPublicSource"
REPOSITORY = "Faust-S/knowledge"
BRANCH = "work/2026-11-04-k01-knowledge-context-kit"
PHRASE = "Task Discovery / Activity Research / U1 / Cross-Lab"
TIME_LIMIT = 80
process = None
window = None
phase = "preflight"


def screenshot(label):
    try:
        from PIL import ImageGrab
        path = SCREEN / ("installed-k01-" + label + ".png")
        ImageGrab.grab().save(path)
        print("ATLAS_K01_WINDOWS_SCREENSHOT=" + str(path), flush=True)
    except Exception as exc:
        print("ATLAS_K01_SCREENSHOT_UNAVAILABLE " + str(exc), flush=True)


def diagnostics(label):
    screenshot(label)
    try:
        rows = []
        for item in window.descendants():
            name = (item.element_info.name or "").strip()
            if name and item.element_info.control_type in ("Button", "Text", "Edit", "Pane"):
                rows.append((item.element_info.control_type, name[:95]))
            if len(rows) >= 70:
                break
        print("ATLAS_K01_UIA_DIAGNOSTICS " + label + " " +
              json.dumps(rows, ensure_ascii=False), flush=True)
    except Exception as exc:
        print("ATLAS_K01_UIA_DIAGNOSTICS_ERROR " + str(exc), flush=True)
    try:
        manifest, project = saved_state()
        print("ATLAS_K01_NATIVE_DIAGNOSTICS " + label + " generation=" +
              str(manifest["generation"]) + " revision=" + str(manifest["revision"]) +
              " sourceStatus=" + str([s.get("status") for s in project.get("sources", [])]), flush=True)
    except Exception as exc:
        print("ATLAS_K01_NATIVE_DIAGNOSTICS_ERROR " + str(exc), flush=True)


def saved_state():
    manifest = json.loads(HEAD.read_text(encoding="utf-8"))
    projects = []
    for entry in manifest.get("projects", []):
        block = STORE / "blocks" / (entry["sha256"] + ".json")
        project = json.loads(block.read_text(encoding="utf-8"))
        assert project["id"] == entry["id"], "Atlas content-addressed block ID mismatch"
        projects.append(project)
    named = [p for p in projects if p["name"] == NAME]
    assert len(named) == 1, "Expected exactly one native Windows K01 project"
    return manifest, named[0]


def wait_saved(predicate, previous_generation=None, timeout=TIME_LIMIT):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if HEAD.exists():
            try:
                manifest, project = saved_state()
                if ((previous_generation is None or manifest["generation"] != previous_generation)
                        and predicate(manifest, project)):
                    return manifest, project
            except (OSError, ValueError, AssertionError, KeyError):
                pass
        time.sleep(0.35)
    diagnostics("save-failed-" + phase)
    raise RuntimeError("No confirmed native readback in phase " + phase)


def boot():
    global process, window
    process = subprocess.Popen([str(EXE)], env={**os.environ, "ATLAS_CI_RENDERER_PROBE": "1"})
    app = Application(backend="uia")
    deadline = time.monotonic() + 55
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Installed Atlas exited before GUI readiness: " + str(process.returncode))
        try:
            app.connect(process=process.pid, timeout=2)
            candidate = app.top_window()
            if candidate.exists(timeout=1) and candidate.is_visible():
                window = candidate
                if find_control("Button", "Открыть JSON", timeout=1):
                    print("ATLAS_K01_INSTALLED_WEBVIEW2_GUI_START_PASS pid=" + str(process.pid), flush=True)
                    return
        except Exception:
            pass
        time.sleep(0.35)
    raise RuntimeError("Installed Tauri/WebView2 control tree unavailable")


def stop():
    global process, window
    if process and process.poll() is None:
        try:
            window.set_focus()
            keyboard.send_keys("%{F4}")
            process.wait(timeout=15)
        except Exception as exc:
            process.kill()
            process.wait(timeout=12)
            raise RuntimeError("Atlas installed GUI did not close cleanly: " + str(exc))
    process, window = None, None


def find_control(kind, name, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            for item in window.descendants():
                if item.element_info.control_type == kind and (item.element_info.name or "").strip() == name:
                    return item
        except Exception:
            pass
        time.sleep(0.3)
    return None


def click_button(name, timeout=40):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            item = find_control("Button", name, timeout=2)
            if item is not None and item.is_enabled():
                try:
                    item.iface_scroll_item.ScrollIntoView()
                except Exception:
                    pass
                item.click_input()
                time.sleep(0.5)
                print("ATLAS_K01_GUI_BUTTON " + name, flush=True)
                return
            last = "Control absent or disabled"
        except Exception as exc:
            last = str(exc)[:170]
        time.sleep(0.4)
    diagnostics("button-not-actionable")
    raise RuntimeError("Cannot click installed GUI button " + name + ": " + str(last))


def fill_edit(label, value, timeout=25):
    item = find_control("Edit", label, timeout)
    if item is None:
        diagnostics("missing-edit")
        raise RuntimeError("Missing accessible WebView2 input: " + label)
    try:
        item.iface_scroll_item.ScrollIntoView()
    except Exception:
        pass
    item.set_focus()
    keyboard.send_keys("^a")
    keyboard.send_keys(value, with_spaces=True, pause=0.015)
    time.sleep(0.3)
    print("ATLAS_K01_GUI_FIELD " + label, flush=True)


def open_sources_tab():
    # A UIA click can be delivered while the tab strip is moving after
    # native save. A clicked control is not proof that React changed tabs.
    for attempt in range(3):
        tab = find_control("Button", "Источники", timeout=8)
        if tab is None:
            raise RuntimeError("Installed Sources tab unavailable")
        try:
            tab.iface_scroll_item.ScrollIntoView()
        except Exception:
            pass
        if attempt == 0:
            tab.click_input()
        else:
            window.set_focus()
            tab.set_focus()
            keyboard.send_keys("{ENTER}")
        for _ in range(12):
            if find_control("Text", "Связанные источники", timeout=1) is not None:
                print("ATLAS_K01_INSTALLED_SOURCES_TAB_PASS attempt=" + str(attempt+1),flush=True)
                return
            time.sleep(0.2)
    diagnostics("sources-tab-did-not-open")
    raise RuntimeError("Installed Sources tab did not render after real user navigation")


def select_github_source_kind():
    # A native HTML select may display its first option while the required
    # controlled value is still empty. Force an actual user change event.
    kind = find_control("ComboBox", "Тип источника", timeout=18)
    if kind is None:
        diagnostics("source-kind-unavailable")
        raise RuntimeError("Required source-kind selection unavailable in installed WebView2")
    kind.set_focus()
    try:
        kind.select("github_owner")
        time.sleep(0.2)
        kind.select("github")
    except Exception:
        # Ordinary keyboard interaction, never injected DOM or app APIs.
        keyboard.send_keys("{HOME}")
        keyboard.send_keys("{DOWN}")
        keyboard.send_keys("{HOME}")
    time.sleep(0.3)
    print("ATLAS_K01_GUI_SOURCE_KIND_SELECTED github", flush=True)


def wait_editor_closed(timeout=18):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if find_control("Button", "Применить к черновику", timeout=1) is None:
            print("ATLAS_K01_EDITOR_APPLIED_PASS", flush=True)
            return
        time.sleep(0.3)
    diagnostics("source-editor-still-open")
    raise RuntimeError("Source editor did not apply: check required field values")


def wait_gui_text(needle, timeout=45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            visible = [(x.element_info.name or "") for x in window.descendants()]
            if any(needle in val for val in visible):
                print("ATLAS_K01_GUI_TEXT_PASS " + needle, flush=True)
                return
            errors = [v for v in visible if ("GitHub" in v and "ошиб" in v.lower()) or
                      ("K01:" in v and ("не найден" in v or "недоступ" in v or "ошиб" in v.lower()))]
            if errors and needle.startswith("Свидетельство отобрано"):
                raise RuntimeError("K01 source read error: " + repr(errors[:2]))
        except RuntimeError:
            raise
        except Exception:
            pass
        time.sleep(0.4)
    diagnostics("text-not-observed-" + phase)
    raise RuntimeError("Installed GUI did not render expected text " + needle)


def click_save():
    click_button("Сохранить")


def run_route():
    global phase
    if HEAD.exists():
        raise RuntimeError("K01 Windows acceptance requires fresh Atlas profile; no existing user data touched")
    if not EXE.is_file():
        raise RuntimeError("Installed exact-revision NSIS executable not found")

    phase = "first-launch"
    boot()
    phase = "create-project"
    click_button("＋ Новый проект")
    fill_edit("Название проекта", NAME)
    click_button("Применить к черновику")
    click_save()
    saved, project = wait_saved(lambda h,p: p["name"] == NAME)
    print("ATLAS_K01_NATIVE_PROJECT_SAVE_PASS revision=" + str(saved["revision"]), flush=True)

    phase = "attach-github"
    open_sources_tab()
    click_button("＋ Источник")
    select_github_source_kind()
    fill_edit("Ссылка или идентификатор источника", REPOSITORY)
    locator = find_control("Edit", "Ссылка или идентификатор источника", timeout=3)
    if locator is None:
        raise RuntimeError("Source locator input disappeared before submit")
    try:
        actual = locator.get_value()
    except Exception:
        actual = locator.iface_value.CurrentValue
    if actual != REPOSITORY:
        diagnostics("github-locator-value-mismatch")
        raise RuntimeError("GitHub locator did not stick after native user input")
    click_button("Применить к черновику")
    wait_editor_closed()
    click_save()
    previous = saved["generation"]
    saved, project = wait_saved(
        lambda h,p: len(p.get("sources", [])) == 1 and
        p["sources"][0]["locator"] == REPOSITORY, previous)
    print("ATLAS_K01_NATIVE_GITHUB_SOURCE_SAVE_PASS", flush=True)

    phase = "observe-public-github"
    click_button("Сверить")
    window.set_focus()
    keyboard.send_keys("{ENTER}")
    # The existing Atlas source refresh is the public GitHub request, not a
    # synthetic test endpoint. Persist it via the normal GUI Save action.
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        save_button = find_control("Button", "Сохранить", timeout=1)
        if save_button and save_button.is_enabled():
            break
        time.sleep(0.7)
    else:
        diagnostics("github-refresh-not-applied")
        raise RuntimeError("Public GitHub source observation did not update Atlas draft")
    click_save()
    previous = saved["generation"]
    saved, project = wait_saved(
        lambda h,p: len(p.get("sources", [])) == 1 and
        p["sources"][0].get("status") == "ok" and
        p["sources"][0].get("summary", {}).get("complete") is True and
        BRANCH in p["sources"][0]["summary"].get("branchHeads", {}),
        previous, timeout=90)
    revision = project["sources"][0]["summary"]["branchHeads"][BRANCH]
    assert len(revision) == 40
    print("ATLAS_K01_PUBLIC_GITHUB_OBSERVATION_READBACK_PASS sha=" + revision, flush=True)

    phase = "select-context"
    fill_edit("K01 искомая фраза", PHRASE)
    fill_edit("K01 ветка", BRANCH)
    click_button("K01: найти контекст")
    wait_gui_text("Свидетельство отобрано")
    wait_gui_text("Provenance: line:")
    screenshot("current-context")
    click_button("Повторно проверить")
    wait_gui_text("Актуальность подтверждена")
    screenshot("current-context-revalidated")
    unchanged, p = saved_state()
    assert unchanged["generation"] == saved["generation"], "K01 preview wrote to native Atlas"
    print("ATLAS_K01_INSTALLED_GUI_LIVE_GITHUB_REVALIDATION_PASS", flush=True)

    phase = "restart"
    stop()
    boot()
    click_button(NAME)
    open_sources_tab()
    fill_edit("K01 искомая фраза", PHRASE)
    fill_edit("K01 ветка", BRANCH)
    click_button("K01: найти контекст")
    wait_gui_text("Свидетельство отобрано")
    click_button("Повторно проверить")
    wait_gui_text("Актуальность подтверждена")
    reopened, project2 = saved_state()
    assert reopened["generation"] == saved["generation"], "Restart/K01 should not change native generation"
    assert project2["sources"][0]["summary"]["branchHeads"][BRANCH] == revision
    screenshot("reopened-context-revalidated")
    print("ATLAS_K01_INSTALLED_GUI_COLD_RESTART_CONTEXT_PASS", flush=True)
    stop()


try:
    run_route()
    print("ATLAS_K01_INSTALLED_WINDOWS_E2E_PASS", flush=True)
except Exception as error:
    print("ATLAS_K01_INSTALLED_WINDOWS_E2E_HOLD phase=" + phase +
          " reason=" + repr(error), flush=True)
    if window is not None:
        diagnostics("failure-" + phase)
    raise
finally:
    if process is not None and process.poll() is None:
        try:
            stop()
        except Exception:
            process.kill()
            process.wait(timeout=10)
