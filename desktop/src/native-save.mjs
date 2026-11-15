// Reconcile a possibly lost Tauri IPC acknowledgement using the existing
// native store. This helper never writes again after an uncertain commit.
export async function commitWithReadback({invoke,expectedGeneration,snapshot,signature,readValidated}) {
 const expected=signature(snapshot);
 let receipt=null,writeError=null;
 try {
  receipt=await invoke('atlas_commit',{expectedGeneration,snapshot});
 } catch(error) {
  writeError=error;
 }
 let opened=null,readError=null;
 for(let attempt=0;attempt<2;attempt++) {
  try {opened=await invoke('atlas_open');break;}
  catch(error) {readError=error;}
 }
 if(!opened) {
  const reason=readError instanceof Error?readError.message:String(readError);
  throw Error('Нельзя подтвердить сохранение: повторное чтение не удалось. Запись могла завершиться; перед новой попыткой перезапустите Atlas. '+reason);
 }
 if(opened.needsConfirmation)throw Error('Нативное хранилище требует восстановления. Не повторяйте сохранение до проверки портфеля.');
 const checked=readValidated(opened.snapshot);
 if(signature(checked)!==expected){
  if(writeError)throw writeError;
  throw Error('После записи прочитан другой портфель. Не закрывайте Atlas без проверки данных.');
 }
 if(receipt){
  if(opened.generation!==receipt.generation)
   throw Error('После сохранения появилась другая редакция портфеля. Перечитайте данные перед повторной записью.');
 } else if(opened.generation===expectedGeneration){
  throw writeError||Error('Запись не подтверждена');
 }
 return {generation:opened.generation,projectBlocksWritten:receipt?.projectBlocksWritten??null,reconciled:!receipt};
}

// Verify a saved reference against the native head immediately before handing
// it to another product. No write or new store; the other host must independently
// recheck currentness when consuming the reference.
export async function readSavedSnapshotForReference({
 invoke,expectedGeneration,snapshot,signature,readValidated
}){
 if(typeof expectedGeneration!=="string"||expectedGeneration==="none")
  throw Error("Сначала сохраните портфель перед передачей ссылки.");
 const opened=await invoke("atlas_open");
 if(!opened||opened.needsConfirmation)
  throw Error("Нативное хранилище требует восстановления. Ссылка не сформирована.");
 if(opened.generation!==expectedGeneration)
  throw Error("Портфель на диске изменился. Ссылка не сформирована; откройте актуальную редакцию.");
 const checked=readValidated(opened.snapshot);
 if(signature(checked)!==signature(snapshot))
  throw Error("Данные на диске отличаются от открытого портфеля. Ссылка не сформирована.");
 return checked;
}

// Read original Atlas native head after another installed product/Host may
// have saved a verified Result link. There is no copy, merger or new Store.
// A dirty UI draft is NEVER silently replaced; callers must check that the
// same in-memory snapshot is still active before applying this result.
export async function readExternalAtlasUpdate({
 invoke,expectedGeneration,snapshot,signature,readValidated,assertUnchanged
}={}){
 if(typeof invoke!=="function"||typeof signature!=="function"||
    typeof readValidated!=="function"||typeof assertUnchanged!=="function"||
    typeof expectedGeneration!=="string"||!expectedGeneration||
    expectedGeneration==="none")
  throw Error("ATLAS_T3_SAVED_SOURCE_REQUIRED");
 assertUnchanged();
 const original=signature(snapshot);
 const opened=await invoke("atlas_open");
 assertUnchanged();
 if(!opened||opened.needsConfirmation===true||typeof opened.generation!=="string")
  throw Error("ATLAS_T3_NATIVE_RECOVERY_REQUIRED");
 const checked=readValidated(opened.snapshot);
 assertUnchanged();
 if(opened.generation===expectedGeneration){
  if(signature(checked)!==original)
   throw Error("ATLAS_T3_NATIVE_HEAD_INCONSISTENT");
  return Object.freeze({status:"UNCHANGED",generation:expectedGeneration,snapshot:checked});
 }
 if(!Number.isSafeInteger(checked.revision)||
    checked.revision<=snapshot.revision)
  throw Error("ATLAS_T3_NATIVE_REVISION_NOT_ADVANCED");
 return Object.freeze({status:"UPDATED",generation:opened.generation,snapshot:checked});
}
