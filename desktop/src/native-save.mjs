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
