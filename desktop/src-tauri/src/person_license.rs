// Atlas delegates all license verification, Ed25519 trust, status floors and
// protected persistence to the privately compiled ORIGINAL T3 consumer.
// This public native bridge only selects a local file and transports bounded
// arguments/results. No license keys, crypto, signer, Trust Store or IAM here.
use serde_json::Value;
use std::path::{Path,PathBuf};
use std::process::{Command,Stdio};
use std::time::{Duration,Instant};
use tauri::{AppHandle,Manager};
use tauri_plugin_dialog::{DialogExt,FilePath};

const PRODUCT:&str="IWXA_ATLAS";
const LIMIT:u64=4*1024*1024;
const OUT_CAP:usize=256*1024;
const TIMEOUT:Duration=Duration::from_secs(60);

fn code(message:&str)->String{
    let s=message.trim();
    if !s.is_empty()&&s.len()<=160&&s.bytes().all(|b|
        b.is_ascii_uppercase()||b.is_ascii_digit()||b==b'_') {
        s.to_string()
    }else{"ATLAS_PERSON_NATIVE_COMPONENT_FAILED".into()}
}
fn identifier(s:&str)->bool{
    !s.is_empty()&&s.len()<=160&&s.bytes().enumerate().all(|(i,b)|
        b.is_ascii_alphanumeric()||(i>0&&b"._:/@-".contains(&b)))
}
fn root(app:&AppHandle)->Result<PathBuf,String>{
    let original=app.path().app_local_data_dir()
        .map_err(|_|"ATLAS_PERSON_LOCAL_DATA_UNAVAILABLE".to_string())?;
    // Use the SAME user-selected Setup Core data root as Atlas projects;
    // never create a second hidden application data location.
    #[cfg(windows)]
    let data=super::setup_core_data_root()?.unwrap_or(original);
    #[cfg(not(windows))]
    let data=original;
    Ok(data.join("t3-consumer-person"))
}
fn binary(app:&AppHandle)->Result<PathBuf,String>{
    let base=app.path().resource_dir()
        .map_err(|_|"ATLAS_PERSON_RESOURCE_DIR_UNAVAILABLE".to_string())?;
    let path=base.join("t3").join("iwxa-t3-product-consumer.exe");
    let meta=std::fs::symlink_metadata(&path)
        .map_err(|_|"ATLAS_PERSON_T3_COMPONENT_NOT_BUNDLED".to_string())?;
    if !meta.is_file()||meta.file_type().is_symlink(){
        return Err("ATLAS_PERSON_T3_COMPONENT_NOT_BUNDLED".into());
    }
    Ok(path)
}
fn drain<R:std::io::Read>(mut pipe:R,limit:usize)->Vec<u8>{
    let mut result=Vec::new();let mut chunk=[0_u8;4096];
    loop{
        let n=match pipe.read(&mut chunk){Ok(0)|Err(_)=>break,Ok(n)=>n};
        let available=limit.saturating_sub(result.len());
        result.extend_from_slice(&chunk[..available.min(n)]);
    }
    result
}
#[cfg(windows)]
fn run(app:&AppHandle,action:&str,extra:&[String])->Result<Value,String>{
    let file=binary(app)?;
    let root=root(app)?;
    if !["person-local-capabilities","person-local-read",
         "person-local-receive","person-local-enroll",
         "person-local-authorize"].contains(&action)
       ||extra.len()>1 || extra.iter().any(|x|x.len()>4096||x.chars().any(char::is_control)){
        return Err("ATLAS_PERSON_T3_ARGUMENTS_INVALID".into());
    }
    let mut cmd=Command::new(file);
    cmd.arg(action).arg(root).arg(PRODUCT).args(extra)
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let mut child=cmd.spawn().map_err(|_|"ATLAS_PERSON_T3_SPAWN_FAILED".to_string())?;
    let out=child.stdout.take().ok_or("ATLAS_PERSON_T3_STDOUT_MISSING")?;
    let err=child.stderr.take().ok_or("ATLAS_PERSON_T3_STDERR_MISSING")?;
    let reader=std::thread::spawn(move||drain(out,OUT_CAP+1));
    let errors=std::thread::spawn(move||drain(err,512));
    let start=Instant::now();
    let status=loop{
        match child.try_wait(){
            Ok(Some(s))=>break Some(s),
            Ok(None) if start.elapsed()<TIMEOUT=>{
                std::thread::sleep(Duration::from_millis(50))
            },
            _=>{let _=child.kill();let _=child.wait();break None}
        }
    };
    let stdout=reader.join().map_err(|_|"ATLAS_PERSON_T3_STDOUT_FAILED")?;
    let stderr=errors.join().map_err(|_|"ATLAS_PERSON_T3_STDERR_FAILED")?;
    let status=status.ok_or("ATLAS_PERSON_T3_PROCESS_TIMEOUT")?;
    if !status.success(){
        return Err(code(&String::from_utf8_lossy(&stderr)));
    }
    if stdout.is_empty()||stdout.len()>OUT_CAP{
        return Err("ATLAS_PERSON_T3_RESULT_SIZE_INVALID".into());
    }
    let value:Value=serde_json::from_slice(&stdout)
        .map_err(|_|"ATLAS_PERSON_T3_RESULT_JSON_INVALID".to_string())?;
    if value.get("productionActivation")!=Some(&Value::Bool(false))||
       value.get("activeSeats")!=Some(&Value::from(0)){
        return Err("ATLAS_PERSON_T3_RESULT_NOT_QUALIFIED".into());
    }
    Ok(value)
}
#[cfg(not(windows))]
fn run(_app:&AppHandle,_action:&str,_extra:&[String])->Result<Value,String>{
    Err("ATLAS_PERSON_WINDOWS_REQUIRED".into())
}
async fn execute(app:AppHandle,action:&'static str,args:Vec<String>)->Result<Value,String>{
    tauri::async_runtime::spawn_blocking(move||run(&app,action,&args))
        .await.map_err(|_|"ATLAS_PERSON_T3_NATIVE_WORKER_FAILED".to_string())?
}
fn receipt(value:Value,operation:&str)->Result<Value,String>{
    if value.get("operation").and_then(Value::as_str)!=Some(operation)||
       value.get("productionActivation")!=Some(&Value::Bool(false))||
       value.get("activeSeats")!=Some(&Value::from(0)){
        return Err("ATLAS_PERSON_T3_RECEIPT_INVALID".into());
    }
    Ok(value)
}
#[tauri::command]
pub async fn atlas_person_license_capabilities(app:AppHandle)->Result<Value,String>{
    receipt(execute(app,"person-local-capabilities",vec![]).await?,
        "PERSON_CAPABILITIES")
}
#[tauri::command]
pub async fn atlas_person_license_read(app:AppHandle)->Result<Value,String>{
    let value=receipt(execute(app,"person-local-read",vec![]).await?,"PERSON_READ")?;
    if value.get("view").and_then(Value::as_object).is_none() {
        return Err("ATLAS_PERSON_T3_VIEW_REQUIRED".into());
    }
    Ok(value)
}
#[tauri::command]
pub async fn atlas_person_license_enroll(app:AppHandle,person_id:String)
    ->Result<Value,String>{
    if !identifier(&person_id)||person_id.starts_with("holder:"){
        return Err("ATLAS_PERSON_ID_INVALID".into());
    }
    receipt(execute(app,"person-local-enroll",vec![person_id]).await?,
        "PERSON_ENROLLED")
}
#[tauri::command]
pub async fn atlas_person_license_import(app:AppHandle)
    ->Result<Option<Value>,String>{
    // This dialog never uses the portfolio import command: an .iwxa
    // license can never enter the project store or supply its own trust.
    let chosen=app.dialog().file()
        .set_title("Выбрать подписанную персональную лицензию .iwxa")
        .add_filter("IWXA",&["iwxa"]).blocking_pick_file();
    let Some(FilePath::Path(path))=chosen else{return Ok(None)};
    if path.extension().and_then(|v|v.to_str())!=Some("iwxa"){
        return Err("ATLAS_PERSON_IWXA_EXTENSION_REQUIRED".into());
    }
    let meta=std::fs::symlink_metadata(&path)
        .map_err(|_|"ATLAS_PERSON_IWXA_READ_FAILED".to_string())?;
    if !meta.is_file()||meta.file_type().is_symlink()||meta.len()==0||meta.len()>LIMIT{
        return Err("ATLAS_PERSON_IWXA_SIZE_OR_TYPE_INVALID".into());
    }
    let file=path.to_str().ok_or("ATLAS_PERSON_IWXA_PATH_INVALID")?.to_owned();
    let result=receipt(execute(app,"person-local-receive",vec![file]).await?,
        "PERSON_RECEIVE")?;
    if result.get("signatureVerified")!=Some(&Value::Bool(true))||
       result.get("statusVerified")!=Some(&Value::Bool(true))||
       !result.get("revision").and_then(Value::as_u64).is_some(){
        return Err("ATLAS_PERSON_T3_SIGNATURE_READBACK_REQUIRED".into());
    }
    Ok(Some(result))
}
fn verified_workspace_admission(value:Value)->Result<Value,String>{
    let value=receipt(value,"PERSON_AUTHORIZE")?;
    if value.get("productId").and_then(Value::as_str)!=Some(PRODUCT)||
       value.get("featureId").and_then(Value::as_str)!=Some("WORKSPACE")||
       value.get("permitted").and_then(Value::as_bool).is_none() {
        return Err("ATLAS_PERSON_WORKSPACE_ADMISSION_INVALID".into());
    }
    if value.get("permitted")==Some(&Value::Bool(true))&&
       (value.get("signatureVerified")!=Some(&Value::Bool(true))||
        value.get("statusVerified")!=Some(&Value::Bool(true))||
        !value.get("licenseId").and_then(Value::as_str).is_some_and(identifier)) {
        return Err("ATLAS_PERSON_WORKSPACE_PROOF_REQUIRED".into());
    }
    Ok(value)
}
#[tauri::command]
pub async fn atlas_person_license_workspace_access(app:AppHandle)
    ->Result<Value,String>{
    verified_workspace_admission(
        execute(app,"person-local-authorize",vec!["WORKSPACE".into()]).await?
    )
}
// This does not alter normal public Atlas. The PRIVATE Windows package
// explicitly compiles the native program with person-license-enforced, then
// bundles the ORIGINAL T3 Consumer. The check executes at the storage write
// boundary, not in React where it could be bypassed by direct IPC.
#[cfg(feature="person-license-enforced")]
pub fn require_atlas_workspace(app:&AppHandle)->Result<(),String>{
    let value=verified_workspace_admission(
        run(app,"person-local-authorize",&["WORKSPACE".into()])?
    )?;
    if value.get("permitted")!=Some(&Value::Bool(true)){
        return Err("ATLAS_PERSON_WORKSPACE_LICENSE_REQUIRED".into());
    }
    Ok(())
}
#[cfg(not(feature="person-license-enforced"))]
pub fn require_atlas_workspace(_app:&AppHandle)->Result<(),String>{Ok(())}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn bridge_never_accepts_unbounded_identity_or_unsigned_receipts(){
        assert!(identifier("person:atlas:one"));
        assert!(!identifier("../relative"));
        assert!(!identifier("person with spaces"));
        assert!(!identifier(""));
        let forged=serde_json::json!({"operation":"PERSON_RECEIVE",
            "productionActivation":true,"activeSeats":0});
        assert!(receipt(forged,"PERSON_RECEIVE").is_err());
        let safe=serde_json::json!({"operation":"PERSON_CAPABILITIES",
            "productionActivation":false,"activeSeats":0});
        assert!(receipt(safe,"PERSON_CAPABILITIES").is_ok());
        assert_eq!(code("C:\\private\\secrets"),"ATLAS_PERSON_NATIVE_COMPONENT_FAILED");
    }
}
