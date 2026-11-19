/** Offline integration test: GRID V4.6 normal verification saves master+audit+remark atomically */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'enhancements.js'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.includes('id="equipmentActionRemark"'));
assert.ok(html.includes('>Remark Broken</button>'));
const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, {
    value:'',textContent:'',style:{},hidden:false,disabled:false,
    classList:{add(){},remove(){},toggle(){}},focus(){},
    setAttribute(){},removeAttribute(){},getAttribute(){return null}
  });
  return elements.get(id);
}
const master = {name:'DMM',loc:'FP43-A',bldg:'FP43',prod:'A',due:'DEC-26',month:'DEC',year:'2026',status:'IN USE',msa:'NO'};
const updates = [];
let seq=0; let failure=false;
const fake = {
  console,Date,Number,Set,Map,URL,Intl,
  MONTH_ORDER:['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],
  document:{addEventListener(){},getElementById:el},window:{XLSX:{}},navigator:{},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},
  masterDB:{'QA-001':{...master}},
  rawMasterRows:[['CODE','NAME','LOCATION','DUE','STATUS','MSA'],['QA-001','DMM','FP43-A','DEC-26','IN USE','NO']],
  scanHistory:[],pendingUploads:[], currentItem:{...master,barcode:'QA-001',isUnregistered:false},
  currentAuditEditRecord:null,loggedInUser:'Operator A',isOnline:true,
  selectedLoc:'CORRECT',selectedStickerLoc:'CORRECT',selectedDue:'VALID',selectedMsa:'NO',
  db:{ref(path){
    if (path === 'audit_history' || path === 'equipment_change_log') return {push(){return {key:`entry-${++seq}`}}};
    if (path?.startsWith('master_list/masterDB/')) return {async once(){return {val:()=>({...fake.masterDB['QA-001']})}}};
    if (path===undefined) return {async update(patch){if(failure) throw Error('simulated write failure');updates.push(patch)}};
    return {set: async () => {throw Error('unexpected write path')}};
  }},
  parseLocationParts:(loc)=>({loc,bldg:'FP43',prod:'A'}),
  parseDueParts:(value)=>({due:value,month:'DEC',year:'2026'}),
  normalizeEquipmentStatus:(raw)=>String(raw||'').toUpperCase(),
  alert:(message)=>{throw Error(message)},
  escapeHtml:x=>String(x),encodeActionValue:encodeURIComponent,
};
vm.createContext(fake);
const a=script.indexOf('function getRawMasterFieldIndices() {');
const b=script.indexOf('function toggleMasterFieldEdit(field)',a);
vm.runInContext(script.slice(a,b),fake);
const c=script.indexOf('function overwriteMasterFieldsIfChanged(');
const d=script.indexOf('\nasync function handleScannedCode(',c);
vm.runInContext(script.slice(c,d),fake);
vm.runInContext(app,fake);
for (const name of ['updateVerificationState','rebuildFilters','updateDisplay','v2SetLastScan','v2Feedback','closeModal']) fake[name]=()=>{};
fake.v2BuildRemarkSuggestion=()=>'';
const toast=[];fake.showToast=t=>toast.push(t);
el('qcLocationInput').value='FP43-B';
el('qcDueInput').value='DEC-26';
el('qcStatusInput').value='BROKEN';
(async()=>{
  // Change without a typed remark: absolutely no Firebase writes.
  const rejected=await fake.v2SaveAuditRecord();
  assert.equal(rejected,undefined);
  assert.equal(updates.length,0);
  assert.equal(fake.masterDB['QA-001'].status,'IN USE');
  assert.ok(toast.find(v=>String(v).includes('meaningful remark')));
  el('qcRemark').value='Probe broken while moving from line A to B';
  const saved=await fake.v2SaveAuditRecord();
  assert.equal(updates.length,1);
  const batch=updates[0];
  assert.equal(batch['master_list/masterDB/QA-001/status'],'BROKEN');
  assert.equal(batch['master_list/masterDB/QA-001/loc'],'FP43-B');
  assert.equal(batch['master_list/rawMasterRows/1/2'],'FP43-B');
  const history=Object.values(batch).find(v=>v?.barcode==='QA-001');
  assert.equal(history.operatorRemark,'Probe broken while moving from line A to B');
  assert.equal(history.masterLocationUpdated,true);
  assert.equal(history.masterStatusUpdated,true);
  const log=Object.values(batch).find(v=>v?.equipmentCode==='QA-001');
  assert.equal(log.remark,el('qcRemark').value);
  assert.equal(log.fields.length,2);
  assert.equal(fake.masterDB['QA-001'].loc,'FP43-B');
  assert.equal(fake.masterDB['QA-001'].status,'BROKEN');
  assert.equal(fake.scanHistory.length,1);
  // Failed multi-path Firebase write must not mutate local equipment master.
  fake.currentItem={...fake.currentItem,loc:'FP43-B',status:'BROKEN'};
  el('qcStatusInput').value='IN USE';
  el('qcLocationInput').value='FP43-C';
  failure=true;
  await fake.v2SaveAuditRecord();
  assert.equal(fake.masterDB['QA-001'].status,'BROKEN');
  assert.equal(fake.masterDB['QA-001'].loc,'FP43-B');
  assert.equal(updates.length,1);
  console.log('PASS normal scan: mandatory operator remark, atomic master+scan+immutable log, local update after commit, rollback on failed write');
})().catch(e=>{console.error(e);process.exitCode=1});
