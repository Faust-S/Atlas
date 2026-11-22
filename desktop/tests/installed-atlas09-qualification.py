"""Atlas 0.9: real installed WebView2 and original Setup Core user qualification.

Reuse the accepted large-project Windows journey from Atlas 0.8, then
independently verify the actual 0.9 development label and that the
standalone app does not advertise unavailable original Agent/T3 owners.
No synthetic Tauri host, test IPC, browser automation or native writes.
"""
import importlib.util
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
spec=importlib.util.spec_from_file_location(
    "atlas08_original_user_route",Path(__file__).with_name("installed-atlas08-corrections.py"))
route=importlib.util.module_from_spec(spec)
spec.loader.exec_module(route)


def qualify(expected_version="0.9.0 (разработка)"):
    route.qualify()
    # Original 0.8 qualification leaves the real installed Atlas window open.
    # Prove it is now the actual 0.9 build, not an old binary in the same
    # product-data location and not a fictitious candidate identified by CI.
    observed=route.d.visible_texts()
    required=expected_version
    if not any(required in text for text in observed):
        route.v.capture("atlas09-installed-version-not-observed")
        raise AssertionError("Atlas 0.9 development label not observed in installed WebView2 UI")
    print("ATLAS09_INSTALLED_PRODUCT_VERSION_PASS",flush=True)

    # No original signed Agent/T3 owner is installed on this clean runner.
    # The standalone table MUST NOT display actions that pretend to exist.
    route.d.wait_text("Работы проекта",20)
    # UIA may expose transiently untyped WebView nodes during repaint:
    # use the original raw accessibility text reader, not wrapper creation.
    displayed={name.strip() for name in route.d.visible_texts()}
    forbidden={"Поручить Agent","Опубликовать Result",
               "Проверить публикацию","Получить Result","Проверить Result"}
    unexpected=forbidden.intersection(displayed)
    if unexpected:
        route.v.capture("atlas09-unsigned-owner-action-visible")
        raise AssertionError("Unsigned standalone Atlas advertises owner actions: "+repr(sorted(unexpected)))
    print("ATLAS09_STANDALONE_NO_FAKE_T3_OWNER_PASS",flush=True)
    route.v.capture("atlas09-installed-readback-and-version")

    # No signed Agent owner is connected on this runner: qualify ONLY the
    # original installed U05 Store across two additional independent process
    # launches. The draft created by the previous GUI test is intentionally
    # discarded. Disk generation and the saved project must be unchanged.
    expected_generation=route.d.head()
    expected_project=route.d.saved_project(expected_generation)
    assert expected_generation not in (None,"none"),"No original native saved head"
    for cold_open in (1,2):
        route.d.stop()
        route.d.launch()
        route.d.wait_text("Портфель проектов",45)
        assert route.d.head()==expected_generation,(
            f"Cold native open {cold_open} changed Atlas Store generation")
        assert route.d.saved_project(expected_generation)==expected_project,(
            f"Cold native open {cold_open} changed the original saved project")
        route.v.capture(f"atlas09-native-store-cold-open-{cold_open}")
    print("ATLAS09_TWO_COLD_INSTALLED_STORE_READBACK_PASS",flush=True)


if __name__=="__main__":
    try:
        qualify()
    except Exception as error:
        print("ATLAS09_INSTALLED_QUALIFICATION_HOLD "+repr(error),flush=True)
        route.v.capture("atlas09-installed-qualification-failure")
        raise
    finally:
        route.d.stop()
