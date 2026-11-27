//! Atlas 0.2 native persistence authority.
//! Immutable per-project blocks + one atomic manifest update. No HTTP server,
//! cloud identity, Task Engine or access to arbitrary frontend-supplied paths.
use fs2::FileExt;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};
use uuid::Uuid;

const MAX_FILE: u64 = 100 * 1024 * 1024;
const MAX_IWXA_BYTES: usize = 32 * 1024 * 1024;
const MAX_PROJECTS: usize = 5000;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema: String,
    generation: String,
    revision: u64,
    root: Value,
    #[serde(default)]
    root_sha256: Option<String>,
    projects: Vec<BlockRef>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct BlockRef {
    id: String,
    sha256: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryEntry {
    generation: String,
    revision: u64,
    projects: usize,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenResult {
    generation: String,
    snapshot: Value,
    restored_from_backup: bool,
    needs_confirmation: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WriteResult {
    generation: String,
    revision: u64,
    project_blocks_written: usize,
}

fn err(context: &str, e: impl std::fmt::Display) -> String {
    format!("{}: {}", context, e)
}
fn to_json<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    serde_json::to_vec(value).map_err(|e| err("Сериализация", e))
}
fn checksum(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
// A saved block, manifest or exported JSON must be readable by read_limited()
// and the native JSON importer on the next launch.
fn check_file_size(size: usize, label: &str) -> Result<(), String> {
    if (size as u64) > MAX_FILE {
        return Err(format!("{} превышает лимит 100 МБ", label));
    }
    Ok(())
}
// The pinned IWXA Setup Core owns the user's selected data folder. Previous
// NSIS installations have no Setup Core registry key and keep their own store.
#[cfg(windows)]
fn atlas_setup_product_data_root(product:&str) -> Result<Option<PathBuf>, String> {
    use std::{ffi::OsString, os::windows::ffi::OsStringExt};
    use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND};
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
    if !matches!(product,"iwxa.atlas"|"iwxa.admin-center"){
        return Err("ATLAS_SETUP_PRODUCT_NOT_SUPPORTED".into());
    }
    let key: Vec<u16> = format!("Software\\IWXA\\SetupCore\\Products\\{product}\0").encode_utf16().collect();
    let value: Vec<u16> = "DataLocation\0".encode_utf16().collect();
    let mut bytes = 0u32;
    let status = unsafe {
        RegGetValueW(HKEY_CURRENT_USER, key.as_ptr(), value.as_ptr(), RRF_RT_REG_SZ,
            std::ptr::null_mut(), std::ptr::null_mut(), &mut bytes)
    };
    if status == ERROR_FILE_NOT_FOUND || status == ERROR_PATH_NOT_FOUND { return Ok(None); }
    if status != 0 || bytes < 4 || bytes > 32768 || bytes % 2 != 0 {
        return Err("Недоступна зарегистрированная папка данных IWXA Setup Core".into());
    }
    let mut wide = vec![0u16; bytes as usize / 2];
    let status = unsafe {
        RegGetValueW(HKEY_CURRENT_USER, key.as_ptr(), value.as_ptr(), RRF_RT_REG_SZ,
            std::ptr::null_mut(), wide.as_mut_ptr().cast(), &mut bytes)
    };
    if status != 0 || bytes % 2 != 0 || bytes < 4 {
        return Err("Не удалось прочитать расположение данных IWXA Setup Core".into());
    }
    let len = bytes as usize / 2;
    let text = &wide[..len];
    let terminator = text.iter().position(|&c| c == 0)
        .ok_or("Путь к данным IWXA Setup Core не завершён")?;
    if terminator != len - 1 || terminator == 0 {
        return Err("Некорректная папка данных IWXA Setup Core".into());
    }
    let root = PathBuf::from(OsString::from_wide(&text[..terminator]));
    if !root.is_absolute() || root.parent().is_none() {
        return Err("Некорректный абсолютный путь данных IWXA Setup Core".into());
    }
    Ok(Some(root))
}

#[cfg(windows)]
fn setup_core_data_root() -> Result<Option<PathBuf>, String> {
    atlas_setup_product_data_root("iwxa.atlas")
}

fn path_for(app: &AppHandle) -> Result<PathBuf, String> {
    let original = app.path().app_local_data_dir()
        .map_err(|e| err("Недоступен каталог данных Atlas", e))?;
    #[cfg(windows)]
    let root = setup_core_data_root()?.unwrap_or(original);
    #[cfg(not(windows))]
    let root = original;
    Ok(root.join("atlas-store-v1"))
}
fn ensure_dirs(root: &Path) -> Result<(), String> {
    for dir in [root.to_path_buf(), root.join("blocks"), root.join("history")] {
        fs::create_dir_all(&dir).map_err(|e| err("Создание каталога", e))?;
    }
    Ok(())
}
fn lock(root: &Path) -> Result<File, String> {
    ensure_dirs(root)?;
    let f = OpenOptions::new().create(true).read(true).write(true)
        .open(root.join("atlas.lock")).map_err(|e| err("Блокировка", e))?;
    f.lock_exclusive().map_err(|e| err("Конкурентная запись", e))?;
    Ok(f)
}
fn read_limited(path: &Path) -> Result<Vec<u8>, String> {
    let file = File::open(path).map_err(|e| err("Открытие файла", e))?;
    if file.metadata().map_err(|e| err("Размер файла", e))?.len() > MAX_FILE {
        return Err("Файл превышает лимит 100 МБ".into());
    }
    let mut buf = Vec::new();
    file.take(MAX_FILE + 1).read_to_end(&mut buf)
        .map_err(|e| err("Чтение файла", e))?;
    if buf.len() as u64 > MAX_FILE {
        return Err("Файл превышает лимит 100 МБ".into());
    }
    Ok(buf)
}
fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)
        .map_err(|e| err("Создание файла", e))?;
    file.write_all(bytes).map_err(|e| err("Запись", e))?;
    file.sync_all().map_err(|e| err("Синхронизация данных", e))
}
fn temp_file(root: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    let temp = root.join(format!(".{}.pending", Uuid::new_v4()));
    write_new(&temp, bytes)?;
    Ok(temp)
}
#[cfg(windows)]
fn atomic_replace(temp: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;
    if !destination.exists() {
        return fs::rename(temp, destination).map_err(|e| err("Публикация записи", e));
    }
    let src: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
    let dst: Vec<u16> = destination.as_os_str().encode_wide().chain(Some(0)).collect();
    // Windows indexing/AV may briefly open head.json without FILE_SHARE_DELETE.
    // Keep the same fully-synced pending file and retry only sharing/lock
    // violations. All other errors fail immediately; the old head remains
    // authoritative and no second commit or alternative write is attempted.
    for attempt in 0..40 {
        let result = unsafe {
            ReplaceFileW(dst.as_ptr(), src.as_ptr(), std::ptr::null(), 0,
                std::ptr::null_mut(), std::ptr::null_mut())
        };
        if result != 0 { return Ok(()); }
        let failure = std::io::Error::last_os_error();
        if !matches!(failure.raw_os_error(), Some(32 | 33)) || attempt == 39 {
            return Err(err("Атомарная замена", failure));
        }
        std::thread::sleep(std::time::Duration::from_millis(75));
    }
    unreachable!("bounded Windows head publication retries")
}
#[cfg(not(windows))]
fn atomic_replace(temp: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(temp, destination).map_err(|e| err("Атомарная замена", e))
}
// Publish a user backup only if its name remains unused. Writing the complete
// file in the chosen directory first prevents exposing a truncated .json.
#[cfg(windows)]
fn publish_new_export(temp: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_WRITE_THROUGH};
    let src: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
    let dst: Vec<u16> = destination.as_os_str().encode_wide().chain(Some(0)).collect();
    // No MOVEFILE_REPLACE_EXISTING: never overwrite a user's existing backup.
    if unsafe { MoveFileExW(src.as_ptr(), dst.as_ptr(), MOVEFILE_WRITE_THROUGH) } == 0 {
        return Err(err("Публикация резервной копии", std::io::Error::last_os_error()));
    }
    Ok(())
}
#[cfg(not(windows))]
fn publish_new_export(temp: &Path, destination: &Path) -> Result<(), String> {
    fs::hard_link(temp, destination).map_err(|e| err("Публикация резервной копии", e))?;
    let _ = fs::remove_file(temp);
    Ok(())
}
fn write_export_atomic(destination: &Path, bytes: &[u8]) -> Result<(), String> {
    check_file_size(bytes.len(), "Резервная копия")?;
    if destination.exists() {
        return Err("Файл уже существует. Выберите новое имя резервной копии.".into());
    }
    let parent = destination.parent().filter(|p| !p.as_os_str().is_empty())
        .ok_or("Некорректный каталог резервной копии")?;
    let pending = parent.join(format!(".iwxa-atlas-export-{}.pending", Uuid::new_v4()));
    let result = (|| {
        write_new(&pending, bytes)?;
        publish_new_export(&pending, destination)
    })();
    if result.is_err() { let _ = fs::remove_file(&pending); }
    result
}
fn publish(root: &Path, destination: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = temp_file(root, bytes)?;
    if let Err(e) = atomic_replace(&temp, destination) {
        let _ = fs::remove_file(temp);
        return Err(e);
    }
    // Best effort: directory durability varies across Windows filesystems.
    #[cfg(unix)]
    if let Ok(dir) = File::open(root) { let _ = dir.sync_all(); }
    Ok(())
}
fn validate_snapshot(snapshot: &Value) -> Result<(), String> {
    let root = snapshot.as_object().ok_or("Неверный формат портфеля")?;
    if root.get("schema").and_then(Value::as_str) != Some("atlas.project/1") {
        return Err("Несовместимая схема Atlas".into());
    }
    let revision = root.get("revision").and_then(Value::as_u64)
        .ok_or("Некорректная редакция портфеля")?;
    if revision > 9_007_199_254_740_991 {return Err("Недопустимая редакция".into());}
    let projects = root.get("projects").and_then(Value::as_array)
        .ok_or("Отсутствуют проекты")?;
    if projects.len() > MAX_PROJECTS {return Err("Слишком много проектов".into());}
    let mut ids = HashSet::new();
    for p in projects {
        let id = p.get("id").and_then(Value::as_str).ok_or("Проект без ID")?;
        if id.len() > 160 || id.is_empty() || !ids.insert(id.to_owned()) {
            return Err("Повторяющийся или недопустимый ID проекта".into());
        }
        if !p.get("items").is_some_and(Value::is_array)
            || !p.get("dependencies").is_some_and(Value::is_array) {
            return Err("Повреждена структура проекта".into());
        }
    }
    Ok(())
}
fn encode(root: &Path, snapshot: Value, generation: String) -> Result<(Manifest, usize), String> {
    validate_snapshot(&snapshot)?;
    let obj = snapshot.as_object().ok_or("Некорректный портфель")?;
    let mut extras = obj.clone();
    let revision = extras.get("revision").and_then(Value::as_u64).ok_or("Нет редакции")?;
    extras.remove("projects");
    let projects = obj.get("projects").and_then(Value::as_array).ok_or("Нет проектов")?;
    let mut blocks = Vec::new();
    let mut written = 0;
    for project in projects {
        let bytes = to_json(project)?;
        check_file_size(bytes.len(), "Блок проекта")?;
        let hash = checksum(&bytes);
        let filename = root.join("blocks").join(format!("{hash}.json"));
        if !filename.exists() {
            let pending = temp_file(root, &bytes)?;
            match fs::rename(&pending, &filename) {
                Ok(()) => written += 1,
                Err(_e) if filename.exists() => { let _ = fs::remove_file(pending); },
                Err(e) => { let _ = fs::remove_file(pending); return Err(err("Блок проекта", e)); }
            }
        } else if checksum(&read_limited(&filename)?) != hash {
            return Err("Повреждён существующий блок проекта".into());
        }
        blocks.push(BlockRef {
            id: project.get("id").and_then(Value::as_str).unwrap_or_default().to_owned(),
            sha256: hash,
        });
    }
    Ok((Manifest{schema:"atlas.store/1".into(),generation,revision,
        root_sha256:Some(checksum(&to_json(&extras)?)),root:Value::Object(extras),projects:blocks},written))
}
fn read_manifest(path: &Path) -> Result<Manifest, String> {
    let manifest: Manifest = serde_json::from_slice(&read_limited(path)?)
        .map_err(|e| err("Неверный индекс хранилища", e))?;
    if manifest.schema != "atlas.store/1" {return Err("Неверная версия индекса".into());}
    if Uuid::parse_str(&manifest.generation).is_err() {
        return Err("Повреждён идентификатор записи".into());
    }
    if manifest.projects.len() > MAX_PROJECTS {return Err("Превышен лимит проектов".into());}
    if let Some(expected)=&manifest.root_sha256{
        if checksum(&to_json(&manifest.root)?)!=*expected {
            return Err("Ошибка целостности индекса портфеля".into());
        }
    }
    Ok(manifest)
}
fn decode(root: &Path, m: &Manifest) -> Result<Value, String> {
    let mut data = m.root.as_object().ok_or("Некорректный индекс")?.clone();
    let mut projects = Vec::with_capacity(m.projects.len());
    for block in &m.projects {
        if block.sha256.len()!=64||!block.sha256.bytes().all(|x|x.is_ascii_hexdigit()){
            return Err("Некорректная ссылка на блок".into());
        }
        let bytes = read_limited(&root.join("blocks").join(format!("{}.json",block.sha256)))?;
        if checksum(&bytes)!=block.sha256 {return Err("Ошибка SHA-256 блока проекта".into());}
        let project: Value = serde_json::from_slice(&bytes).map_err(|e|err("Блок проекта",e))?;
        if project.get("id").and_then(Value::as_str)!=Some(block.id.as_str()) {
            return Err("ID проекта не совпал с индексом".into());
        }
        projects.push(project);
    }
    data.insert("projects".into(),Value::Array(projects));
    let snapshot = Value::Object(data);
    validate_snapshot(&snapshot)?;
    if snapshot.get("revision").and_then(Value::as_u64)!=Some(m.revision) {
        return Err("Редакция индекса не совпадает с данными".into());
    }
    Ok(snapshot)
}
fn current(root: &Path) -> Result<Option<Manifest>, String> {
    let file = root.join("head.json");
    if !file.exists() {return Ok(None);}
    read_manifest(&file).map(Some)
}
fn backup_candidates(root:&Path)->Result<Vec<PathBuf>,String>{
    let mut all = Vec::new();
    for entry in fs::read_dir(root.join("history")).map_err(|e|err("История",e))? {
        let item=entry.map_err(|e|err("История",e))?;
        let path=item.path();
        if path.extension().and_then(|s|s.to_str())==Some("json") {all.push(path);}
    }
    all.sort_by(|a,b|b.file_name().cmp(&a.file_name()));
    Ok(all)
}
fn backup_open(root:&Path)->Result<OpenResult,String>{
    for path in backup_candidates(root)? {
        if let Ok(manifest)=read_manifest(&path) {
            if let Ok(snapshot)=decode(root,&manifest) {
                return Ok(OpenResult{generation:manifest.generation,snapshot,
                    restored_from_backup:true,needs_confirmation:true});
            }
        }
    }
    Err("Основной индекс повреждён; исправная резервная редакция не найдена. Исходные файлы сохранены.".into())
}
// U05: cross-product read of the genuine Atlas Desktop owner store.
// Unlike lock(), this does not create directories, lock files, a manifest,
// project blocks or any second store. The shared file lock coordinates with
// Atlas Desktop's exclusive writer lock on the very same existing file.
fn lock_readonly(root: &Path) -> Result<File, String> {
    if !root.join("head.json").is_file() {
        return Err("ATLAS_PUBLIC_SOURCE_NOT_FOUND".into());
    }
    let lock_file = File::open(root.join("atlas.lock"))
        .map_err(|_| "ATLAS_PUBLIC_LOCK_NOT_FOUND".to_string())?;
    FileExt::lock_shared(&lock_file).map_err(|e| err("Блокировка чтения Atlas", e))?;
    Ok(lock_file)
}
fn read_root_readonly(root: &Path) -> Result<OpenResult, String> {
    let _guard=lock_readonly(root)?;
    load_root(root)
}
// Read the exact historical owner edition without restoring or rewriting it.
// Both the observed head and archived manifest are checked under one existing
// shared lock. A caller cannot select a path, and a damaged matching archive
// is not replaced by a neighbouring revision.
fn read_revision_readonly(root:&Path,expected_generation:&str,revision:u64)
    ->Result<Option<OpenResult>,String>{
    if revision>9_007_199_254_740_991 || Uuid::parse_str(expected_generation).is_err(){
        return Err("ATLAS_HISTORY_REQUEST_INVALID".into());
    }
    let _guard=lock_readonly(root)?;
    let head=load_root(root)?;
    if head.needs_confirmation{return Err("ATLAS_PUBLIC_RECOVERY_REQUIRED".into());}
    if head.generation!=expected_generation{return Err("ATLAS_HISTORY_HEAD_CHANGED".into());}
    let current_revision=head.snapshot.get("revision").and_then(Value::as_u64)
        .ok_or("ATLAS_HISTORY_HEAD_INVALID")?;
    if revision==current_revision{return Ok(Some(head));}
    if revision>current_revision{return Ok(None);}
    let prefix=format!("{:020}-",revision);
    let mut found=None;
    for path in backup_candidates(root)? {
        let Some(name)=path.file_name().and_then(|name|name.to_str()) else{continue};
        if !name.starts_with(&prefix){continue;}
        let manifest=read_manifest(&path)
            .map_err(|_|"ATLAS_HISTORY_EDITION_DAMAGED".to_string())?;
        if manifest.revision!=revision ||
            name!=format!("{:020}-{}.json",manifest.revision,manifest.generation) {
            return Err("ATLAS_HISTORY_EDITION_DAMAGED".into());
        }
        if found.is_some(){return Err("ATLAS_HISTORY_EDITION_AMBIGUOUS".into());}
        let snapshot=decode(root,&manifest)
            .map_err(|_|"ATLAS_HISTORY_EDITION_DAMAGED".to_string())?;
        found=Some(OpenResult{generation:manifest.generation,snapshot,
            restored_from_backup:false,needs_confirmation:false});
    }
    Ok(found)
}
// The standalone signed Result recipient uses the same original read-only
// U05 history reader. No caller-provided file path and no restore.
#[tauri::command]
fn atlas_read_revision(app:AppHandle,expected_generation:String,revision:u64)
    ->Result<Option<OpenResult>,String>{
    read_revision_readonly(&path_for(&app)?,&expected_generation,revision)
}
fn load_root(root:&Path)->Result<OpenResult,String>{
    match current(root) {
        Ok(Some(m))=>match decode(&root,&m){
            Ok(snapshot)=>Ok(OpenResult{generation:m.generation,snapshot,
                restored_from_backup:false,needs_confirmation:false}),
            Err(_)=>backup_open(root),
        },
        Ok(None)=>{
            // Missing head with retained history is not an empty portfolio.
            if !backup_candidates(root)?.is_empty(){return backup_open(root);}
            Ok(OpenResult{generation:"none".into(),
                snapshot:serde_json::json!({"schema":"atlas.project/1","revision":0,"projects":[]}),
                restored_from_backup:false,needs_confirmation:false})
        },
        Err(_)=>backup_open(root),
    }
}
#[tauri::command]
fn atlas_open(app:AppHandle)->Result<OpenResult,String>{
    let root=path_for(&app)?;
    let _guard=lock(&root)?;
    let loaded=load_root(&root);
    // Observability only: the UIA Windows runner may hide WebView2 accessibility
    // nodes. A CI-only, fixed-temp receipt proves React reached the native
    // command through the packaged Tauri bridge without writing portfolio data.
    if std::env::var_os("ATLAS_CI_RENDERER_PROBE").as_deref()==Some(std::ffi::OsStr::new("1")){
        let receipt=std::env::temp_dir().join(format!("iwxa-atlas-renderer-{}.probe",std::process::id()));
        let marker=if loaded.is_ok(){"ATLAS_TAURI_JS_NATIVE_OPEN_PASS"}else{"ATLAS_TAURI_JS_NATIVE_OPEN_ERROR"};
        let _=fs::write(receipt,marker);
    }
    loaded
}
fn commit_root(root:&Path,expected_generation:&str,snapshot:Value)->Result<WriteResult,String>{
    let _guard=lock(root)?;
    let head=current(root)?;
    if head.is_none()&&!backup_candidates(root)?.is_empty(){
        return Err("Отсутствует текущий индекс, но осталась история. Сначала восстановите портфель.".into());
    }
    if let Some(old)=&head{decode(root,old)?;}
    let observed=head.as_ref().map(|m|m.generation.as_str()).unwrap_or("none");
    if observed!=expected_generation {return Err("Данные изменились в другом окне или процессе. Запись отклонена; перечитайте портфель.".into());}
    validate_snapshot(&snapshot)?;
    let revision=snapshot.get("revision").and_then(Value::as_u64).ok_or("Нет редакции")?;
    if let Some(previous)=&head {
        if revision<=previous.revision {return Err("Новая редакция должна быть выше сохранённой".into());}
        // Immutable retained index; old blocks are never deleted during a commit.
        let archived=root.join("history").join(format!("{:020}-{}.json",previous.revision,previous.generation));
        if !archived.exists() {write_new(&archived,&to_json(previous)?)?;}
    }
    let generation=Uuid::new_v4().to_string();
    let (manifest,written)=encode(&root,snapshot,generation.clone())?;
    let manifest_bytes=to_json(&manifest)?;
    check_file_size(manifest_bytes.len(), "Индекс портфеля")?;
    // The first saved portfolio has no previous head to archive. Retain its
    // manifest before publication so loss of head.json cannot reopen an empty
    // portfolio while the first generation's blocks still exist.
    if head.is_none() {
        let archived=root.join("history").join(
            format!("{:020}-{}.json",manifest.revision,manifest.generation));
        write_new(&archived,&manifest_bytes)?;
    }
    publish(&root,&root.join("head.json"),&manifest_bytes)?;
    Ok(WriteResult{generation,revision,project_blocks_written:written})
}
#[tauri::command]
fn atlas_commit(app:AppHandle,expected_generation:String,snapshot:Value)->Result<WriteResult,String>{
    commit_root(&path_for(&app)?,&expected_generation,snapshot)
}
// Recheck the native generation AFTER the file dialog returns; the user may
// leave it open while another Atlas window writes a newer portfolio.
fn export_root(root: &Path, expected_generation: &str, destination: &Path) -> Result<(), String> {
    let bytes={
        let _guard=lock(root)?;
        let head=current(root)?.ok_or("Портфель ещё не сохранён")?;
        if head.generation!=expected_generation {
            return Err("Портфель изменился во время экспорта. Откройте актуальную редакцию.".into());
        }
        let snapshot=decode(root,&head)?;
        serde_json::to_vec_pretty(&snapshot).map_err(|e|err("Экспорт",e))?
    };
    write_export_atomic(destination,&bytes)
}
#[tauri::command]
fn atlas_export_json(app:AppHandle, expected_generation:String)->Result<String,String>{
    let path=app.dialog().file()
        .set_title("Сохранить резервную копию Atlas JSON")
        .set_file_name("atlas-backup.json")
        .add_filter("Atlas JSON",&["json"])
        .blocking_save_file().ok_or("Выбор файла отменён")?;
    let selected=match path {FilePath::Path(p)=>p,_=>return Err("Требуется локальный путь к файлу".into())};
    if selected.extension().and_then(|x|x.to_str()).map(|x|x.to_ascii_lowercase())!=Some("json".into()){
        return Err("Разрешён только файл .json".into());
    }
    export_root(&path_for(&app)?,&expected_generation,&selected)?;
    // A real destination is more useful to the user than the opaque store
    // generation. Report success only after an atomic exported file exists.
    Ok(format!("Резервная копия Atlas сохранена: {}",selected.display()))
}
// Keep the existing native Save As / open dialogs and atomic publisher.
// The verified IWXA carrier is assembled by the Atlas consumer adapter.
#[tauri::command]
fn atlas_export_iwxa(
    app: AppHandle, expected_generation: String, archive_base64: String
)->Result<Option<String>,String>{
    export_iwxa_from_root(&app,&path_for(&app)?,&expected_generation,&archive_base64)
}
// The same owner implementation also exports a Center-owned preparation
// root. The caller resolves its own native scope; the picker and generation
// check remain here. No caller can change the Atlas plan through export.
fn export_iwxa_from_root(
    app:&AppHandle,root:&Path,expected_generation:&str,archive_base64:&str
)->Result<Option<String>,String>{
    if archive_base64.len() > (MAX_IWXA_BYTES / 3 + 1) * 4 + 4 {
        return Err("Архив IWXA слишком большой (максимум 32 МБ)".into());
    }
    let bytes=BASE64.decode(archive_base64).map_err(|_|"Некорректные данные архива IWXA")?;
    if bytes.len() < 22 || bytes.len() > MAX_IWXA_BYTES || !bytes.starts_with(b"PK\x03\x04") {
        return Err("Некорректный контейнер IWXA".into());
    }
    let chosen=app.dialog().file().set_title("Сохранить архив проектов IWXA")
        .set_file_name("atlas-projects.iwxa")
        .add_filter("IWXA", &["iwxa"]).blocking_save_file();
    let Some(FilePath::Path(selected))=chosen else {
        // Closing Save As is a user choice, not a failed export.
        return Ok(None);
    };
    if selected.extension().and_then(|x|x.to_str()).map(|x|x.to_ascii_lowercase())
      !=Some("iwxa".into()) {return Err("Разрешён только файл .iwxa".into());}
    // The picker may stay open while another window saves a newer generation.
    {
        let _guard=lock(root)?;
        let head=current(root)?.ok_or("Сначала сохраните портфель")?;
        if head.generation!=expected_generation{
            return Err("Портфель на диске изменился. Экспорт отменён.".into());
        }
        decode(root,&head)?;
    }
    write_export_atomic(&selected,&bytes)?;
    Ok(Some(format!("Архив IWXA сохранён: {}",selected.display())))
}
#[tauri::command]
fn atlas_select_iwxa(app:AppHandle)->Result<Option<String>,String>{
    let chosen=app.dialog().file().set_title("Открыть архив проектов IWXA")
        .add_filter("IWXA",&["iwxa"]).blocking_pick_file();
    let Some(FilePath::Path(selected))=chosen else{return Ok(None)};
    if selected.extension().and_then(|x|x.to_str()).map(|x|x.to_ascii_lowercase())
      !=Some("iwxa".into()) {return Err("Открывать можно только файлы .iwxa".into());}
    let bytes=read_limited(&selected)?;
    if bytes.len() < 22 || bytes.len()>MAX_IWXA_BYTES {
        return Err("Размер архива IWXA недопустим".into());
    }
    Ok(Some(BASE64.encode(bytes)))
}
#[tauri::command]
fn atlas_select_import(app:AppHandle)->Result<Option<Value>,String>{
    let picked=app.dialog().file().set_title("Открыть архив Atlas JSON")
        .add_filter("Atlas JSON",&["json"]).blocking_pick_file();
    let Some(FilePath::Path(path))=picked else{return Ok(None)};
    if path.extension().and_then(|x|x.to_str()).map(|x|x.to_ascii_lowercase())!=Some("json".into()){
        return Err("Открывать можно только Atlas JSON".into());
    }
    let data:Value=serde_json::from_slice(&read_limited(&path)?)
        .map_err(|e|err("Неверный JSON",e))?;
    validate_snapshot(&data)?;
    Ok(Some(data))
}
fn restore_root(root:&Path)->Result<OpenResult,String>{
    let _guard=lock(root)?;
    // Never permit rollback through a native command when the active head is sound.
    if let Ok(Some(head))=current(root){
        if decode(root,&head).is_ok(){
            return Err("Текущий портфель исправен. Восстановление не требуется.".into());
        }
    }
    let backup=backup_open(root)?;
    // Re-publish only after explicit user confirmation. Keep damaged head in quarantine.
    if root.join("head.json").exists(){
        let quarantine=root.join(format!("head-quarantine-{}.json",Uuid::new_v4()));
        fs::copy(root.join("head.json"),quarantine).map_err(|e|err("Карантин",e))?;
    }
    let previous=read_manifest(
        &backup_candidates(&root)?.into_iter().find(|p| {
            read_manifest(p).ok().and_then(|m|decode(&root,&m).ok()).is_some()
        }).ok_or("Резервная версия не найдена")?
    )?;
    let generation=Uuid::new_v4().to_string();
    let restored=Manifest{generation:generation.clone(),..previous};
    publish(&root,&root.join("head.json"),&to_json(&restored)?)?;
    let verified=read_manifest(&root.join("head.json"))?;
    if decode(root,&verified)?!=backup.snapshot {
        return Err("Восстановленная редакция не совпала при повторном чтении".into());
    }
    Ok(OpenResult{generation,snapshot:backup.snapshot,
        restored_from_backup:true,needs_confirmation:false})
}
// Explicit, user-driven rollback of a healthy portfolio. Unlike repair of a
// damaged head, this is a NEW revision using the existing native store. The
// current head is archived by commit_root before the selected history is
// published, so neither side of the rollback is lost.
fn list_history_root(root: &Path, expected_generation: &str) -> Result<Vec<HistoryEntry>, String> {
    let _guard = lock(root)?;
    let current = load_root(root)?;
    if current.needs_confirmation {
        return Err("Сначала восстановите повреждённое хранилище".into());
    }
    if current.generation != expected_generation {
        return Err("Портфель изменился в другом окне. Повторно откройте историю.".into());
    }
    let mut entries = Vec::new();
    for path in backup_candidates(root)? {
        let Ok(item) = read_manifest(&path) else { continue };
        if item.generation == current.generation || decode(root, &item).is_err() {
            continue;
        }
        entries.push(HistoryEntry {
            generation: item.generation,
            revision: item.revision,
            projects: item.projects.len(),
        });
    }
    Ok(entries)
}
#[tauri::command]
fn atlas_list_history(app: AppHandle, expected_generation: String) -> Result<Vec<HistoryEntry>, String> {
    list_history_root(&path_for(&app)?, &expected_generation)
}

fn restore_history_root(
    root: &Path, expected_generation: &str, history_generation: &str,
) -> Result<OpenResult, String> {
    // Read and verify the selected archive under the same lock as the current
    // head. Release that lock before commit_root, which rechecks generation
    // under its own lock and refuses any competing write.
    let selected = {
        let _guard = lock(root)?;
        let current = load_root(root)?;
        if current.needs_confirmation {
            return Err("Сначала восстановите повреждённое хранилище".into());
        }
        if current.generation != expected_generation {
            return Err("Портфель изменился в другом окне. Восстановление отменено.".into());
        }
        if history_generation == expected_generation {
            return Err("Выбрана текущая редакция, восстановление не требуется".into());
        }
        let mut candidate = None;
        for path in backup_candidates(root)? {
            let Ok(manifest) = read_manifest(&path) else { continue };
            if manifest.generation != history_generation { continue; }
            candidate = Some(decode(root, &manifest)?);
            break;
        }
        let mut snapshot = candidate.ok_or("Выбранная архивная редакция не найдена")?;
        let current_revision = current.snapshot.get("revision").and_then(Value::as_u64)
            .ok_or("Неизвестна редакция текущего портфеля")?;
        let saved_revision = snapshot.get("revision").and_then(Value::as_u64)
            .ok_or("Неизвестна редакция архивного портфеля")?;
        let highest = current_revision.max(saved_revision);
        if highest >= 9_007_199_254_740_991 {
            return Err("Исчерпан номер редакции портфеля".into());
        }
        snapshot["revision"] = Value::from(highest + 1);
        validate_snapshot(&snapshot)?;
        snapshot
    };
    let receipt = commit_root(root, expected_generation, selected.clone())?;
    let _guard = lock(root)?;
    let checked = load_root(root)?;
    if checked.needs_confirmation || checked.generation != receipt.generation
        || checked.snapshot != selected {
        return Err("Восстановленная редакция не совпала при чтении с диска".into());
    }
    Ok(OpenResult {
        generation: receipt.generation,
        snapshot: checked.snapshot,
        restored_from_backup: true,
        needs_confirmation: false,
    })
}
#[tauri::command]
fn atlas_restore_history(
    app: AppHandle, expected_generation: String, history_generation: String,
) -> Result<OpenResult, String> {
    restore_history_root(&path_for(&app)?, &expected_generation, &history_generation)
}

#[tauri::command]
fn atlas_restore_previous(app:AppHandle)->Result<OpenResult,String>{
    restore_root(&path_for(&app)?)
}

#[cfg(test)]
mod persistence_tests{
    use super::*;
    struct Scratch(PathBuf);
    impl Drop for Scratch{fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}
    fn scratch()->Scratch{
        let path=std::env::temp_dir().join(format!("iwxa-atlas-{}",Uuid::new_v4()));
        ensure_dirs(&path).expect("create temporary standalone store");
        Scratch(path)
    }
    fn snapshot(rev:u64,names:&[&str])->Value{
        serde_json::json!({"schema":"atlas.project/1","revision":rev,
        "portfolioLinks":[],"projects":names.iter().enumerate().map(|(i,name)|
          serde_json::json!({"id":format!("project-{i}"),"name":name,"items":[],
          "dependencies":[],"stages":[],"risks":[],"decisions":[],"sources":[]})
        ).collect::<Vec<_>>()})
    }
    #[test]fn empty_starts_clean_without_files(){
        let root=scratch();
        let loaded=load_root(&root.0).expect("open empty Atlas");
        assert_eq!(loaded.generation,"none");
        assert!(!loaded.needs_confirmation);
        assert_eq!(loaded.snapshot["revision"],0);
        assert!(!root.0.join("head.json").exists());
    }
    #[test]fn atomic_commit_readback_immutable_blocks_and_stale_generation(){
        let root=scratch();
        let first=commit_root(&root.0,"none",snapshot(1,&["A","B"])).unwrap();
        assert_eq!(first.project_blocks_written,2);
        let opened=load_root(&root.0).unwrap();
        assert_eq!(opened.generation,first.generation);
        assert_eq!(opened.snapshot["projects"][0]["name"],"A");
        let second=commit_root(&root.0,&first.generation,snapshot(2,&["A","B updated"])).unwrap();
        assert_eq!(second.project_blocks_written,1);
        assert_ne!(first.generation,second.generation);
        let opened_again=load_root(&root.0).unwrap();
        assert_eq!(opened_again.snapshot["revision"],2);
        assert_eq!(opened_again.snapshot["projects"][1]["name"],"B updated");
        assert!(commit_root(&root.0,&first.generation,snapshot(3,&["stale"])).is_err());
        assert_eq!(load_root(&root.0).unwrap().generation,second.generation);
        assert!(restore_root(&root.0).is_err()); // healthy state cannot be rolled back silently
    }
    // Qualify the ORIGINAL U05 file-based Store for the exact Atlas
    // Decision shape used by D6. This is native persistence only; it does
    // not simulate or claim an Agent signature / T3 Exchange permission.
    #[test]
    fn d6_result_decision_is_durable_across_two_cold_native_opens_with_cas() {
        let root=scratch();
        let mut initial=snapshot(1,&["Signed Result destination"]);
        initial["projects"][0]["items"]=serde_json::json!([{
            "id":"work-d6", "title":"Receive Human accepted Result",
            "state":"todo", "estimateDays":3
        }]);
        let first=commit_root(&root.0,"none",initial.clone()).unwrap();
        let operation_id=format!("atlas:t3:{}", "d".repeat(64));
        let record=serde_json::json!({
            "schema":"T3_RESULT_LINK/1",
            "operationId":operation_id,
            "projectId":"project-0",
            "workId":"work-d6",
            "sourceRevision":"1",
            "sourceObjectRef":{
                "workspace_id":"workspace:original",
                "object_id":"result:accepted",
                "schema_id":"iwxa.result",
                "revision":2
            },
            "taskId":"TASK:accepted",
            "resultId":"RESULT:accepted",
            "acceptedDigest":"a".repeat(64),
            "archiveSha256":"b".repeat(64)
        });
        let decision_text=format!("T3_RESULT_LINK/1 {}",record);
        let mut candidate=initial.clone();
        candidate["revision"]=serde_json::json!(2);
        candidate["projects"][0]["decisions"]=serde_json::json!([{
            "id":"decision:original:d6",
            "text":decision_text,
            "date":"2026-11-16"
        }]);
        let committed=commit_root(&root.0,&first.generation,candidate.clone())
            .expect("original U05 CAS commit of D6 Decision");
        assert_eq!(committed.project_blocks_written,1);
        // Drop all local materialized values between independent disk reads.
        let first_cold=load_root(&root.0).expect("first cold native U05 read");
        assert_eq!(first_cold.generation,committed.generation);
        assert_eq!(first_cold.snapshot,candidate);
        let second_cold=load_root(&root.0).expect("second cold native U05 read");
        assert_eq!(second_cold.generation,committed.generation);
        assert_eq!(second_cold.snapshot,first_cold.snapshot);
        assert_eq!(second_cold.snapshot["projects"][0]["decisions"]
            .as_array().unwrap().len(),1);
        assert_eq!(second_cold.snapshot["projects"][0]["items"][0]["state"],"todo");
        // A competing original writer with a stale generation cannot
        // create a second Decision even if it replays the same payload.
        assert!(commit_root(&root.0,&first.generation,candidate).is_err());
        assert_eq!(load_root(&root.0).unwrap().generation,committed.generation);
    }

    #[cfg(windows)]
    #[test]
    fn win32_transient_sharing_violation_keeps_atomic_commit_and_readback(){
        use std::os::windows::fs::OpenOptionsExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ;
        let root=scratch();
        let first=commit_root(&root.0,"none",snapshot(1,&["Original"])).unwrap();
        let head=root.0.join("head.json");
        // This reader permits other readers but not replacement/deletion.
        let held=OpenOptions::new().read(true).share_mode(FILE_SHARE_READ)
            .open(&head).expect("hold existing index without delete sharing");
        let release=std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(350));
            drop(held);
        });
        let result=commit_root(&root.0,&first.generation,snapshot(2,&["Updated"]));
        release.join().expect("release temporary external reader");
        let second=result.expect("bounded Windows sharing violation must resolve");
        assert_ne!(second.generation,first.generation);
        let opened=load_root(&root.0).unwrap();
        assert_eq!(opened.generation,second.generation);
        assert_eq!(opened.snapshot["projects"][0]["name"],"Updated");
        assert_eq!(opened.snapshot["revision"],2);
        assert_eq!(list_history_root(&root.0,&second.generation).unwrap().len(),1);
    }

    #[cfg(windows)]
    #[test]
    fn win32_persistent_sharing_violation_preserves_original_head(){
        use std::os::windows::fs::OpenOptionsExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ;
        let root=scratch();
        let first=commit_root(&root.0,"none",snapshot(1,&["Before"])).unwrap();
        let head=root.0.join("head.json");
        let bytes_before=fs::read(&head).unwrap();
        let held=OpenOptions::new().read(true).share_mode(FILE_SHARE_READ)
            .open(&head).expect("hold existing index without delete sharing");
        let failed=commit_root(&root.0,&first.generation,snapshot(2,&["After"]))
            .expect_err("permanent lock must never permit a false save");
        assert!(failed.contains("Атомарная замена"),"{failed}");
        assert_eq!(fs::read(&head).unwrap(),bytes_before);
        assert_eq!(load_root(&root.0).unwrap().generation,first.generation);
        drop(held);
        let second=commit_root(&root.0,&first.generation,snapshot(2,&["After"]))
            .expect("releasing reader permits explicit retry");
        assert_eq!(load_root(&root.0).unwrap().generation,second.generation);
        assert_eq!(load_root(&root.0).unwrap().snapshot["projects"][0]["name"],"After");
    }

    #[test]fn first_saved_portfolio_recovers_after_head_loss_or_damage(){
        let root=scratch();
        let saved=commit_root(&root.0,"none",snapshot(1,&["First project"])).unwrap();
        assert_eq!(backup_candidates(&root.0).unwrap().len(),1);
        fs::remove_file(root.0.join("head.json")).unwrap();
        let missing=load_root(&root.0).unwrap();
        assert!(missing.needs_confirmation&&missing.restored_from_backup);
        assert_eq!(missing.generation,saved.generation);
        assert_eq!(missing.snapshot["projects"][0]["name"],"First project");
        assert!(commit_root(&root.0,"none",snapshot(2,&["Overwrite"])).is_err());
        let restored=restore_root(&root.0).unwrap();
        assert_eq!(restored.snapshot["projects"][0]["name"],"First project");
        assert!(!restored.needs_confirmation);
        fs::write(root.0.join("head.json"),"{damaged").unwrap();
        let damaged=load_root(&root.0).unwrap();
        assert!(damaged.needs_confirmation);
        assert_eq!(restore_root(&root.0).unwrap().snapshot["revision"],1);
        assert!(fs::read_dir(&root.0).unwrap().any(|entry|
            entry.unwrap().file_name().to_string_lossy().starts_with("head-quarantine-")));
    }
    #[test]fn missing_head_does_not_erase_retained_history(){
        let root=scratch();
        let first=commit_root(&root.0,"none",snapshot(1,&["A"])).unwrap();
        commit_root(&root.0,&first.generation,snapshot(2,&["B"])).unwrap();
        fs::remove_file(root.0.join("head.json")).unwrap();
        let recovery=load_root(&root.0).unwrap();
        assert!(recovery.needs_confirmation);
        assert_eq!(recovery.snapshot["projects"][0]["name"],"A");
        assert!(commit_root(&root.0,"none",snapshot(3,&["C"])).is_err());
        assert!(!root.0.join("head.json").exists());
    }
    #[test]fn corrupted_head_requires_explicit_recovery_and_quarantine(){
        let root=scratch();
        let first=commit_root(&root.0,"none",snapshot(1,&["A"])).unwrap();
        commit_root(&root.0,&first.generation,snapshot(2,&["B"])).unwrap();
        fs::write(root.0.join("head.json"),"{not valid json").unwrap();
        let candidate=load_root(&root.0).unwrap();
        assert!(candidate.restored_from_backup&&candidate.needs_confirmation);
        assert_eq!(candidate.snapshot["revision"],1);
        assert!(commit_root(&root.0,"none",snapshot(3,&["C"])).is_err());
        let result=restore_root(&root.0).unwrap();
        assert!(!result.needs_confirmation);
        assert_eq!(load_root(&root.0).unwrap().snapshot["revision"],1);
        assert!(fs::read_dir(&root.0).unwrap().any(|item|
            item.unwrap().file_name().to_string_lossy().starts_with("head-quarantine-")));
    }
    #[test]fn healthy_history_rollback_preserves_both_editions_and_rejects_stale_generation(){
        let root=scratch();
        let first=commit_root(&root.0,"none",snapshot(1,&["Before import"])).unwrap();
        let second=commit_root(&root.0,&first.generation,snapshot(2,&["After import"])).unwrap();
        let entries=list_history_root(&root.0,&second.generation).unwrap();
        assert_eq!(entries.len(),1);
        assert_eq!(entries[0].generation,first.generation);
        assert_eq!(entries[0].revision,1);
        assert_eq!(entries[0].projects,1);
        assert!(restore_history_root(&root.0,&first.generation,&first.generation).is_err());
        let restored=restore_history_root(&root.0,&second.generation,&first.generation).unwrap();
        assert_eq!(restored.snapshot["revision"],3);
        assert_eq!(restored.snapshot["projects"][0]["name"],"Before import");
        assert!(!restored.needs_confirmation);
        assert_eq!(load_root(&root.0).unwrap().generation,restored.generation);
        assert!(restore_history_root(&root.0,&second.generation,&first.generation).is_err());
        let revisions=list_history_root(&root.0,&restored.generation).unwrap();
        assert!(revisions.iter().any(|r| r.generation==second.generation));
        let undone=restore_history_root(&root.0,&restored.generation,&second.generation).unwrap();
        assert_eq!(undone.snapshot["revision"],4);
        assert_eq!(undone.snapshot["projects"][0]["name"],"After import");
        assert_eq!(load_root(&root.0).unwrap().generation,undone.generation);
    }
    #[test]fn exact_history_read_is_non_mutating_and_bound_to_current_head(){
        let root=scratch();
        let first=commit_root(&root.0,"none",snapshot(1,&["Before"])).unwrap();
        let second=commit_root(&root.0,&first.generation,snapshot(3,&["After"])).unwrap();
        let head_path=root.0.join("head.json");
        let before=fs::read(&head_path).unwrap();
        let archive=backup_candidates(&root.0).unwrap().into_iter()
            .find(|p|p.to_string_lossy().contains(&first.generation)).unwrap();
        let archive_before=fs::read(&archive).unwrap();
        let original=read_revision_readonly(&root.0,&second.generation,1).unwrap().unwrap();
        assert_eq!(original.generation,first.generation);
        assert_eq!(original.snapshot["projects"][0]["name"],"Before");
        assert_eq!(read_revision_readonly(&root.0,&second.generation,3).unwrap().unwrap().generation,second.generation);
        assert!(read_revision_readonly(&root.0,&second.generation,2).unwrap().is_none());
        assert!(read_revision_readonly(&root.0,&second.generation,4).unwrap().is_none());
        assert_eq!(read_revision_readonly(&root.0,&first.generation,1).err().unwrap(),"ATLAS_HISTORY_HEAD_CHANGED");
        assert_eq!(fs::read(&head_path).unwrap(),before);
        assert_eq!(fs::read(&archive).unwrap(),archive_before);
        fs::write(&archive,b"corrupt").unwrap();
        assert_eq!(read_revision_readonly(&root.0,&second.generation,1).err().unwrap(),"ATLAS_HISTORY_EDITION_DAMAGED");
        assert_eq!(fs::read(&head_path).unwrap(),before);
    }
    #[test]fn damaged_archive_cannot_replace_healthy_portfolio(){
        let root=scratch();
        let first=commit_root(&root.0,"none",snapshot(1,&["Keep"])).unwrap();
        let second=commit_root(&root.0,&first.generation,snapshot(2,&["Current"])).unwrap();
        let archive=backup_candidates(&root.0).unwrap().into_iter()
            .find(|p| p.to_string_lossy().contains(&first.generation)).unwrap();
        fs::write(&archive,b"corrupt").unwrap();
        assert!(restore_history_root(&root.0,&second.generation,&first.generation).is_err());
        assert_eq!(load_root(&root.0).unwrap().snapshot["projects"][0]["name"],"Current");
    }
    #[test]fn backup_export_is_atomic_no_overwrite_and_roundtrips_after_a_relaunch(){
        let root=scratch();
        let first=commit_root(&root.0,"none",snapshot(1,&["Personal","Research"])).unwrap();
        let backup=root.0.join("atlas-backup.json");
        export_root(&root.0,&first.generation,&backup).unwrap();
        let original=fs::read(&backup).unwrap();
        let imported:Value=serde_json::from_slice(&original).unwrap();
        assert_eq!(imported,load_root(&root.0).unwrap().snapshot);
        assert!(export_root(&root.0,&first.generation,&backup).is_err());
        assert_eq!(fs::read(&backup).unwrap(),original);
        let second=commit_root(&root.0,&first.generation,snapshot(2,&["Updated"])).unwrap();
        let obsolete=root.0.join("stale.json");
        assert!(export_root(&root.0,&first.generation,&obsolete).is_err());
        assert!(!obsolete.exists());
        export_root(&root.0,&second.generation,&obsolete).unwrap();
        assert_eq!(serde_json::from_slice::<Value>(&fs::read(&obsolete).unwrap()).unwrap(),
            load_root(&root.0).unwrap().snapshot);
        assert!(!fs::read_dir(&root.0).unwrap().any(|entry|
            entry.unwrap().file_name().to_string_lossy().contains(".pending")));
    }
    #[test]fn export_and_block_sizes_cannot_exceed_next_open_import_limit(){
        assert!(check_file_size(MAX_FILE as usize,"Блок").is_ok());
        assert!(check_file_size(MAX_FILE as usize+1,"Блок").is_err());
        let root=scratch();
        let existing=root.0.join("existing.json");
        fs::write(&existing,b"previous backup").unwrap();
        assert!(write_export_atomic(&existing,b"never replace").is_err());
        assert_eq!(fs::read(existing).unwrap(),b"previous backup");
    }
    // R5 qualifies the same native store used by the installed Tauri GUI.
    // The input JSON is generated by the existing public 120-project fixture.
    // This is a native I/O qualification, never labelled a GUI rendering test.
    #[test]fn native_r5_scale_and_incremental_readback(){
        let path=match std::env::var("ATLAS_R5_PORTFOLIO_JSON"){
            Ok(path)=>path,
            Err(_)=>{
                println!("ATLAS_R5_NATIVE_NOT_QUALIFIED: set ATLAS_R5_PORTFOLIO_JSON");
                return;
            }
        };
        let raw=fs::read(&path).expect("read deterministic 120-project fixture");
        let mut data:Value=serde_json::from_slice(&raw).expect("parse R5 JSON");
        validate_snapshot(&data).expect("native R5 schema");
        let projects=data["projects"].as_array().expect("projects");
        assert_eq!(projects.len(),120);
        assert_eq!(projects.iter().map(|p|p["items"].as_array().unwrap().len()).sum::<usize>(),1200);
        assert_eq!(projects.iter().map(|p|p["dependencies"].as_array().unwrap().len()).sum::<usize>(),300);
        assert_eq!(data["portfolioLinks"].as_array().unwrap().len(),40);
        assert_eq!(projects.iter().map(|p|p["findings"].as_array().unwrap().len()).sum::<usize>(),200);
        assert_eq!(projects.iter().map(|p|p["decisions"].as_array().unwrap().len()).sum::<usize>(),100);
        let root=scratch();
        let start=std::time::Instant::now();
        let first=commit_root(&root.0,"none",data.clone()).expect("first native write");
        let first_ms=start.elapsed().as_millis();
        assert_eq!(first.project_blocks_written,120);
        let start=std::time::Instant::now();
        let read=load_root(&root.0).expect("first native readback");
        let read_ms=start.elapsed().as_millis();
        assert_eq!(read.snapshot,data);
        let preserved=data["projects"][119].clone();
        let mut previous=first.generation.clone();
        let start=std::time::Instant::now();
        for index in 0..20usize {
            data["revision"]=serde_json::json!(index+1);
            data["projects"][index]["items"][0]["estimateDays"]=serde_json::json!(index+2);
            let written=commit_root(&root.0,&previous,data.clone()).expect("incremental native write");
            assert_eq!(written.project_blocks_written,1,
                "a single changed project should create exactly one block");
            let opened=load_root(&root.0).expect("incremental native readback");
            assert_eq!(opened.generation,written.generation);
            assert_eq!(opened.snapshot,data);
            previous=written.generation;
        }
        let updates_ms=start.elapsed().as_millis();
        assert_eq!(load_root(&root.0).unwrap().snapshot["projects"][119],preserved);
        assert_eq!(list_history_root(&root.0,&previous).unwrap().len(),20);
        assert!(commit_root(&root.0,&first.generation,data.clone()).is_err(),
                "a stale writer must never replace current data");
        assert_eq!(load_root(&root.0).unwrap().generation,previous);
        println!("ATLAS_R5_NATIVE_STORE_PASS projects=120 works=1200 workLinks=300 portfolioLinks=40 findings=200 decisions=100 edits=20 firstWriteMs={} firstReadMs={} updatesMs={}",
            first_ms,read_ms,updates_ms);
    }
    #[test]fn u05_readonly_owner_observation_does_not_create_or_modify_source() {
        let root=scratch();
        assert!(read_root_readonly(&root.0).is_err());
        assert!(!root.0.join("atlas.lock").exists());
        assert!(!root.0.join("head.json").exists());
        let first=commit_root(&root.0,"none",snapshot(1,&["Canonical"])).unwrap();
        let head_before=fs::read(root.0.join("head.json")).unwrap();
        let blocks_before=fs::read_dir(root.0.join("blocks")).unwrap().count();
        let history_before=fs::read_dir(root.0.join("history")).unwrap().count();
        let opened=read_root_readonly(&root.0).unwrap();
        assert_eq!(opened.generation,first.generation);
        assert_eq!(opened.snapshot["revision"],1);
        assert!(!opened.needs_confirmation);
        let next=commit_root(&root.0,&first.generation,snapshot(2,&["Updated"])).unwrap();
        let observed=read_root_readonly(&root.0).unwrap();
        assert_eq!(observed.generation,next.generation);
        assert_eq!(observed.snapshot["revision"],2);
        assert_ne!(observed.generation,opened.generation);
        assert_eq!(fs::read_dir(root.0.join("blocks")).unwrap().count(),blocks_before+1);
        // First commit already archives its manifest. A subsequent commit
        // must reuse that archive rather than duplicate the same generation.
        assert_eq!(fs::read_dir(root.0.join("history")).unwrap().count(),history_before);
        assert_ne!(fs::read(root.0.join("head.json")).unwrap(),head_before);
        // Reading the canonical source has no side effects on its manifest.
        let after_read=fs::read(root.0.join("head.json")).unwrap();
        let again=read_root_readonly(&root.0).unwrap();
        assert_eq!(again.generation,observed.generation);
        assert_eq!(fs::read(root.0.join("head.json")).unwrap(),after_read);
        fs::remove_file(root.0.join("atlas.lock")).unwrap();
        assert!(read_root_readonly(&root.0).is_err());
        assert!(!root.0.join("atlas.lock").exists());
    }
    #[test]fn invalid_root_and_missing_backup_never_return_empty_portfolio(){
        let root=scratch();
        fs::write(root.0.join("head.json"),"{broken").unwrap();
        assert!(load_root(&root.0).is_err());
        assert!(restore_root(&root.0).is_err());
        assert_eq!(fs::read(root.0.join("head.json")).unwrap(),b"{broken");
    }
}
// Optional local launch argument for the existing WorkRef. It carries no
// grant and never changes the native Store. Atlas validates its own saved
// snapshot before navigating. Older consumers may simply launch the GUI.
fn launch_work_ref(args:&[String])->Result<Option<Value>,String>{
    if args.first().map(String::as_str)!=Some("--iwxa-open-work"){
        return Ok(None);
    }
    let valid_id=|s:&str| !s.is_empty()&&s.len()<=256&&!s.chars().any(char::is_control);
    if args.len()!=4 || !valid_id(&args[1]) || !valid_id(&args[2]){
        return Err("ATLAS_WORK_REFERENCE_INVALID".into());
    }
    let revision=&args[3];
    if revision.is_empty()||!revision.bytes().all(|b|b.is_ascii_digit())||
        (revision.len()>1&&revision.starts_with('0'))||
        !revision.parse::<u64>().is_ok_and(|n|n<=9_007_199_254_740_991){
        return Err("ATLAS_WORK_REFERENCE_INVALID".into());
    }
    Ok(Some(serde_json::json!({"projectId":args[1],"workId":args[2],"revision":revision})))
}
#[tauri::command]
fn atlas_launch_work_ref()->Result<Option<Value>,String>{
    let args=std::env::args_os().skip(1).map(|arg|arg.into_string()
        .map_err(|_|"ATLAS_WORK_REFERENCE_INVALID".to_string()))
        .collect::<Result<Vec<_>,_>>()?;
    launch_work_ref(&args)
}
// A local Windows navigation request carries ONLY an existing WorkRef.
// It is not a permission, project write, Exchange carrier or network service.
// The same original saved-head check is used for CLI, pasted and window links.
fn parse_window_work_ref(bytes:&[u8])->Result<Value,String>{
    if bytes.is_empty()||bytes.len()>2048{return Err("ATLAS_WORK_REFERENCE_INVALID".into());}
    let raw:Value=serde_json::from_slice(bytes).map_err(|_|"ATLAS_WORK_REFERENCE_INVALID")?;
    let obj=raw.as_object().ok_or("ATLAS_WORK_REFERENCE_INVALID")?;
    if obj.len()!=3{return Err("ATLAS_WORK_REFERENCE_INVALID".into());}
    let args=vec!["--iwxa-open-work".to_string(),
        obj.get("projectId").and_then(Value::as_str).ok_or("ATLAS_WORK_REFERENCE_INVALID")?.into(),
        obj.get("workId").and_then(Value::as_str).ok_or("ATLAS_WORK_REFERENCE_INVALID")?.into(),
        obj.get("revision").and_then(Value::as_str).ok_or("ATLAS_WORK_REFERENCE_INVALID")?.into()];
    launch_work_ref(&args)?.ok_or("ATLAS_WORK_REFERENCE_INVALID".into())
}

#[cfg(windows)]
mod work_navigation_windows {
    use super::{parse_window_work_ref,Value};
    use std::{ffi::c_void,sync::Mutex};
    use tauri::{AppHandle,Emitter};

    const WM_COPYDATA:u32=0x004a;
    const WM_NCDESTROY:u32=0x0082;
    // Property means this window implements the navigation operation, NOT
    // that a particular product release is required.
    const PROPERTY:&str="IWXA.Atlas.NavigateWork";
    const DATA_KIND:usize=0x49575841;
    const SUBCLASS:usize=0x41544c53;
    static PENDING:Mutex<Option<Value>>=Mutex::new(None);

    #[repr(C)]
    struct CopyData {kind:usize,len:u32,data:*mut c_void}
    type SubclassProc=unsafe extern "system" fn(isize,u32,usize,isize,usize,usize)->isize;
    #[link(name="comctl32")]
    unsafe extern "system" {
        fn SetWindowSubclass(hwnd:isize,proc:Option<SubclassProc>,id:usize,reference:usize)->i32;
        fn RemoveWindowSubclass(hwnd:isize,proc:Option<SubclassProc>,id:usize)->i32;
        fn DefSubclassProc(hwnd:isize,msg:u32,w:usize,l:isize)->isize;
    }
    #[link(name="user32")]
    unsafe extern "system" {
        fn SetPropW(hwnd:isize,name:*const u16,value:isize)->i32;
        fn GetPropW(hwnd:isize,name:*const u16)->isize;
        fn RemovePropW(hwnd:isize,name:*const u16)->isize;
        fn GetWindowThreadProcessId(hwnd:isize,pid:*mut u32)->u32;
        fn SendMessageTimeoutW(hwnd:isize,msg:u32,w:usize,l:isize,
            flags:u32,timeout:u32,result:*mut usize)->isize;
    }
    fn property()->Vec<u16>{PROPERTY.encode_utf16().chain(Some(0)).collect()}
    unsafe extern "system" fn receive(hwnd:isize,msg:u32,w:usize,l:isize,
        _id:usize,reference:usize)->isize{
        if msg==WM_COPYDATA&&l!=0{
            // Windows owns the COPYDATA buffer for the lifetime of this
            // synchronous message. Never keep its pointer after returning.
            let data=&*(l as *const CopyData);
            if data.kind==DATA_KIND {
                if data.data.is_null()||data.len==0||data.len>2048{return 0;}
                let bytes=std::slice::from_raw_parts(data.data.cast::<u8>(),data.len as usize);
                let Ok(work)=parse_window_work_ref(bytes) else{return 0};
                let Ok(mut pending)=PENDING.lock() else{return 0};
                if pending.is_some(){return 0;}
                *pending=Some(work);
                drop(pending);
                let app=&*(reference as *const AppHandle);
                // The React listener only asks native for the queued WorkRef.
                // A listener not yet mounted also drains it on startup.
                let _=app.emit("atlas-work-reference-available",());
                return 1;
            }
        }
        if msg==WM_NCDESTROY {
            RemovePropW(hwnd,property().as_ptr());
            RemoveWindowSubclass(hwnd,Some(receive),SUBCLASS);
            if let Ok(mut pending)=PENDING.lock(){*pending=None;}
            drop(Box::from_raw(reference as *mut AppHandle));
        }
        DefSubclassProc(hwnd,msg,w,l)
    }
    pub(super) fn install(hwnd:isize,app:AppHandle)->Result<(),String>{
        let reference=Box::into_raw(Box::new(app));
        unsafe {
            if SetWindowSubclass(hwnd,Some(receive),SUBCLASS,reference as usize)==0 {
                drop(Box::from_raw(reference));
                return Err("ATLAS_WORK_NAVIGATION_WINDOW_UNAVAILABLE".into());
            }
            if SetPropW(hwnd,property().as_ptr(),1)==0 {
                RemoveWindowSubclass(hwnd,Some(receive),SUBCLASS);
                drop(Box::from_raw(reference));
                return Err("ATLAS_WORK_NAVIGATION_WINDOW_UNAVAILABLE".into());
            }
        }
        Ok(())
    }
    pub(super) fn take()->Result<Option<Value>,String>{
        Ok(PENDING.lock().map_err(|_|"ATLAS_WORK_NAVIGATION_UNAVAILABLE")?.take())
    }
    // The caller supplies only a window and PID already verified by U04.
    // Recheck the OS window owner and the capability immediately before
    // sending. No app version allowlist and no arbitrary HWND from React.
    pub(crate) fn send(hwnd:isize,pid:u32,work:&Value)->&'static str{
        let Ok(bytes)=serde_json::to_vec(work) else{return "REQUEST_INVALID"};
        if parse_window_work_ref(&bytes).is_err(){return "REQUEST_INVALID";}
        let mut actual=0u32;
        unsafe {
            if GetWindowThreadProcessId(hwnd,&mut actual)==0||actual!=pid{
                return "WINDOW_NOT_FOUND";
            }
            if GetPropW(hwnd,property().as_ptr())!=1{return "NOT_SUPPORTED";}
            let payload=CopyData{kind:DATA_KIND,len:bytes.len() as u32,
                data:bytes.as_ptr() as *mut c_void};
            let mut result=0usize;
            let delivered=SendMessageTimeoutW(hwnd,WM_COPYDATA,0,
                (&payload as *const CopyData) as isize,0x0002|0x0020,1000,&mut result);
            if delivered==0{return "REQUEST_UNCONFIRMED";}
            if result!=1{return "REQUEST_NOT_QUEUED";}
        }
        "REQUEST_QUEUED"
    }
}
#[tauri::command]
fn atlas_take_work_ref()->Result<Option<Value>,String>{
    #[cfg(windows)]
    {work_navigation_windows::take()}
    #[cfg(not(windows))]
    {Ok(None)}
}
#[cfg(test)]
mod launch_work_tests {
    use super::*;
    #[test]
    fn window_reference_contains_only_exact_navigation_fields(){
        let input=serde_json::json!({"projectId":"p","workId":"w","revision":"42"});
        assert_eq!(parse_window_work_ref(&serde_json::to_vec(&input).unwrap()).unwrap(),input);
        for invalid in [
            serde_json::json!({"projectId":"p","workId":"w","revision":42}),
            serde_json::json!({"projectId":"p","workId":"w","revision":"042"}),
            serde_json::json!({"projectId":"p","workId":"w","revision":"42","action":"save"}),
            serde_json::json!({"projectId":"p","workId":"w\n","revision":"42"}),
            serde_json::json!({"projectId":"p","revision":"42"})
        ]{
            assert!(parse_window_work_ref(&serde_json::to_vec(&invalid).unwrap()).is_err());
        }
        assert!(parse_window_work_ref(&vec![b'a';2049]).is_err());
    }
    #[test]
    fn startup_work_arguments_are_exact_and_optional(){
        let args=|values:&[&str]|values.iter().map(|s|s.to_string()).collect::<Vec<_>>();
        assert_eq!(launch_work_ref(&[]).unwrap(),None);
        assert_eq!(launch_work_ref(&args(&["--other"])).unwrap(),None);
        let result=launch_work_ref(&args(&["--iwxa-open-work","p","w","42"])).unwrap().unwrap();
        assert_eq!(result,serde_json::json!({"projectId":"p","workId":"w","revision":"42"}));
        for bad in [args(&["--iwxa-open-work","p","w","042"]),
            args(&["--iwxa-open-work","p","w","9007199254740992"]),
            args(&["--iwxa-open-work","p","w","42","extra"]),
            args(&["--iwxa-open-work","p"])]{
            assert!(launch_work_ref(&bad).is_err());
        }
    }
}
// Only the original bundled T3 Consumer validates a signed .iwxa Result.
// A standard public Atlas installation remains fully functional without it.
// No access engine, signer or new project storage is implemented in Rust.
#[cfg(windows)]
fn atlas_t3_original_consumer(app:&AppHandle)->Result<PathBuf,String>{
    let expected=option_env!("IWXA_T3_CONSUMER_SHA256")
        .ok_or("ATLAS_T3_ORIGINAL_COMPONENT_NOT_BUNDLED")?;
    if expected.len()!=64||!expected.bytes().all(|b|b.is_ascii_digit()||
        (b'a'..=b'f').contains(&b)){
        return Err("ATLAS_T3_ORIGINAL_COMPONENT_PIN_INVALID".into());
    }
    let file=app.path().resource_dir()
        .map_err(|_|"ATLAS_T3_RESOURCE_ROOT_UNAVAILABLE")?
        .join("t3").join("iwxa-t3-product-consumer.exe");
    let meta=fs::symlink_metadata(&file)
        .map_err(|_|"ATLAS_T3_ORIGINAL_COMPONENT_NOT_BUNDLED")?;
    if !meta.is_file()||meta.file_type().is_symlink(){
        return Err("ATLAS_T3_ORIGINAL_COMPONENT_INVALID".into());
    }
    let mut stream=File::open(&file).map_err(|_|"ATLAS_T3_ORIGINAL_COMPONENT_UNREADABLE")?;
    let mut digest=Sha256::new();
    let mut buf=[0_u8;64*1024];
    loop{
        let size=stream.read(&mut buf).map_err(|_|"ATLAS_T3_ORIGINAL_COMPONENT_UNREADABLE")?;
        if size==0{break;}
        digest.update(&buf[..size]);
    }
    if format!("{:x}",digest.finalize())!=expected{
        return Err("ATLAS_T3_ORIGINAL_COMPONENT_MISMATCH".into());
    }
    Ok(file)
}

#[cfg(windows)]
fn atlas_t3_local_roots(app:&AppHandle)->Result<(PathBuf,PathBuf),String>{
    let store=path_for(app)?;
    let recipient=store.parent().ok_or("ATLAS_T3_DATA_ROOT_UNAVAILABLE")?.join("t3-atlas");
    // Setup Core may place either product's data outside LocalAppData.
    // Only the installed original product location, never a UI path.
    let center=if let Some(root)=atlas_setup_product_data_root("iwxa.admin-center")?{
        root
    }else{
        let original=app.path().app_local_data_dir()
            .map_err(|_|"ATLAS_T3_DATA_ROOT_UNAVAILABLE")?;
        if original.file_name().and_then(|n|n.to_str())!=Some("ru.iwxa.atlas"){
            return Err("ATLAS_T3_DATA_SCOPE_INVALID".into());
        }
        original.parent().ok_or("ATLAS_T3_DATA_ROOT_UNAVAILABLE")?.join("ru.iwxa.admin-center")
    };
    Ok((recipient,center.join("t3-admin").join("organizations")))
}

#[cfg(windows)]
fn atlas_t3_consumer_call(app:&AppHandle,action:&str,file:Option<&str>)->Result<Value,String>{
    use std::{process::{Command,Stdio},os::windows::process::CommandExt,
        thread,time::{Duration,Instant}};
    if !matches!(action,"atlas-capabilities"|"atlas-inspect"|"atlas-readback"){
        return Err("ATLAS_T3_ORIGINAL_OPERATION_UNSUPPORTED".into());
    }
    let binary=atlas_t3_original_consumer(app)?;
    let (root,center)=atlas_t3_local_roots(app)?;
    let mut command=Command::new(binary);
    command.arg(action).arg(root).arg(center);
    if let Some(path)=file{command.arg(path);}
    let mut child=command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .creation_flags(0x08000000).spawn().map_err(|_|"ATLAS_T3_ORIGINAL_COMPONENT_START_FAILED")?;
    let stdout=child.stdout.take().ok_or("ATLAS_T3_ORIGINAL_OUTPUT_UNAVAILABLE")?;
    let stderr=child.stderr.take().ok_or("ATLAS_T3_ORIGINAL_OUTPUT_UNAVAILABLE")?;
    let drain=|mut source:Box<dyn Read+Send>|->Result<Vec<u8>,String>{
        let mut result=Vec::new();let mut buf=[0_u8;8192];let mut overflow=false;
        loop{
            let n=source.read(&mut buf).map_err(|_|"ATLAS_T3_ORIGINAL_OUTPUT_INVALID")?;
            if n==0{break;}
            if result.len()+n<=512*1024&&!overflow{result.extend_from_slice(&buf[..n]);}
            else{overflow=true;}
        }
        if overflow{return Err("ATLAS_T3_ORIGINAL_OUTPUT_TOO_LARGE".into());}
        Ok(result)
    };
    let out=thread::spawn(move||drain(Box::new(stdout)));
    let errors=thread::spawn(move||drain(Box::new(stderr)));
    let start=Instant::now();
    let status=loop{
        match child.try_wait(){
            Ok(Some(status))=>break Ok(status),
            Ok(None) if start.elapsed()<Duration::from_secs(90)=>thread::sleep(Duration::from_millis(25)),
            _=>{
                let _=child.kill();let _=child.wait();
                break Err("ATLAS_T3_ORIGINAL_COMPONENT_TIMEOUT");
            }
        }
    };
    let out=out.join().map_err(|_|"ATLAS_T3_ORIGINAL_OUTPUT_INVALID")??;
    let errors=errors.join().map_err(|_|"ATLAS_T3_ORIGINAL_OUTPUT_INVALID")??;
    if !status?.success(){
        let raw=String::from_utf8_lossy(&errors);
        let code=raw.lines().next().unwrap_or("").trim();
        if code.starts_with("T3_ATLAS_")&&code.len()<=150&&
           code.bytes().all(|b|b.is_ascii_uppercase()||b.is_ascii_digit()||b==b'_'){
            return Err(code.to_owned());
        }
        return Err("ATLAS_T3_ORIGINAL_COMPONENT_REFUSED".into());
    }
    let value:Value=serde_json::from_slice(&out).map_err(|_|"ATLAS_T3_ORIGINAL_OUTPUT_INVALID")?;
    if value["schema"]!="IWXA_T3_ATLAS_NATIVE_RECIPIENT/1"||value["recipientId"]!="iwxa.atlas"{
        return Err("ATLAS_T3_ORIGINAL_RECEIPT_INVALID".into());
    }
    if action=="atlas-capabilities"{
        if value["status"]!="ORIGINAL_COMPONENT_AVAILABLE"||value["sameWindowsAccount"]!=true{
            return Err("ATLAS_T3_ORIGINAL_CAPABILITY_INVALID".into());
        }
        return Ok(value);
    }
    let row=&value["result"];
    if row["status"]!="ORIGINAL_SIGNED_SELECTED_RESULT_VERIFIED"||
       row["recipientId"]!="iwxa.atlas"||row["sourceKind"]!="ADMIN_APPLIED_RESULT"||
       row["signatureVerified"]!=true||row["archiveBytesVerified"]!=true||
       row["originalManifestVerified"]!=true||row["recipientGrantVerified"]!=true||
       row["originalKernelEventVerified"]!=false{
        return Err("ATLAS_T3_ORIGINAL_RECEIPT_INVALID".into());
    }
    Ok(row.clone())
}

#[tauri::command]
async fn atlas_t3_capabilities(app:AppHandle)->Result<Value,String>{
    #[cfg(windows)]
    {
        return tauri::async_runtime::spawn_blocking(move||{
            if option_env!("IWXA_T3_CONSUMER_SHA256").is_none(){
                return Ok(serde_json::json!({"available":false}));
            }
            let proof=atlas_t3_consumer_call(&app,"atlas-capabilities",None)?;
            Ok(serde_json::json!({"available":true,"recipientId":"iwxa.atlas",
                "sameWindowsAccount":proof["sameWindowsAccount"]}))
        }).await.map_err(|_|"ATLAS_T3_NATIVE_WORKER_FAILED".to_owned())?;
    }
    #[cfg(not(windows))]
    { let _=app;Ok(serde_json::json!({"available":false})) }
}
#[tauri::command]
async fn atlas_t3_inspect(app:AppHandle,archive_base64:String)->Result<Value,String>{
    #[cfg(windows)]
    {
        return tauri::async_runtime::spawn_blocking(move||{
            if archive_base64.len()>((MAX_IWXA_BYTES+2)/3)*4{
                return Err("ATLAS_T3_SIGNED_FILE_TOO_LARGE".into());
            }
            let bytes=BASE64.decode(&archive_base64).map_err(|_|"ATLAS_T3_SIGNED_FILE_INVALID")?;
            if bytes.len()<22||bytes.len()>MAX_IWXA_BYTES{
                return Err("ATLAS_T3_SIGNED_FILE_INVALID".into());
            }
            // The native component must read the exact selected bytes. A
            // fixed app-owned scratch file is removed even on a refusal.
            let (root,_)=atlas_t3_local_roots(&app)?;
            let scratch=root.join("temporary");
            fs::create_dir_all(&scratch).map_err(|_|"ATLAS_T3_TEMPORARY_DIRECTORY_FAILED")?;
            struct Scratch(PathBuf);
            impl Drop for Scratch{fn drop(&mut self){let _=fs::remove_file(&self.0);}}
            let selected=scratch.join(format!("{}.iwxa",Uuid::new_v4()));
            let mut file=OpenOptions::new().create_new(true).write(true).open(&selected)
                .map_err(|_|"ATLAS_T3_TEMPORARY_FILE_FAILED")?;
            let path=Scratch(selected);
            file.write_all(&bytes).and_then(|_|file.sync_all()).map_err(|_|"ATLAS_T3_TEMPORARY_FILE_FAILED")?;
            drop(file);
            let selected=path.0.to_str().ok_or("ATLAS_T3_TEMPORARY_FILE_PATH_INVALID")?;
            let proof=atlas_t3_consumer_call(&app,"atlas-inspect",Some(selected))?;
            if proof["archiveSha256"].as_str()!=Some(checksum(&bytes).as_str()){
                return Err("ATLAS_T3_ORIGINAL_ARCHIVE_MISMATCH".into());
            }
            Ok(proof)
        }).await.map_err(|_|"ATLAS_T3_NATIVE_WORKER_FAILED".to_owned())?;
    }
    #[cfg(not(windows))]
    {let _=(app,archive_base64);Err("ATLAS_T3_NATIVE_WINDOWS_REQUIRED".into())}
}
#[tauri::command]
async fn atlas_t3_readback(app:AppHandle,archive_sha256:String)->Result<Value,String>{
    if archive_sha256.len()!=64||!archive_sha256.bytes().all(|b|
        b.is_ascii_digit()||(b'a'..=b'f').contains(&b)){
        return Err("ATLAS_T3_ORIGINAL_ARCHIVE_HASH_INVALID".into());
    }
    #[cfg(windows)]
    {
        return tauri::async_runtime::spawn_blocking(move||{
            let proof=atlas_t3_consumer_call(&app,"atlas-readback",Some(&archive_sha256))?;
            if proof["archiveSha256"].as_str()!=Some(archive_sha256.as_str()){
                return Err("ATLAS_T3_ORIGINAL_ARCHIVE_MISMATCH".into());
            }
            Ok(proof)
        }).await.map_err(|_|"ATLAS_T3_NATIVE_WORKER_FAILED".to_owned())?;
    }
    #[cfg(not(windows))]
    {let _=app;Err("ATLAS_T3_NATIVE_WINDOWS_REQUIRED".into())}
}

pub fn run(){
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app|{
            #[cfg(windows)]
            if let Some(window)=app.get_webview_window("main"){
                // Navigation support is optional. A failure does not prevent
                // Atlas starting or using its existing manual WorkRef route.
                if let Ok(hwnd)=window.hwnd(){
                    let _=work_navigation_windows::install(hwnd.0 as isize,app.handle().clone());
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            atlas_open,atlas_commit,atlas_export_json,atlas_select_import,
            atlas_export_iwxa,atlas_select_iwxa,atlas_restore_previous,
            atlas_list_history,atlas_restore_history,atlas_launch_work_ref,atlas_take_work_ref,
            atlas_read_revision,atlas_t3_capabilities,atlas_t3_inspect,atlas_t3_readback
        ])
        .run(tauri::generate_context!())
        .expect("IWXA Atlas desktop window could not be started");
}
