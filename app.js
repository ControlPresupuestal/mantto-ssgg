const DATA_FILES=["data/BD_ManttoSSGG.csv","data/BD_ManttoSSGG.csv.csv"];
const OPTIMIZED_DATA_FILE="data/dashboard.json.gz";
const MONTHS=["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
const SHORT_MONTHS=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const PAGE_SIZE=50;


const state={
  rows:[],view:"budgetView",area:"",areaRows:[],itemSummaries:[],selectedItem:null,itemMonthView:"executed",itemSort:{key:"budget",dir:-1},
  detailRows:[],detailMonth:"",detailPage:1,detailSort:{key:"month",dir:1},
  costCenters:[],providers:[],ccArea:"",ccBaseRows:[],ccRows:[],ccClass:"",ccItem:"",ccMonth:"",ccPage:1,ccSort:{key:"month",dir:1},
  laborArea:"",laborItem:"",laborMonth:"",laborSearch:"",laborEntries:[],selectedLaborKey:"",laborDetailRows:[],laborPage:1,laborSort:{key:"month",dir:1},charts:{}
};
const ids=["statusText","budgetKpi","actualKpi","deviationKpi","deviationPercentKpi","budgetCaption","monthlyTableBody","monthlyTableFoot","itemSearch","itemsScrollHint","itemsTableHead","itemsTableBody","itemsTableFoot","itemsSummary","detailPanel","detailTitle","detailSubtitle","clearDetailMonth","detailTableBody","closeDetailButton","downloadDetailButton","previousDetailPage","nextDetailPage","detailPageText","costCenterSearch","costCenterOptions","providerSearch","providerOptions","detailSearch","clearConsumptionFilters","costCenterResults","costCenterEmpty","ccActualKpi","ccRecordsKpi","ccSelectionLabel","ccChartSubtitle","classChartSubtitle","itemChartSubtitle","ccTableSummary","ccTableBody","downloadCcButton","previousCcPage","nextCcPage","ccPageText","laborItemFilter","laborMonthFilter","laborSearch","clearLaborFilters","laborBudgetKpi","laborActualKpi","laborDeviationKpi","laborDeviationPercentKpi","laborScopeLabel","laborMonthlyTableBody","laborMonthlyTableFoot","laborTableBody","laborTableSummary","laborDetailPanel","laborDetailTitle","clearLaborSelection","laborDetailTableBody","downloadLaborButton","previousLaborPage","nextLaborPage","laborPageText","laborNotice","errorBox"];
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
  supplier:clean(row.RAZON_SOCIAL),period:clean(row.PERIODO),quantity:toNumber(row.CANTIDAD),budget:toNumber(row["$ SEM"]),actual:toNumber(row.IMPORTE),laborId:clean(row.IDLABOR),labor:clean(row.LABOR)
})}
function dictionaryValue(dictionary,position){return position>=0?dictionary[position]||"":""}
async function loadOptimizedData(){
  const response=await fetch(OPTIMIZED_DATA_FILE);if(!response.ok)throw new Error(`Archivo optimizado no disponible (${response.status})`);
  const bytes=new Uint8Array(await response.arrayBuffer());let jsonText;
  if(bytes[0]===0x1f&&bytes[1]===0x8b){if(typeof DecompressionStream==="undefined")throw new Error("Navegador sin descompresión rápida");const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));jsonText=await new Response(stream).text()}else jsonText=new TextDecoder().decode(bytes);
  const data=JSON.parse(jsonText);if(data.version!==3)throw new Error("Versión de datos pendiente de actualización");
  return data.rows.map(row=>prepareRow({
    month:dictionaryValue(data.months,row[0]),category:dictionaryValue(data.categories,row[1]),item:dictionaryValue(data.items,row[2]),shortItem:dictionaryValue(data.shortItems,row[3]),className:dictionaryValue(data.classes,row[4]),detail:row[5]||"",
    costCenter:dictionaryValue(data.costCenters,row[6]),costCenterId:dictionaryValue(data.costCenterIds,row[7]),supplier:dictionaryValue(data.suppliers,row[8]),period:dictionaryValue(data.periods,row[9]),quantity:row[10]||0,budget:row[11]||0,actual:row[12]||0,laborId:dictionaryValue(data.laborIds,row[13]),labor:dictionaryValue(data.labors,row[14])
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


function initialize(){createCharts();buildQueryOptions();buildLaborOptions();el.itemSearch.disabled=false;el.costCenterSearch.disabled=false;el.providerSearch.disabled=false;el.detailSearch.disabled=false;el.laborItemFilter.disabled=false;el.laborMonthFilter.disabled=false;el.laborSearch.disabled=false;el.statusText.textContent=`${number.format(state.rows.length)} registros disponibles`;applyArea();renderLaborView()}
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
  renderKpis();renderMonthly();buildItemSummaries();buildItemsHeader();renderItems();
}
function renderKpis(){
  const value=totals(state.areaRows),dev=deviation(value);el.budgetKpi.textContent=usd.format(value.budget);el.actualKpi.textContent=usd.format(value.actual);el.deviationKpi.textContent=usd.format(dev);el.deviationKpi.className=metricClass(dev);el.deviationPercentKpi.textContent=formatPercent(deviationPercent(value));el.deviationPercentKpi.className=metricClass(dev);
}
function renderMonthly(){
  const values=monthlyTotals(state.areaRows);state.charts.monthly.data.labels=SHORT_MONTHS;state.charts.monthly.data.datasets[0].data=values.map(v=>v.budget);state.charts.monthly.data.datasets[1].data=values.map(v=>hasExecution(v)?v.actual:null);state.charts.monthly.update();
  el.monthlyTableBody.replaceChildren();const fragment=document.createDocumentFragment();values.forEach((value,index)=>{
    const executed=hasExecution(value),dev=deviation(value),row=document.createElement("tr");appendCell(row,MONTHS[index]);appendCell(row,usd.format(value.budget),"number");appendCell(row,executed?usd.format(value.actual):"—","number");appendCell(row,executed?usd.format(dev):"—",executed?`number ${metricClass(dev)}`:"number");appendCell(row,executed?formatPercent(deviationPercent(value)):"—",executed?`number ${metricClass(dev)}`:"number");fragment.appendChild(row)
  });el.monthlyTableBody.appendChild(fragment);
  const total=totals(state.areaRows),dev=deviation(total),row=document.createElement("tr");appendCell(row,"TOTAL GENERAL");appendCell(row,usd.format(total.budget),"number");appendCell(row,usd.format(total.actual),"number");appendCell(row,usd.format(dev),`number ${metricClass(dev)}`);appendCell(row,formatPercent(deviationPercent(total)),`number ${metricClass(dev)}`);el.monthlyTableFoot.replaceChildren(row);
}


function buildItemSummaries(){
  const map=new Map();state.areaRows.forEach(row=>{const key=row.item||row.shortItem||"SIN PARTIDA";if(!map.has(key))map.set(key,{key,name:row.shortItem||row.item||"SIN PARTIDA",fullName:row.item,months:MONTHS.map(()=>blankTotals()),total:blankTotals()});const item=map.get(key);addTotals(item.total,row);const index=MONTHS.indexOf(row.month);if(index>=0)addTotals(item.months[index],row)});state.itemSummaries=[...map.values()].sort((a,b)=>b.total.budget-a.total.budget);
}
function lastExecutedMonthIndex(){
  let last=-1;state.areaRows.forEach(row=>{const index=MONTHS.indexOf(row.month);if(index>=0&&Math.abs(row.actual)>0.000001)last=Math.max(last,index)});return last;
}
function visibleItemMonthIndexes(){
  if(state.itemMonthView==="full")return MONTHS.map((_,index)=>index);const last=lastExecutedMonthIndex();return last<0?[]:MONTHS.map((_,index)=>index).filter(index=>index<=last);
}
function updateItemMonthViewButtons(){
  document.querySelectorAll(".month-view-button").forEach(button=>{const active=button.dataset.monthView===state.itemMonthView;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active))});
}
function visibleItemTotal(item,visibleMonths){
  return visibleMonths.reduce((total,index)=>addTotals(total,item.months[index]),blankTotals());
}
function itemSortValue(entry,key){
  if(key==="name")return entry.item.name||entry.item.fullName||"";if(key==="actual")return entry.summary.actual;if(key==="deviation")return deviation(entry.summary);if(key==="percent")return deviationPercent(entry.summary);return entry.summary.budget;
}
function sortItemEntries(entries){
  const {key,dir}=state.itemSort;return entries.sort((a,b)=>{const av=itemSortValue(a,key),bv=itemSortValue(b,key);if(av===null&&bv===null)return 0;if(av===null)return 1;if(bv===null)return-1;if(typeof av==="string")return av.localeCompare(bv,"es",{sensitivity:"base"})*dir;return(av-bv)*dir});
}
function toggleItemSort(key){
  state.itemSort=state.itemSort.key===key?{key,dir:state.itemSort.dir*-1}:{key,dir:key==="name"?1:-1};buildItemsHeader();renderItems();
}
function createItemSortButton(cell,text,key){
  const button=document.createElement("button"),active=state.itemSort.key===key;button.type="button";button.className=`matrix-sort-button${active?" sorted":""}${active?(state.itemSort.dir===1?" ascending":" descending"):""}`;button.textContent=text;button.dataset.itemSort=key;button.title=`Ordenar por ${text}`;button.addEventListener("click",()=>toggleItemSort(key));cell.setAttribute("aria-sort",active?(state.itemSort.dir===1?"ascending":"descending"):"none");cell.appendChild(button);
}
function buildItemsHeader(){
  const visibleMonths=visibleItemMonthIndexes(),last=lastExecutedMonthIndex(),group=document.createElement("tr"),sub=document.createElement("tr"),part=document.createElement("th");part.rowSpan=2;part.className="sticky-column";createItemSortButton(part,"Partida","name");group.appendChild(part);
  const summaryTitle=state.itemMonthView==="full"?"TOTAL ANUAL":last>=0?`ACUMULADO A ${MONTHS[last]}`:"ACUMULADO";appendGroupHeader(group,summaryTitle,"annual-heading");visibleMonths.forEach(index=>appendGroupHeader(group,MONTHS[index],"month-heading"));appendMetricHeaders(sub,true,true);visibleMonths.forEach(()=>appendMetricHeaders(sub,true,false));el.itemsTableHead.replaceChildren(group,sub);updateItemMonthViewButtons();
  el.itemsScrollHint.textContent=state.itemMonthView==="full"?"Mostrando enero a diciembre · Desliza horizontalmente para revisar los 12 meses →":last>=0?`Mostrando hasta ${MONTHS[last].toLocaleLowerCase("es")} · Desliza horizontalmente para revisar los meses →`:"Todavía no hay meses con ejecución";
}
function appendGroupHeader(row,text,className){const cell=document.createElement("th");cell.textContent=text;cell.colSpan=4;cell.className=className;row.appendChild(cell)}
function appendMetricHeaders(row,separated,sortable=false){
  [["Ppto.","sub-budget","budget"],["Ejec.","sub-actual","actual"],["Desv. $","sub-deviation","deviation"],["Desv. %","sub-deviation","percent"]].forEach(([text,className,key],index)=>{const cell=document.createElement("th");cell.className=`${className}${separated&&index===0?" month-start":""}`;if(sortable)createItemSortButton(cell,text,key);else cell.textContent=text;row.appendChild(cell)})
}
function renderItems(){
  const query=clean(el.itemSearch.value).toLocaleLowerCase("es"),baseItems=query?state.itemSummaries.filter(item=>`${item.name} ${item.fullName}`.toLocaleLowerCase("es").includes(query)):state.itemSummaries,visibleMonths=visibleItemMonthIndexes(),entries=sortItemEntries(baseItems.map(item=>({item,summary:visibleItemTotal(item,visibleMonths)})));el.itemsTableBody.replaceChildren();const fragment=document.createDocumentFragment();
  entries.forEach(({item,summary})=>{const row=document.createElement("tr");row.tabIndex=0;row.classList.toggle("selected",state.selectedItem?.key===item.key);row.addEventListener("click",()=>selectItem(item));row.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" ")selectItem(item)});const name=document.createElement("td");name.className="sticky-column";name.textContent=item.name;row.appendChild(name);appendMetrics(row,summary,true);visibleMonths.forEach(index=>appendMetrics(row,item.months[index],true));fragment.appendChild(row)});
  el.itemsTableBody.appendChild(fragment);
  const totalRow=document.createElement("tr"),periodTotal=blankTotals(),monthTotals=MONTHS.map(()=>blankTotals());totalRow.className="items-total-row";const label=document.createElement("td");label.className="sticky-column";label.textContent="TOTAL GENERAL";totalRow.appendChild(label);entries.forEach(({item,summary})=>{addTotals(periodTotal,summary);item.months.forEach((value,index)=>addTotals(monthTotals[index],value))});appendMetrics(totalRow,periodTotal,true);visibleMonths.forEach(index=>appendMetrics(totalRow,monthTotals[index],true));el.itemsTableFoot.replaceChildren(totalRow);
  el.itemsSummary.textContent=`${number.format(entries.length)} partidas · Selecciona una para ver el ejecutado`;
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


function buildQueryOptions(){
  const centers=new Map(),providers=new Set();state.rows.filter(row=>row.actual!==0).forEach(row=>{
    if(row.costCenterId||row.costCenter){const key=`${row.costCenterId}|||${row.costCenter}`;if(!centers.has(key))centers.set(key,{id:row.costCenterId,name:row.costCenter,display:[row.costCenterId,row.costCenter].filter(Boolean).join(" — ")})}
    if(row.supplier)providers.add(row.supplier);
  });
  state.costCenters=[...centers.values()].sort((a,b)=>a.display.localeCompare(b.display,"es"));state.providers=[...providers].sort((a,b)=>a.localeCompare(b,"es"));
  const centerFragment=document.createDocumentFragment();state.costCenters.forEach(center=>{const option=document.createElement("option");option.value=center.display;centerFragment.appendChild(option)});el.costCenterOptions.replaceChildren(centerFragment);
  const providerFragment=document.createDocumentFragment();state.providers.forEach(provider=>{const option=document.createElement("option");option.value=provider;providerFragment.appendChild(option)});el.providerOptions.replaceChildren(providerFragment);
}
function runConsumptionQuery(){
  const centerQuery=clean(el.costCenterSearch.value).toLocaleLowerCase("es"),providerQuery=clean(el.providerSearch.value).toLocaleLowerCase("es"),detailQuery=clean(el.detailSearch.value).toLocaleLowerCase("es");
  if(!centerQuery&&!providerQuery&&!detailQuery&&!state.ccArea){state.ccBaseRows=[];state.ccRows=[];el.costCenterResults.hidden=true;el.costCenterEmpty.hidden=false;el.costCenterEmpty.textContent="Selecciona un área o ingresa un centro de costo, proveedor o palabra del detalle para comenzar.";return}
  state.ccBaseRows=state.rows.filter(row=>row.actual!==0&&(!state.ccArea||row.category===state.ccArea)&&(!centerQuery||`${row.costCenterId} — ${row.costCenter}`.toLocaleLowerCase("es").includes(centerQuery))&&(!providerQuery||row.supplier.toLocaleLowerCase("es").includes(providerQuery))&&(!detailQuery||row.detail.toLocaleLowerCase("es").includes(detailQuery)));
  state.ccClass="";state.ccItem="";state.ccMonth="";state.ccPage=1;state.ccSort={key:"month",dir:1};
  if(!state.ccBaseRows.length){state.ccRows=[];el.costCenterResults.hidden=true;el.costCenterEmpty.hidden=false;el.costCenterEmpty.textContent="No se encontraron consumos con esos filtros.";return}
  el.costCenterEmpty.hidden=true;el.costCenterResults.hidden=false;applyConsumptionFilters();
}
function renderClassChart(rows){
  const groups=new Map();rows.forEach(row=>groups.set(row.className||"SIN CLASE",(groups.get(row.className||"SIN CLASE")||0)+row.actual));
  const entries=[...groups.entries()].sort((a,b)=>b[1]-a[1]);state.charts.class.data.labels=entries.map(entry=>entry[0]);state.charts.class.data.datasets[0].data=entries.map(entry=>entry[1]);state.charts.class.update();
}
function renderItemChart(rows){
  const groups=new Map();rows.forEach(row=>groups.set(row.item||"SIN PARTIDA",(groups.get(row.item||"SIN PARTIDA")||0)+row.actual));const entries=[...groups.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15);state.charts.item.data.labels=entries.map(entry=>entry[0]);state.charts.item.data.datasets[0].data=entries.map(entry=>entry[1]);state.charts.item.update();
}
function consumptionRows({skip=""}={}){return state.ccBaseRows.filter(row=>(skip==="class"||!state.ccClass||(row.className||"SIN CLASE")===state.ccClass)&&(skip==="item"||!state.ccItem||(row.item||"SIN PARTIDA")===state.ccItem)&&(skip==="month"||!state.ccMonth||row.month===state.ccMonth))}
function applyConsumptionFilters(){
  state.ccRows=consumptionRows();state.ccPage=1;const total=state.ccRows.reduce((sum,row)=>sum+row.actual,0),searchFilters=[clean(el.costCenterSearch.value),clean(el.providerSearch.value),clean(el.detailSearch.value)].filter(Boolean),activeFilters=[state.ccArea==="SERVICIOS GENERALES"?"SSGG":state.ccArea,state.ccClass,state.ccItem,state.ccMonth].filter(Boolean);el.ccActualKpi.textContent=usd.format(total);el.ccRecordsKpi.textContent=number.format(state.ccRows.length);el.ccSelectionLabel.textContent=activeFilters.join(" · ")||"Todos los consumos";
  const monthlyRows=consumptionRows({skip:"month"}),values=monthlyTotals(monthlyRows);state.charts.costCenter.resize();state.charts.class.resize();state.charts.item.resize();state.charts.costCenter.data.labels=SHORT_MONTHS;state.charts.costCenter.data.datasets[0].data=values.map(value=>hasExecution(value)?value.actual:null);state.charts.costCenter.data.datasets[0].backgroundColor=MONTHS.map(month=>state.ccMonth&&month!==state.ccMonth?"rgba(21,148,116,.25)":"rgba(21,148,116,.78)");state.charts.costCenter.update();renderClassChart(consumptionRows({skip:"class"}));renderItemChart(consumptionRows({skip:"item"}));
  el.ccChartSubtitle.textContent=state.ccMonth?`${state.ccMonth} · haz clic otra vez para limpiar`:(searchFilters.join(" · ")||"Haz clic en un mes para filtrar el detalle");el.classChartSubtitle.textContent=state.ccClass?`${state.ccClass} · haz clic otra vez para limpiar`:"Haz clic en una clase para filtrar";el.itemChartSubtitle.textContent=state.ccItem?`${state.ccItem} · haz clic otra vez para limpiar`:"Principales partidas · haz clic para filtrar";renderCcTable();
}
function renderCcTable(){
  const sorted=sortRows(state.ccRows,state.ccSort),pages=Math.max(1,Math.ceil(sorted.length/PAGE_SIZE));state.ccPage=Math.min(state.ccPage,pages);const start=(state.ccPage-1)*PAGE_SIZE,rows=sorted.slice(start,start+PAGE_SIZE);el.ccTableBody.replaceChildren();const fragment=document.createDocumentFragment();
  rows.forEach(record=>{const row=document.createElement("tr");[record.month,record.item,record.className,record.detail,record.costCenterId,record.costCenter,record.supplier].forEach(value=>appendCell(row,value||"—"));appendCell(row,usd.format(record.actual),"number");fragment.appendChild(row)});el.ccTableBody.appendChild(fragment);el.ccTableSummary.textContent=`${number.format(sorted.length)} registros ejecutados`;el.ccPageText.textContent=`Página ${state.ccPage} de ${pages}`;el.previousCcPage.disabled=state.ccPage<=1;el.nextCcPage.disabled=state.ccPage>=pages;updateSortButtons("cc-sort",state.ccSort);
}


function isLaborBudgetRow(row){return row.budget!==0&&`${row.item} ${row.shortItem}`.toLocaleUpperCase("es").includes("MANO DE OBRA")}
function isLaborActualRow(row){return row.actual!==0&&row.className.toLocaleUpperCase("es")==="MANO DE OBRA"}
function compactLaborItem(value){return clean(value).replace(/MANO DE OBRA/gi,"MO").replace(/\s+/g," ")}
function buildLaborOptions(){
  const monthFragment=document.createDocumentFragment();MONTHS.forEach(month=>{const option=document.createElement("option");option.value=month;option.textContent=month;monthFragment.appendChild(option)});el.laborMonthFilter.appendChild(monthFragment);refreshLaborItemOptions();
}
function refreshLaborItemOptions(){
  const current=state.laborItem,items=new Set();state.rows.forEach(row=>{if(state.laborArea&&row.category!==state.laborArea)return;if((isLaborBudgetRow(row)||isLaborActualRow(row))&&row.item)items.add(row.item)});
  const fragment=document.createDocumentFragment(),all=document.createElement("option");all.value="";all.textContent="Todas las partidas";fragment.appendChild(all);[...items].sort((a,b)=>a.localeCompare(b,"es")).forEach(item=>{const option=document.createElement("option");option.value=item;option.textContent=item;fragment.appendChild(option)});el.laborItemFilter.replaceChildren(fragment);state.laborItem=items.has(current)?current:"";el.laborItemFilter.value=state.laborItem;
}
function laborScopeRows(){return state.rows.filter(row=>(!state.laborArea||row.category===state.laborArea)&&(!state.laborItem||row.item===state.laborItem))}
function renderLaborView(){
  const scoped=laborScopeRows(),budgetRows=scoped.filter(isLaborBudgetRow),actualRows=scoped.filter(isLaborActualRow),kpiBudgetRows=state.laborMonth?budgetRows.filter(row=>row.month===state.laborMonth):budgetRows,kpiActualRows=state.laborMonth?actualRows.filter(row=>row.month===state.laborMonth):actualRows,budget=kpiBudgetRows.reduce((sum,row)=>sum+row.budget,0),actual=kpiActualRows.reduce((sum,row)=>sum+row.actual,0),value={budget,actual},dev=deviation(value);
  el.laborBudgetKpi.textContent=usd.format(budget);el.laborActualKpi.textContent=usd.format(actual);el.laborDeviationKpi.textContent=usd.format(dev);el.laborDeviationKpi.className=metricClass(dev);el.laborDeviationPercentKpi.textContent=formatPercent(deviationPercent(value));el.laborDeviationPercentKpi.className=metricClass(dev);el.laborScopeLabel.textContent=[state.laborItem||"Todas las partidas",state.laborMonth].filter(Boolean).join(" · ");
  renderLaborMonthly(budgetRows,actualRows);renderLaborDistribution(actualRows);
}
function renderLaborMonthly(budgetRows,actualRows){
  const values=MONTHS.map(()=>blankTotals());budgetRows.forEach(row=>{const index=MONTHS.indexOf(row.month);if(index>=0)values[index].budget+=row.budget});actualRows.forEach(row=>{const index=MONTHS.indexOf(row.month);if(index>=0)values[index].actual+=row.actual});state.charts.laborMonthly.data.labels=SHORT_MONTHS;state.charts.laborMonthly.data.datasets[0].data=values.map(value=>value.budget);state.charts.laborMonthly.data.datasets[1].data=values.map(value=>hasExecution(value)?value.actual:null);state.charts.laborMonthly.update();
  const fragment=document.createDocumentFragment();values.forEach((value,index)=>{const executed=hasExecution(value),dev=deviation(value),row=document.createElement("tr");appendCell(row,MONTHS[index]);appendCell(row,usd.format(value.budget),"number");appendCell(row,executed?usd.format(value.actual):"—","number");appendCell(row,executed?usd.format(dev):"—",executed?`number ${metricClass(dev)}`:"number");appendCell(row,executed?formatPercent(deviationPercent(value)):"—",executed?`number ${metricClass(dev)}`:"number");fragment.appendChild(row)});el.laborMonthlyTableBody.replaceChildren(fragment);
  const total=values.reduce((result,value)=>{result.budget+=value.budget;result.actual+=value.actual;return result},blankTotals()),dev=deviation(total),row=document.createElement("tr");appendCell(row,"TOTAL GENERAL");appendCell(row,usd.format(total.budget),"number");appendCell(row,usd.format(total.actual),"number");appendCell(row,usd.format(dev),`number ${metricClass(dev)}`);appendCell(row,formatPercent(deviationPercent(total)),`number ${metricClass(dev)}`);el.laborMonthlyTableFoot.replaceChildren(row);
}
function getLaborDistributionRows(actualRows){
  const query=clean(el.laborSearch.value).toLocaleLowerCase("es");return actualRows.filter(row=>(!state.laborMonth||row.month===state.laborMonth)&&(!query||`${row.laborId} ${row.labor}`.toLocaleLowerCase("es").includes(query)));
}
function renderLaborDistribution(actualRows){
  const filtered=getLaborDistributionRows(actualRows),groups=new Map();filtered.forEach(row=>{const item=row.item||"SIN PARTIDA",laborId=row.laborId||"SIN ID",labor=row.labor||"SIN LABOR",key=`${item}|||${laborId}|||${labor}`;if(!groups.has(key))groups.set(key,{key,item,displayItem:compactLaborItem(item),laborId,labor,actual:0});groups.get(key).actual+=row.actual});state.laborEntries=[...groups.values()].sort((a,b)=>b.actual-a.actual);const total=state.laborEntries.reduce((sum,entry)=>sum+entry.actual,0),top=state.laborEntries.slice(0,12);state.laborChartEntries=top;state.charts.laborDistribution.data.labels=top.map(entry=>`${entry.labor} · ${entry.displayItem}`);state.charts.laborDistribution.data.datasets[0].data=top.map(entry=>entry.actual);state.charts.laborDistribution.update();
  const fragment=document.createDocumentFragment();state.laborEntries.forEach(entry=>{const row=document.createElement("tr");row.tabIndex=0;row.classList.toggle("selected",state.selectedLaborKey===entry.key);row.addEventListener("click",()=>selectLabor(entry,filtered));row.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" ")selectLabor(entry,filtered)});[entry.displayItem,entry.laborId,entry.labor].forEach(value=>appendCell(row,value));appendCell(row,usd.format(entry.actual),"number");appendCell(row,total?`${Math.round(entry.actual/total*100)}%`:"—","number");fragment.appendChild(row)});el.laborTableBody.replaceChildren(fragment);el.laborTableSummary.textContent=`${number.format(state.laborEntries.length)} labores · ${usd.format(total)} ejecutado`;
  if(state.selectedLaborKey&&!groups.has(state.selectedLaborKey)){state.selectedLaborKey="";state.laborDetailRows=[];el.laborDetailPanel.hidden=true}
}
function selectLabor(entry,filteredRows){
  state.selectedLaborKey=entry.key;state.laborDetailRows=filteredRows.filter(row=>`${row.item||"SIN PARTIDA"}|||${row.laborId||"SIN ID"}|||${row.labor||"SIN LABOR"}`===entry.key);state.laborPage=1;state.laborSort={key:"month",dir:1};el.laborDetailPanel.hidden=false;el.laborDetailTitle.textContent=`${entry.laborId} · ${entry.labor}`;renderLaborView();renderLaborDetail();requestAnimationFrame(()=>el.laborDetailPanel.scrollIntoView({behavior:"smooth",block:"start"}));
}
function renderLaborDetail(){
  const sorted=sortRows(state.laborDetailRows,state.laborSort),pages=Math.max(1,Math.ceil(sorted.length/PAGE_SIZE));state.laborPage=Math.min(state.laborPage,pages);const start=(state.laborPage-1)*PAGE_SIZE,rows=sorted.slice(start,start+PAGE_SIZE),fragment=document.createDocumentFragment();rows.forEach(record=>{const row=document.createElement("tr");[record.month,record.item,record.laborId,record.labor,record.costCenterId,record.costCenter].forEach(value=>appendCell(row,value||"—"));appendCell(row,usd.format(record.actual),"number");fragment.appendChild(row)});el.laborDetailTableBody.replaceChildren(fragment);el.laborPageText.textContent=`Página ${state.laborPage} de ${pages} · ${number.format(sorted.length)} registros`;el.previousLaborPage.disabled=state.laborPage<=1;el.nextLaborPage.disabled=state.laborPage>=pages;updateSortButtons("labor-sort",state.laborSort);
}


function sortRows(rows,config){return[...rows].sort((a,b)=>{let av=config.key==="month"?MONTHS.indexOf(a.month):a[config.key],bv=config.key==="month"?MONTHS.indexOf(b.month):b[config.key];if(typeof av==="number"&&typeof bv==="number")return(av-bv)*config.dir;return String(av||"").localeCompare(String(bv||""),"es",{numeric:true,sensitivity:"base"})*config.dir})}
function toggleSort(config,key){if(config.key===key)config.dir*=-1;else{config.key=key;config.dir=1}}
function updateSortButtons(attribute,config){document.querySelectorAll(`[data-${attribute}]`).forEach(button=>{const active=button.dataset[toCamel(attribute)]===config.key;button.classList.toggle("sorted",active);button.title=active?(config.dir===1?"Orden ascendente":"Orden descendente"):"Ordenar columna"})}
function toCamel(text){return text.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())}


function createCharts(){
  Chart.defaults.font.family='Inter,"Segoe UI",Arial,sans-serif';Chart.defaults.color="#64808f";
  state.charts.monthly=new Chart(document.getElementById("monthlyChart"),{type:"bar",data:{labels:[],datasets:[budgetDataset(),actualDataset()]},options:chartOptions()});
  state.charts.detail=new Chart(document.getElementById("detailChart"),{type:"line",data:{labels:[],datasets:[budgetDataset(true),actualDataset(true)]},options:chartOptions((event,elements)=>{if(!elements.length)return;state.detailMonth=MONTHS[elements[0].index];state.detailPage=1;updateDetailMonthChip();renderDetailTable()})});
  state.charts.costCenter=new Chart(document.getElementById("costCenterChart"),{type:"bar",data:{labels:[],datasets:[actualDataset()]},options:chartOptions((event,elements)=>{if(!elements.length)return;const selected=MONTHS[elements[0].index];state.ccMonth=state.ccMonth===selected?"":selected;applyConsumptionFilters()})});
  state.charts.class=new Chart(document.getElementById("classChart"),{type:"doughnut",data:{labels:[],datasets:[{data:[],backgroundColor:["#0c4f7d","#159474","#168ca0","#72b7a5","#4a87ad","#9acfc2"],borderColor:"#ffffff",borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,onClick:(event,elements)=>{if(!elements.length)return;const selected=state.charts.class.data.labels[elements[0].index];state.ccClass=state.ccClass===selected?"":selected;applyConsumptionFilters()},plugins:{legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:9}},tooltip:{callbacks:{label:context=>`${context.label}: ${usd.format(context.raw)}`}}}}});
  state.charts.item=new Chart(document.getElementById("itemChart"),{type:"bar",data:{labels:[],datasets:[{...actualDataset(),label:"Ejecutado"}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:"y",onClick:(event,elements)=>{if(!elements.length)return;const selected=state.charts.item.data.labels[elements[0].index];state.ccItem=state.ccItem===selected?"":selected;applyConsumptionFilters()},scales:{x:{beginAtZero:true,grid:{color:"rgba(100,128,143,.12)"},ticks:{callback:value=>new Intl.NumberFormat("en-US",{notation:"compact"}).format(value)}},y:{grid:{display:false},ticks:{autoSkip:false}}},plugins:{legend:{display:false},tooltip:{callbacks:{label:context=>`Ejecutado: ${usd.format(context.raw)}`}}}}});
  state.charts.laborMonthly=new Chart(document.getElementById("laborMonthlyChart"),{type:"bar",data:{labels:[],datasets:[budgetDataset(),actualDataset()]},options:chartOptions()});
  state.charts.laborDistribution=new Chart(document.getElementById("laborDistributionChart"),{type:"bar",data:{labels:[],datasets:[{...actualDataset(),label:"Ejecutado"}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:"y",onClick:(event,elements)=>{if(!elements.length)return;const entry=state.laborChartEntries[elements[0].index],actualRows=laborScopeRows().filter(isLaborActualRow);if(entry)selectLabor(entry,getLaborDistributionRows(actualRows))},scales:{x:{beginAtZero:true,grid:{color:"rgba(100,128,143,.12)"},ticks:{callback:value=>new Intl.NumberFormat("en-US",{notation:"compact"}).format(value)}},y:{grid:{display:false},ticks:{autoSkip:false}}},plugins:{legend:{display:false},tooltip:{callbacks:{label:context=>`Ejecutado: ${usd.format(context.raw)}`}}}}});
}
function budgetDataset(line=false){return{label:"Presupuesto",data:[],backgroundColor:"rgba(22,117,173,.78)",borderColor:"#1675ad",borderWidth:line?3:0,borderRadius:5,tension:.28,fill:false}}
function actualDataset(line=false){return{label:"Ejecutado",data:[],backgroundColor:"rgba(21,148,116,.78)",borderColor:"#159474",borderWidth:line?3:0,borderRadius:5,tension:.28,fill:false,spanGaps:false}}
function chartOptions(onClick){return{responsive:true,maintainAspectRatio:false,onClick,interaction:{mode:"index",intersect:false},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:"rgba(100,128,143,.12)"},ticks:{callback:value=>new Intl.NumberFormat("en-US",{notation:"compact"}).format(value)}}},plugins:{legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:9}},tooltip:{callbacks:{label:context=>`${context.dataset.label}: ${context.raw===null?"Sin ejecución":usd.format(context.raw)}`}}}}}


function setView(view){state.view=view;["budgetView","costCenterView","laborView"].forEach(id=>document.getElementById(id).hidden=id!==view);document.querySelectorAll(".view-tab").forEach(button=>button.classList.toggle("active",button.dataset.view===view));if(view==="costCenterView")requestAnimationFrame(()=>{state.charts.costCenter.resize();state.charts.class.resize();state.charts.item.resize()});if(view==="laborView")requestAnimationFrame(()=>{state.charts.laborMonthly.resize();state.charts.laborDistribution.resize()})}
function downloadWorkbook(rows,fileName){
  if(!rows.length)return;
  const headers=["Mes","Clase","Detalle / glosa","ID costo","Centro de costo","Proveedor","Ejecutado USD"],data=[headers,...rows.map(row=>[row.month,row.className,row.detail,row.costCenterId,row.costCenter,row.supplier,row.actual])],sheet=XLSX.utils.aoa_to_sheet(data);
  sheet["!autofilter"]={ref:`A1:G${data.length}`};sheet["!cols"]=[{wch:12},{wch:20},{wch:48},{wch:16},{wch:30},{wch:32},{wch:16}];sheet["!freeze"]={xSplit:0,ySplit:1};
  headers.forEach((_,index)=>{const cell=sheet[XLSX.utils.encode_cell({r:0,c:index})];cell.s={fill:{fgColor:{rgb:"0C4F7D"}},font:{bold:true,color:{rgb:"FFFFFF"}},alignment:{horizontal:"center"}}});
  for(let row=1;row<data.length;row+=1){const cell=sheet[XLSX.utils.encode_cell({r:row,c:6})];if(cell){cell.t="n";cell.z='[$$-en-US]#,##0.00'}}
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,"Detalle ejecutado");XLSX.writeFile(workbook,`${fileName}_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function downloadConsumptionWorkbook(){
  const rows=sortRows(state.ccRows,state.ccSort);if(!rows.length)return;const headers=["Mes","Partida","Clase","Detalle / glosa","ID costo","Centro de costo","Proveedor","Ejecutado USD"],data=[headers,...rows.map(row=>[row.month,row.item,row.className,row.detail,row.costCenterId,row.costCenter,row.supplier,row.actual])],sheet=XLSX.utils.aoa_to_sheet(data);sheet["!autofilter"]={ref:`A1:H${data.length}`};sheet["!cols"]=[{wch:12},{wch:42},{wch:20},{wch:48},{wch:16},{wch:30},{wch:32},{wch:16}];headers.forEach((_,index)=>{const cell=sheet[XLSX.utils.encode_cell({r:0,c:index})];cell.s={fill:{fgColor:{rgb:"0C4F7D"}},font:{bold:true,color:{rgb:"FFFFFF"}},alignment:{horizontal:"center"}}});for(let row=1;row<data.length;row+=1){const cell=sheet[XLSX.utils.encode_cell({r:row,c:7})];if(cell){cell.t="n";cell.z='[$$-en-US]#,##0.00'}}const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,"Consulta de consumos");XLSX.writeFile(workbook,`Consulta_consumos_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function downloadLaborWorkbook(){
  const rows=sortRows(state.laborDetailRows,state.laborSort);if(!rows.length)return;const headers=["Mes","Partida","ID labor","Labor","ID costo","Centro de costo","Ejecutado USD"],data=[headers,...rows.map(row=>[row.month,row.item,row.laborId,row.labor,row.costCenterId,row.costCenter,row.actual])],sheet=XLSX.utils.aoa_to_sheet(data);sheet["!autofilter"]={ref:`A1:G${data.length}`};sheet["!cols"]=[{wch:12},{wch:42},{wch:14},{wch:38},{wch:16},{wch:32},{wch:16}];headers.forEach((_,index)=>{const cell=sheet[XLSX.utils.encode_cell({r:0,c:index})];cell.s={fill:{fgColor:{rgb:"0C4F7D"}},font:{bold:true,color:{rgb:"FFFFFF"}},alignment:{horizontal:"center"}}});for(let row=1;row<data.length;row+=1){const cell=sheet[XLSX.utils.encode_cell({r:row,c:6})];if(cell){cell.t="n";cell.z='[$$-en-US]#,##0.00'}}const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,"Detalle mano de obra");XLSX.writeFile(workbook,`Detalle_mano_de_obra_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function showError(message){el.statusText.textContent="No se pudo cargar la información";el.errorBox.textContent=message;el.errorBox.hidden=false}
function resetLaborSelection(){state.selectedLaborKey="";state.laborDetailRows=[];state.laborPage=1;el.laborDetailPanel.hidden=true}


document.querySelectorAll(".view-tab").forEach(button=>button.addEventListener("click",()=>setView(button.dataset.view)));
document.querySelectorAll(".area-button").forEach(button=>button.addEventListener("click",()=>{state.area=button.dataset.area;applyArea()}));
document.querySelectorAll(".month-view-button").forEach(button=>button.addEventListener("click",()=>{state.itemMonthView=button.dataset.monthView;buildItemsHeader();renderItems()}));
document.querySelectorAll(".consumption-area-button").forEach(button=>button.addEventListener("click",()=>{state.ccArea=button.dataset.consumptionArea;document.querySelectorAll(".consumption-area-button").forEach(candidate=>{const active=candidate.dataset.consumptionArea===state.ccArea;candidate.classList.toggle("active",active);candidate.setAttribute("aria-pressed",String(active))});runConsumptionQuery()}));
document.querySelectorAll(".labor-area-button").forEach(button=>button.addEventListener("click",()=>{state.laborArea=button.dataset.laborArea;document.querySelectorAll(".labor-area-button").forEach(candidate=>{const active=candidate.dataset.laborArea===state.laborArea;candidate.classList.toggle("active",active);candidate.setAttribute("aria-pressed",String(active))});refreshLaborItemOptions();resetLaborSelection();renderLaborView()}));
document.querySelectorAll("[data-detail-sort]").forEach(button=>button.addEventListener("click",()=>{toggleSort(state.detailSort,button.dataset.detailSort);state.detailPage=1;renderDetailTable()}));
document.querySelectorAll("[data-cc-sort]").forEach(button=>button.addEventListener("click",()=>{toggleSort(state.ccSort,button.dataset.ccSort);state.ccPage=1;renderCcTable()}));
document.querySelectorAll("[data-labor-sort]").forEach(button=>button.addEventListener("click",()=>{toggleSort(state.laborSort,button.dataset.laborSort);state.laborPage=1;renderLaborDetail()}));
el.itemSearch.addEventListener("input",renderItems);el.downloadDetailButton.addEventListener("click",()=>downloadWorkbook(getFilteredDetailRows(),"Detalle_partida"));el.downloadCcButton.addEventListener("click",downloadConsumptionWorkbook);el.closeDetailButton.addEventListener("click",()=>{state.selectedItem=null;state.detailRows=[];el.detailPanel.hidden=true;renderItems()});
el.clearDetailMonth.addEventListener("click",()=>{state.detailMonth="";state.detailPage=1;updateDetailMonthChip();renderDetailTable()});
el.previousDetailPage.addEventListener("click",()=>{state.detailPage-=1;renderDetailTable()});el.nextDetailPage.addEventListener("click",()=>{state.detailPage+=1;renderDetailTable()});
let ccTimer;function queueConsumptionQuery(){clearTimeout(ccTimer);ccTimer=setTimeout(runConsumptionQuery,180)}
[el.costCenterSearch,el.providerSearch,el.detailSearch].forEach(input=>{input.addEventListener("input",queueConsumptionQuery);input.addEventListener("change",runConsumptionQuery)});
el.clearConsumptionFilters.addEventListener("click",()=>{el.costCenterSearch.value="";el.providerSearch.value="";el.detailSearch.value="";state.ccArea="";state.ccClass="";state.ccItem="";state.ccMonth="";document.querySelectorAll(".consumption-area-button").forEach(button=>{const active=button.dataset.consumptionArea==="";button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active))});runConsumptionQuery()});
el.previousCcPage.addEventListener("click",()=>{state.ccPage-=1;renderCcTable()});el.nextCcPage.addEventListener("click",()=>{state.ccPage+=1;renderCcTable()});
el.laborItemFilter.addEventListener("change",()=>{state.laborItem=el.laborItemFilter.value;resetLaborSelection();renderLaborView()});el.laborMonthFilter.addEventListener("change",()=>{state.laborMonth=el.laborMonthFilter.value;resetLaborSelection();renderLaborView()});
let laborTimer;el.laborSearch.addEventListener("input",()=>{clearTimeout(laborTimer);laborTimer=setTimeout(()=>{resetLaborSelection();renderLaborView()},180)});
el.clearLaborFilters.addEventListener("click",()=>{state.laborArea="";state.laborItem="";state.laborMonth="";el.laborMonthFilter.value="";el.laborSearch.value="";document.querySelectorAll(".labor-area-button").forEach(button=>{const active=button.dataset.laborArea==="";button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active))});refreshLaborItemOptions();resetLaborSelection();renderLaborView()});
el.clearLaborSelection.addEventListener("click",()=>{resetLaborSelection();renderLaborView()});el.downloadLaborButton.addEventListener("click",downloadLaborWorkbook);el.previousLaborPage.addEventListener("click",()=>{state.laborPage-=1;renderLaborDetail()});el.nextLaborPage.addEventListener("click",()=>{state.laborPage+=1;renderLaborDetail()});
loadData();
