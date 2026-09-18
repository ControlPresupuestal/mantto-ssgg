const DATA_FILES=["data/BD_ManttoSSGG.csv","data/BD_ManttoSSGG.csv.csv"];
const OPTIMIZED_DATA_FILE="data/dashboard.json.gz";
const MONTHS=["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
const SHORT_MONTHS=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const PAGE_SIZE=50;

const state={
  rows:[],view:"budgetView",area:"",areaRows:[],itemSummaries:[],selectedItem:null,
  detailRows:[],detailMonth:"",detailPage:1,detailSort:{key:"month",dir:1},
  costCenters:[],ccRows:[],ccPage:1,ccSort:{key:"month",dir:1},charts:{}
};
const ids=["statusText","downloadButton","budgetKpi","actualKpi","deviationKpi","deviationPercentKpi","budgetCaption","monthlyTableBody","itemSearch","itemsTableHead","itemsTableBody","itemsSummary","detailPanel","detailTitle","detailSubtitle","clearDetailMonth","detailTableBody","closeDetailButton","previousDetailPage","nextDetailPage","detailPageText","costCenterSearch","costCenterOptions","costCenterResults","costCenterEmpty","ccActualKpi","ccRecordsKpi","ccSelectionLabel","ccChartSubtitle","ccTableSummary","ccTableBody","previousCcPage","nextCcPage","ccPageText","errorBox"];
const el=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
const usd=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:0});
const number=new Intl.NumberFormat("es-PE");

function clean(value){return String(value??"").trim()}
function toNumber(value){
  if(typeof value==="number")return Number.isFinite(value)?value:0;let text=clean(value).replace(/\s/g,"");if(!text)return 0;
  if(text.includes(",")&&text.includes("."))text=text.lastIndexOf(",")>text.lastIndexOf(".")?text.replace(/\./g,"").replace(",","."):text.replace(/,/g,"");else if(text.includes(","))text=text.replace(",",".");
  const parsed=Number(text);return Number.isFinite(parsed)?parsed:0;
}
function prepareRow(row){row.search=[row.item,row.shortItem,row.detail,row.costCenterId,row.costCenter,row.supplier].join(" ").toLocaleLowerCase("es");return row}
function normalizeRow(row){return prepareRow({
  month:clean(row["MES'"]).toUpperCase(),category:clean(row["Rubro'"]),item:clean(row["Partida'"]),shortItem:clean(row["Partida*"]),className:clean(row.Clase),
  detail:clean(row["DETALLE*"])||clean(row["Glosa'"])||clean(row.DETALLE),costCenterId:clean(row.IDCCOSTO),costCenter:clean(row.CCOSTO)||clean(row.IDCCOSTO),
  supplier:clean(row.RAZON_SOCIAL),period:clean(row.PERIODO),quantity:toNumber(row.CANTIDAD),budget:toNumber(row["$ SEM"]),actual:toNumber(row.IMPORTE)
})}
function dictionaryValue(dictionary,position){return position>=0?dictionary[position]||"":""}
async function loadOptimizedData(){
  const response=await fetch(OPTIMIZED_DATA_FILE);if(!response.ok)throw new Error(`Archivo optimizado no disponible (${response.status})`);
  const bytes=new Uint8Array(await response.arrayBuffer());let jsonText;
  if(bytes[0]===0x1f&&bytes[1]===0x8b){if(typeof DecompressionStream==="undefined")throw new Error("Navegador sin descompresión rápida");const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));jsonText=await new Response(stream).text()}else jsonText=new TextDecoder().decode(bytes);
  const data=JSON.parse(jsonText);if(data.version!==2)throw new Error("Versión de datos pendiente de actualización");
  return data.rows.map(row=>prepareRow({
    month:dictionaryValue(data.months,row[0]),category:dictionaryValue(data.categories,row[1]),item:dictionaryValue(data.items,row[2]),shortItem:dictionaryValue(data.shortItems,row[3]),className:dictionaryValue(data.classes,row[4]),detail:row[5]||"",
    costCenter:dictionaryValue(data.costCenters,row[6]),costCenterId:dictionaryValue(data.costCenterIds,row[7]),supplier:dictionaryValue(data.suppliers,row[8]),period:dictionaryValue(data.periods,row[9]),quantity:row[10]||0,budget:row[11]||0,actual:row[12]||0
  }))
}
function parseCsv(url){return new Promise((resolve,reject)=>Papa.parse(url,{download:true,header:true,skipEmptyLines:"greedy",worker:true,complete:r=>r.data?.length?resolve(r.data):reject(new Error("CSV vacío")),error:reject}))}
async function loadData(){
  try{state.rows=await loadOptimizedData()}catch(optimizedError){
    console.info("Usando CSV de respaldo:",optimizedError.message);let lastError;
    for(const file of DATA_FILES){try{state.rows=(await parseCsv(file)).map(normalizeRow).filter(row=>row.month||row.item||row.actual||row.budget);break}catch(error){lastError=error}}
    if(!state.rows.length){showError(`No se pudo leer la base. ${lastError?.message||"Verifica el CSV."}`);return}
  }
  initialize();
}

function initialize(){createCharts();buildItemsHeader();buildCostCenterOptions();el.itemSearch.disabled=false;el.costCenterSearch.disabled=false;el.downloadButton.disabled=false;el.statusText.textContent=`${number.format(state.rows.length)} registros disponibles`;applyArea()}
function blankTotals(){return{budget:0,actual:0}}
function addTotals(target,row){target.budget+=row.budget;target.actual+=row.actual;return target}
function totals(rows){return rows.reduce(addTotals,blankTotals())}
function deviation(value){return value.actual-value.budget}
function deviationPercent(value){return value.budget?deviation(value)/value.budget:null}
function formatPercent(value){return value===null?"—":`${Math.round(value*100).toLocaleString("es-PE")}%`}
function metricClass(value){return value<0?"favorable":value>0?"unfavorable":"neutral"}
function hasExecution(value){return Math.abs(value.actual)>0.000001}
function monthlyTotals(rows){const result=MONTHS.map(()=>blankTotals());rows.forEach(row=>{const index=MONTHS.indexOf(row.month);if(index>=0)addTotals(result[index],row)});return result}

function applyArea(){
  state.areaRows=state.area?state.rows.filter(row=>row.category===state.area):[...state.rows];state.selectedItem=null;state.detailRows=[];state.detailMonth="";el.detailPanel.hidden=true;el.itemSearch.value="";
  document.querySelectorAll(".area-button").forEach(button=>{const active=button.dataset.area===state.area;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active))});
  const areaName=state.area==="SERVICIOS GENERALES"?"SSGG":state.area||"todas las áreas";el.budgetCaption.textContent=`Presupuesto de ${areaName.toLocaleLowerCase("es")}`;
  renderKpis();renderMonthly();buildItemSummaries();renderItems();
}
function renderKpis(){
  const value=totals(state.areaRows),dev=deviation(value);el.budgetKpi.textContent=usd.format(value.budget);el.actualKpi.textContent=usd.format(value.actual);el.deviationKpi.textContent=usd.format(dev);el.deviationKpi.className=metricClass(dev);el.deviationPercentKpi.textContent=formatPercent(deviationPercent(value));el.deviationPercentKpi.className=metricClass(dev);
}
function renderMonthly(){
  const values=monthlyTotals(state.areaRows);state.charts.monthly.data.labels=SHORT_MONTHS;state.charts.monthly.data.datasets[0].data=values.map(v=>v.budget);state.charts.monthly.data.datasets[1].data=values.map(v=>hasExecution(v)?v.actual:null);state.charts.monthly.update();
  el.monthlyTableBody.replaceChildren();const fragment=document.createDocumentFragment();values.forEach((value,index)=>{
    const executed=hasExecution(value),dev=deviation(value),row=document.createElement("tr");appendCell(row,MONTHS[index]);appendCell(row,usd.format(value.budget),"number");appendCell(row,executed?usd.format(value.actual):"—","number");appendCell(row,executed?usd.format(dev):"—",executed?`number ${metricClass(dev)}`:"number");appendCell(row,executed?formatPercent(deviationPercent(value)):"—",executed?`number ${metricClass(dev)}`:"number");fragment.appendChild(row)
  });el.monthlyTableBody.appendChild(fragment);
}

function buildItemSummaries(){
  const map=new Map();state.areaRows.forEach(row=>{const key=row.item||row.shortItem||"SIN PARTIDA";if(!map.has(key))map.set(key,{key,name:row.shortItem||row.item||"SIN PARTIDA",fullName:row.item,months:MONTHS.map(()=>blankTotals()),total:blankTotals()});const item=map.get(key);addTotals(item.total,row);const index=MONTHS.indexOf(row.month);if(index>=0)addTotals(item.months[index],row)});state.itemSummaries=[...map.values()].sort((a,b)=>b.total.budget-a.total.budget);
}
function buildItemsHeader(){
  const group=document.createElement("tr"),sub=document.createElement("tr"),part=document.createElement("th");part.textContent="Partida";part.rowSpan=2;part.className="sticky-column";group.appendChild(part);appendGroupHeader(group,"TOTAL ANUAL","annual-heading");MONTHS.forEach(month=>appendGroupHeader(group,month,"month-heading"));for(let i=0;i<13;i+=1)appendMetricHeaders(sub,true);el.itemsTableHead.replaceChildren(group,sub);
}
function appendGroupHeader(row,text,className){const cell=document.createElement("th");cell.textContent=text;cell.colSpan=4;cell.className=className;row.appendChild(cell)}
function appendMetricHeaders(row,separated){[["Ppto.","sub-budget"],["Ejec.","sub-actual"],["Desv. $","sub-deviation"],["Desv. %","sub-deviation"]].forEach(([text,className],index)=>{const cell=document.createElement("th");cell.textContent=text;cell.className=`${className}${separated&&index===0?" month-start":""}`;row.appendChild(cell)})}
function renderItems(){
  const query=clean(el.itemSearch.value).toLocaleLowerCase("es"),items=query?state.itemSummaries.filter(item=>`${item.name} ${item.fullName}`.toLocaleLowerCase("es").includes(query)):state.itemSummaries;el.itemsTableBody.replaceChildren();const fragment=document.createDocumentFragment();
  items.forEach(item=>{const row=document.createElement("tr");row.tabIndex=0;row.classList.toggle("selected",state.selectedItem?.key===item.key);row.addEventListener("click",()=>selectItem(item));row.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" ")selectItem(item)});const name=document.createElement("td");name.className="sticky-column";name.textContent=item.name;row.appendChild(name);appendMetrics(row,item.total,true);item.months.forEach(value=>appendMetrics(row,value,true));fragment.appendChild(row)});
  el.itemsTableBody.appendChild(fragment);el.itemsSummary.textContent=`${number.format(items.length)} partidas · Selecciona una para ver el ejecutado`;
}
function appendMetrics(row,value,separated=false){
  const executed=hasExecution(value),dev=deviation(value);appendCell(row,value.budget?usd.format(value.budget):"—",`number${separated?" month-start":""}`);appendCell(row,executed?usd.format(value.actual):"—","number");appendCell(row,executed?usd.format(dev):"—",executed?`number ${metricClass(dev)}`:"number");appendCell(row,executed?formatPercent(deviationPercent(value)):"—",executed?`number ${metricClass(dev)}`:"number");
}
function appendCell(row,text,className=""){const cell=document.createElement("td");cell.textContent=text;cell.className=className;row.appendChild(cell);return cell}

function selectItem(item){
  state.selectedItem=item;state.detailRows=state.areaRows.filter(row=>(row.item||row.shortItem||"SIN PARTIDA")===item.key&&row.actual!==0);state.detailMonth="";state.detailPage=1;state.detailSort={key:"month",dir:1};el.detailPanel.hidden=false;renderItems();renderDetail();requestAnimationFrame(()=>el.detailPanel.scrollIntoView({behavior:"smooth",block:"start"}));
}
function renderDetail(){
  const item=state.selectedItem;if(!item)return;el.detailTitle.textContent=item.name;el.detailSubtitle.textContent=`${item.fullName||item.name} · ${number.format(state.detailRows.length)} registros ejecutados`;
  state.charts.detail.resize();state.charts.detail.data.labels=SHORT_MONTHS;state.charts.detail.data.datasets[0].data=item.months.map(value=>value.budget);state.charts.detail.data.datasets[1].data=item.months.map(value=>hasExecution(value)?value.actual:null);state.charts.detail.update();updateDetailMonthChip();renderDetailTable();
}
function getFilteredDetailRows(){let rows=state.detailRows.filter(row=>!state.detailMonth||row.month===state.detailMonth);return sortRows(rows,state.detailSort)}
function renderDetailTable(){
  const filtered=getFilteredDetailRows(),pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));state.detailPage=Math.min(state.detailPage,pages);const start=(state.detailPage-1)*PAGE_SIZE,rows=filtered.slice(start,start+PAGE_SIZE);el.detailTableBody.replaceChildren();const fragment=document.createDocumentFragment();
  rows.forEach(record=>{const row=document.createElement("tr");[record.month,record.className,record.detail,record.costCenterId,record.costCenter,record.supplier].forEach(value=>appendCell(row,value||"—"));appendCell(row,usd.format(record.actual),"number");fragment.appendChild(row)});el.detailTableBody.appendChild(fragment);el.detailPageText.textContent=`Página ${state.detailPage} de ${pages} · ${number.format(filtered.length)} registros`;el.previousDetailPage.disabled=state.detailPage<=1;el.nextDetailPage.disabled=state.detailPage>=pages;updateSortButtons("detail-sort",state.detailSort);
}
function updateDetailMonthChip(){el.clearDetailMonth.textContent=state.detailMonth?`${state.detailMonth} ×`:"Todos los meses";el.clearDetailMonth.classList.toggle("active",Boolean(state.detailMonth))}

function buildCostCenterOptions(){
  const map=new Map();state.rows.filter(row=>row.actual!==0&&(row.costCenterId||row.costCenter)).forEach(row=>{const key=`${row.costCenterId}|||${row.costCenter}`;if(!map.has(key)){const display=[row.costCenterId,row.costCenter].filter(Boolean).join(" — ");map.set(key,{id:row.costCenterId,name:row.costCenter,display})}});state.costCenters=[...map.values()].sort((a,b)=>a.display.localeCompare(b.display,"es"));const fragment=document.createDocumentFragment();state.costCenters.forEach(center=>{const option=document.createElement("option");option.value=center.display;fragment.appendChild(option)});el.costCenterOptions.replaceChildren(fragment);
}
function runCostCenterQuery(){
  const query=clean(el.costCenterSearch.value).toLocaleLowerCase("es");if(query.length<2){state.ccRows=[];el.costCenterResults.hidden=true;el.costCenterEmpty.hidden=false;return}
  const exact=state.costCenters.find(center=>center.display.toLocaleLowerCase("es")===query);const matches=exact?[exact]:state.costCenters.filter(center=>center.display.toLocaleLowerCase("es").includes(query));const keys=new Set(matches.map(center=>`${center.id}|||${center.name}`));state.ccRows=state.rows.filter(row=>row.actual!==0&&keys.has(`${row.costCenterId}|||${row.costCenter}`));state.ccPage=1;state.ccSort={key:"month",dir:1};
  if(!state.ccRows.length){el.costCenterResults.hidden=true;el.costCenterEmpty.hidden=false;el.costCenterEmpty.textContent="No se encontraron consumos para ese centro de costo.";return}
  el.costCenterEmpty.hidden=true;el.costCenterResults.hidden=false;const total=state.ccRows.reduce((sum,row)=>sum+row.actual,0),label=exact?exact.display:`${matches.length} centros coincidentes`;el.ccActualKpi.textContent=usd.format(total);el.ccRecordsKpi.textContent=number.format(state.ccRows.length);el.ccSelectionLabel.textContent=label;el.ccChartSubtitle.textContent=label;
  const values=monthlyTotals(state.ccRows);state.charts.costCenter.resize();state.charts.costCenter.data.labels=SHORT_MONTHS;state.charts.costCenter.data.datasets[0].data=values.map(value=>hasExecution(value)?value.actual:null);state.charts.costCenter.update();renderCcTable();
}
function renderCcTable(){
  const sorted=sortRows(state.ccRows,state.ccSort),pages=Math.max(1,Math.ceil(sorted.length/PAGE_SIZE));state.ccPage=Math.min(state.ccPage,pages);const start=(state.ccPage-1)*PAGE_SIZE,rows=sorted.slice(start,start+PAGE_SIZE);el.ccTableBody.replaceChildren();const fragment=document.createDocumentFragment();
  rows.forEach(record=>{const row=document.createElement("tr");[record.month,record.className,record.detail,record.costCenterId,record.costCenter,record.supplier].forEach(value=>appendCell(row,value||"—"));appendCell(row,usd.format(record.actual),"number");fragment.appendChild(row)});el.ccTableBody.appendChild(fragment);el.ccTableSummary.textContent=`${number.format(sorted.length)} registros ejecutados`;el.ccPageText.textContent=`Página ${state.ccPage} de ${pages}`;el.previousCcPage.disabled=state.ccPage<=1;el.nextCcPage.disabled=state.ccPage>=pages;updateSortButtons("cc-sort",state.ccSort);
}

function sortRows(rows,config){return[...rows].sort((a,b)=>{let av=config.key==="month"?MONTHS.indexOf(a.month):a[config.key],bv=config.key==="month"?MONTHS.indexOf(b.month):b[config.key];if(typeof av==="number"&&typeof bv==="number")return(av-bv)*config.dir;return String(av||"").localeCompare(String(bv||""),"es",{numeric:true,sensitivity:"base"})*config.dir})}
function toggleSort(config,key){if(config.key===key)config.dir*=-1;else{config.key=key;config.dir=1}}
function updateSortButtons(attribute,config){document.querySelectorAll(`[data-${attribute}]`).forEach(button=>{const active=button.dataset[toCamel(attribute)]===config.key;button.classList.toggle("sorted",active);button.title=active?(config.dir===1?"Orden ascendente":"Orden descendente"):"Ordenar columna"})}
function toCamel(text){return text.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())}

function createCharts(){
  Chart.defaults.font.family='Inter,"Segoe UI",Arial,sans-serif';Chart.defaults.color="#64808f";
  state.charts.monthly=new Chart(document.getElementById("monthlyChart"),{type:"bar",data:{labels:[],datasets:[budgetDataset(),actualDataset()]},options:chartOptions()});
  state.charts.detail=new Chart(document.getElementById("detailChart"),{type:"line",data:{labels:[],datasets:[budgetDataset(true),actualDataset(true)]},options:chartOptions((event,elements)=>{if(!elements.length)return;state.detailMonth=MONTHS[elements[0].index];state.detailPage=1;updateDetailMonthChip();renderDetailTable()})});
  state.charts.costCenter=new Chart(document.getElementById("costCenterChart"),{type:"bar",data:{labels:[],datasets:[actualDataset()]},options:chartOptions()});
}
function budgetDataset(line=false){return{label:"Presupuesto",data:[],backgroundColor:"rgba(22,117,173,.78)",borderColor:"#1675ad",borderWidth:line?3:0,borderRadius:5,tension:.28,fill:false}}
function actualDataset(line=false){return{label:"Ejecutado",data:[],backgroundColor:"rgba(21,148,116,.78)",borderColor:"#159474",borderWidth:line?3:0,borderRadius:5,tension:.28,fill:false,spanGaps:false}}
function chartOptions(onClick){return{responsive:true,maintainAspectRatio:false,onClick,interaction:{mode:"index",intersect:false},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:"rgba(100,128,143,.12)"},ticks:{callback:value=>new Intl.NumberFormat("en-US",{notation:"compact"}).format(value)}}},plugins:{legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:9}},tooltip:{callbacks:{label:context=>`${context.dataset.label}: ${context.raw===null?"Sin ejecución":usd.format(context.raw)}`}}}}}

function setView(view){state.view=view;document.getElementById("budgetView").hidden=view!=="budgetView";document.getElementById("costCenterView").hidden=view!=="costCenterView";document.querySelectorAll(".view-tab").forEach(button=>button.classList.toggle("active",button.dataset.view===view))}
function downloadData(){
  let rows=state.view==="costCenterView"?state.ccRows:(state.selectedItem?getFilteredDetailRows():state.areaRows);const exportRows=rows.map(row=>({AREA:row.category,MES:row.month,PARTIDA:row.item,CLASE:row.className,DETALLE:row.detail,IDCCOSTO:row.costCenterId,CCOSTO:row.costCenter,PROVEEDOR:row.supplier,PRESUPUESTO_USD:row.budget,EJECUTADO_USD:row.actual}));const csv="\ufeff"+Papa.unparse(exportRows,{delimiter:";"}),blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`Mantto_SSGG_${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(link.href);
}
function showError(message){el.statusText.textContent="No se pudo cargar la información";el.errorBox.textContent=message;el.errorBox.hidden=false}

document.querySelectorAll(".view-tab").forEach(button=>button.addEventListener("click",()=>setView(button.dataset.view)));
document.querySelectorAll(".area-button").forEach(button=>button.addEventListener("click",()=>{state.area=button.dataset.area;applyArea()}));
document.querySelectorAll("[data-detail-sort]").forEach(button=>button.addEventListener("click",()=>{toggleSort(state.detailSort,button.dataset.detailSort);state.detailPage=1;renderDetailTable()}));
document.querySelectorAll("[data-cc-sort]").forEach(button=>button.addEventListener("click",()=>{toggleSort(state.ccSort,button.dataset.ccSort);state.ccPage=1;renderCcTable()}));
el.itemSearch.addEventListener("input",renderItems);el.downloadButton.addEventListener("click",downloadData);el.closeDetailButton.addEventListener("click",()=>{state.selectedItem=null;state.detailRows=[];el.detailPanel.hidden=true;renderItems()});
el.clearDetailMonth.addEventListener("click",()=>{state.detailMonth="";state.detailPage=1;updateDetailMonthChip();renderDetailTable()});
el.previousDetailPage.addEventListener("click",()=>{state.detailPage-=1;renderDetailTable()});el.nextDetailPage.addEventListener("click",()=>{state.detailPage+=1;renderDetailTable()});
let ccTimer;el.costCenterSearch.addEventListener("input",()=>{clearTimeout(ccTimer);ccTimer=setTimeout(runCostCenterQuery,180)});el.costCenterSearch.addEventListener("change",runCostCenterQuery);
el.previousCcPage.addEventListener("click",()=>{state.ccPage-=1;renderCcTable()});el.nextCcPage.addEventListener("click",()=>{state.ccPage+=1;renderCcTable()});
loadData();
