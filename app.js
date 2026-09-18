const DATA_FILES=["data/BD_ManttoSSGG.csv","data/BD_ManttoSSGG.csv.csv"];
const OPTIMIZED_DATA_FILE="data/dashboard.json.gz";
const MONTHS=["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
const SHORT_MONTHS=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

const state={rows:[],area:"",areaRows:[],itemSummaries:[],selectedItem:null,detailRows:[],detailPage:1,detailPageSize:50,charts:{}};
const el=Object.fromEntries(["statusText","downloadButton","budgetKpi","actualKpi","deviationKpi","deviationPercentKpi","budgetCaption","monthlyTableBody","itemSearch","itemsTableHead","itemsTableBody","itemsSummary","detailPanel","detailTitle","detailSubtitle","detailTableBody","closeDetailButton","previousDetailPage","nextDetailPage","detailPageText","errorBox"].map(id=>[id,document.getElementById(id)]));
const usd=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:0});
const number=new Intl.NumberFormat("es-PE");

function clean(value){return String(value??"").trim()}
function toNumber(value){
  if(typeof value==="number")return Number.isFinite(value)?value:0;
  let text=clean(value).replace(/\s/g,"");if(!text)return 0;
  if(text.includes(",")&&text.includes("."))text=text.lastIndexOf(",")>text.lastIndexOf(".")?text.replace(/\./g,"").replace(",","."):text.replace(/,/g,"");
  else if(text.includes(","))text=text.replace(",",".");
  const parsed=Number(text);return Number.isFinite(parsed)?parsed:0;
}
function prepareRow(row){row.search=[row.item,row.shortItem,row.detail,row.costCenter,row.account,row.supplier].join(" ").toLocaleLowerCase("es");return row}
function normalizeRow(row){return prepareRow({
  month:clean(row["MES'"]).toUpperCase(),category:clean(row["Rubro'"]),item:clean(row["Partida'"]),shortItem:clean(row["Partida*"]),className:clean(row.Clase),
  detail:clean(row["DETALLE*"])||clean(row["Glosa'"])||clean(row.DETALLE),costCenter:clean(row.CCOSTO)||clean(row.IDCCOSTO),account:clean(row.CUENTA)||clean(row.IDCUENTA),
  supplier:clean(row.RAZON_SOCIAL),period:clean(row.PERIODO),quantity:toNumber(row.CANTIDAD),budget:toNumber(row["$ SEM"]),actual:toNumber(row.IMPORTE)
})}
function dictionaryValue(dictionary,position){return position>=0?dictionary[position]||"":""}
async function loadOptimizedData(){
  const response=await fetch(OPTIMIZED_DATA_FILE);if(!response.ok)throw new Error(`Archivo optimizado no disponible (${response.status})`);
  const bytes=new Uint8Array(await response.arrayBuffer());let jsonText;
  if(bytes[0]===0x1f&&bytes[1]===0x8b){
    if(typeof DecompressionStream==="undefined")throw new Error("Navegador sin descompresión rápida");
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));jsonText=await new Response(stream).text();
  }else jsonText=new TextDecoder().decode(bytes);
  const data=JSON.parse(jsonText);
  return data.rows.map(row=>prepareRow({
    month:dictionaryValue(data.months,row[0]),category:dictionaryValue(data.categories,row[1]),item:dictionaryValue(data.items,row[2]),shortItem:dictionaryValue(data.shortItems,row[3]),
    className:dictionaryValue(data.classes,row[4]),detail:row[5]||"",costCenter:dictionaryValue(data.costCenters,row[6]),account:dictionaryValue(data.accounts,row[7]),
    supplier:dictionaryValue(data.suppliers,row[8]),period:dictionaryValue(data.periods,row[9]),quantity:row[10]||0,budget:row[11]||0,actual:row[12]||0
  }))
}
function parseCsv(url){return new Promise((resolve,reject)=>Papa.parse(url,{download:true,header:true,skipEmptyLines:"greedy",worker:true,complete:result=>result.data?.length?resolve(result.data):reject(new Error("CSV vacío")),error:reject}))}
async function loadData(){
  try{state.rows=await loadOptimizedData()}
  catch(optimizedError){
    console.info("Usando CSV de respaldo:",optimizedError.message);let lastError;
    for(const file of DATA_FILES){try{state.rows=(await parseCsv(file)).map(normalizeRow).filter(row=>row.month||row.item||row.actual||row.budget);break}catch(error){lastError=error}}
    if(!state.rows.length){showError(`No se pudo leer la base de datos. ${lastError?.message||"Verifica el CSV."}`);return}
  }
  initialize();
}
function initialize(){createCharts();buildItemsHeader();el.itemSearch.disabled=false;el.downloadButton.disabled=false;el.statusText.textContent=`${number.format(state.rows.length)} registros disponibles`;applyArea()}
function blankTotals(){return{budget:0,actual:0}}
function addTotals(target,row){target.budget+=row.budget;target.actual+=row.actual;return target}
function totals(rows){return rows.reduce(addTotals,blankTotals())}
function deviation(value){return value.budget-value.actual}
function deviationPercent(value){return value.budget?deviation(value)/value.budget:null}
function formatPercent(value){return value===null?"—":`${(value*100).toLocaleString("es-PE",{maximumFractionDigits:1})}%`}
function metricClass(value){return value>=0?"positive":"negative"}

function applyArea(){
  state.areaRows=state.area?state.rows.filter(row=>row.category===state.area):[...state.rows];state.selectedItem=null;state.detailRows=[];el.detailPanel.hidden=true;el.itemSearch.value="";
  updateAreaButtons();renderKpis();renderMonthly();buildItemSummaries();renderItems();
}
function updateAreaButtons(){
  document.querySelectorAll(".area-button").forEach(button=>{const active=button.dataset.area===state.area;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active))});
  const areaName=state.area==="SERVICIOS GENERALES"?"SSGG":(state.area||"todas las áreas");el.budgetCaption.textContent=`Presupuesto de ${areaName.toLocaleLowerCase("es")}`;
}
function renderKpis(){
  const value=totals(state.areaRows),dev=deviation(value);el.budgetKpi.textContent=usd.format(value.budget);el.actualKpi.textContent=usd.format(value.actual);el.deviationKpi.textContent=usd.format(dev);
  el.deviationKpi.className=metricClass(dev);el.deviationPercentKpi.textContent=formatPercent(deviationPercent(value));el.deviationPercentKpi.className=metricClass(dev);
}
function monthlyTotals(rows){const result=MONTHS.map(()=>blankTotals());rows.forEach(row=>{const index=MONTHS.indexOf(row.month);if(index>=0)addTotals(result[index],row)});return result}
function renderMonthly(){
  const values=monthlyTotals(state.areaRows);state.charts.monthly.data.labels=SHORT_MONTHS;state.charts.monthly.data.datasets[0].data=values.map(value=>value.budget);state.charts.monthly.data.datasets[1].data=values.map(value=>value.actual);state.charts.monthly.update();
  el.monthlyTableBody.replaceChildren();const fragment=document.createDocumentFragment();
  values.forEach((value,index)=>{const dev=deviation(value),row=document.createElement("tr");appendCell(row,MONTHS[index]);appendCell(row,usd.format(value.budget),"number");appendCell(row,usd.format(value.actual),"number");appendCell(row,usd.format(dev),`number ${metricClass(dev)}`);appendCell(row,formatPercent(deviationPercent(value)),`number ${metricClass(dev)}`);fragment.appendChild(row)});
  el.monthlyTableBody.appendChild(fragment);
}
function buildItemSummaries(){
  const map=new Map();state.areaRows.forEach(row=>{
    const key=row.item||row.shortItem||"SIN PARTIDA";
    if(!map.has(key))map.set(key,{key,name:row.shortItem||row.item||"SIN PARTIDA",fullName:row.item,months:MONTHS.map(()=>blankTotals()),total:blankTotals()});
    const summary=map.get(key);addTotals(summary.total,row);const monthIndex=MONTHS.indexOf(row.month);if(monthIndex>=0)addTotals(summary.months[monthIndex],row);
  });
  state.itemSummaries=[...map.values()].sort((a,b)=>b.total.budget-a.total.budget);
}
function buildItemsHeader(){
  const groupRow=document.createElement("tr"),subRow=document.createElement("tr"),itemHeader=document.createElement("th");itemHeader.textContent="Partida";itemHeader.rowSpan=2;itemHeader.className="sticky-column";groupRow.appendChild(itemHeader);
  appendGroupHeader(groupRow,"TOTAL ANUAL","annual-heading");MONTHS.forEach(month=>appendGroupHeader(groupRow,month,"month-heading"));for(let index=0;index<13;index+=1)appendMetricHeaders(subRow);el.itemsTableHead.replaceChildren(groupRow,subRow);
}
function appendGroupHeader(row,text,className){const cell=document.createElement("th");cell.textContent=text;cell.colSpan=4;cell.className=className;row.appendChild(cell)}
function appendMetricHeaders(row){[["Ppto.","sub-budget"],["Ejec.","sub-actual"],["Desv. $","sub-deviation"],["Desv. %","sub-deviation"]].forEach(([text,className])=>{const cell=document.createElement("th");cell.textContent=text;cell.className=className;row.appendChild(cell)})}
function renderItems(){
  const query=clean(el.itemSearch.value).toLocaleLowerCase("es"),summaries=query?state.itemSummaries.filter(item=>`${item.name} ${item.fullName}`.toLocaleLowerCase("es").includes(query)):state.itemSummaries;
  el.itemsTableBody.replaceChildren();const fragment=document.createDocumentFragment();
  summaries.forEach(summary=>{
    const row=document.createElement("tr");row.tabIndex=0;row.classList.toggle("selected",state.selectedItem?.key===summary.key);row.addEventListener("click",()=>selectItem(summary));row.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" ")selectItem(summary)});
    const itemCell=document.createElement("td");itemCell.className="sticky-column";itemCell.textContent=summary.name;
    if(summary.fullName&&summary.fullName!==summary.name){const fullName=document.createElement("span");fullName.className="item-full-name";fullName.textContent=summary.fullName;itemCell.appendChild(fullName)}
    row.appendChild(itemCell);appendMetrics(row,summary.total);summary.months.forEach(value=>appendMetrics(row,value));fragment.appendChild(row);
  });
  el.itemsTableBody.appendChild(fragment);el.itemsSummary.textContent=`${number.format(summaries.length)} partidas · Selecciona una para ver el detalle`;
}
function appendMetrics(row,value){const dev=deviation(value);appendCell(row,value.budget?usd.format(value.budget):"—","number");appendCell(row,value.actual?usd.format(value.actual):"—","number");appendCell(row,(value.budget||value.actual)?usd.format(dev):"—",`number ${metricClass(dev)}`);appendCell(row,formatPercent(deviationPercent(value)),`number ${metricClass(dev)}`)}
function appendCell(row,text,className=""){const cell=document.createElement("td");cell.textContent=text;cell.className=className;row.appendChild(cell);return cell}

function selectItem(summary){
  state.selectedItem=summary;state.detailRows=state.areaRows.filter(row=>(row.item||row.shortItem||"SIN PARTIDA")===summary.key).sort((a,b)=>MONTHS.indexOf(a.month)-MONTHS.indexOf(b.month));state.detailPage=1;
  el.detailPanel.hidden=false;renderItems();renderDetail();requestAnimationFrame(()=>el.detailPanel.scrollIntoView({behavior:"smooth",block:"start"}));
}
function renderDetail(){
  const summary=state.selectedItem;if(!summary)return;el.detailTitle.textContent=summary.name;el.detailSubtitle.textContent=`${summary.fullName||summary.name} · ${number.format(state.detailRows.length)} registros`;
  state.charts.detail.data.labels=SHORT_MONTHS;state.charts.detail.data.datasets[0].data=summary.months.map(value=>value.budget);state.charts.detail.data.datasets[1].data=summary.months.map(value=>value.actual);state.charts.detail.update();renderDetailTable();
}
function renderDetailTable(){
  const pages=Math.max(1,Math.ceil(state.detailRows.length/state.detailPageSize));state.detailPage=Math.min(state.detailPage,pages);const start=(state.detailPage-1)*state.detailPageSize,rows=state.detailRows.slice(start,start+state.detailPageSize);
  el.detailTableBody.replaceChildren();const fragment=document.createDocumentFragment();rows.forEach(record=>{const row=document.createElement("tr");[record.month,record.className,record.detail,record.costCenter,record.account,record.supplier].forEach(value=>appendCell(row,value||"—"));appendCell(row,record.budget?usd.format(record.budget):"—","number");appendCell(row,record.actual?usd.format(record.actual):"—","number");fragment.appendChild(row)});el.detailTableBody.appendChild(fragment);
  el.detailPageText.textContent=`Página ${state.detailPage} de ${pages}`;el.previousDetailPage.disabled=state.detailPage<=1;el.nextDetailPage.disabled=state.detailPage>=pages;
}
function createCharts(){
  Chart.defaults.font.family='Inter,"Segoe UI",Arial,sans-serif';Chart.defaults.color="#64808f";
  state.charts.monthly=new Chart(document.getElementById("monthlyChart"),{type:"bar",data:{labels:[],datasets:chartDatasets()},options:chartOptions()});
  state.charts.detail=new Chart(document.getElementById("detailChart"),{type:"line",data:{labels:[],datasets:chartDatasets(true)},options:chartOptions()});
}
function chartDatasets(line=false){return[
  {label:"Presupuesto",data:[],backgroundColor:"rgba(22,117,173,.78)",borderColor:"#1675ad",borderWidth:line?3:0,borderRadius:5,tension:.28,fill:false},
  {label:"Ejecutado",data:[],backgroundColor:"rgba(21,148,116,.78)",borderColor:"#159474",borderWidth:line?3:0,borderRadius:5,tension:.28,fill:false}
]}
function chartOptions(){return{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:"rgba(100,128,143,.12)"},ticks:{callback:value=>new Intl.NumberFormat("en-US",{notation:"compact"}).format(value)}}},plugins:{legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:9}},tooltip:{callbacks:{label:context=>`${context.dataset.label}: ${usd.format(context.raw)}`}}}}}
function downloadData(){
  const rows=state.selectedItem?state.detailRows:state.areaRows,exportRows=rows.map(row=>({AREA:row.category,MES:row.month,PARTIDA:row.item,"PARTIDA RESUMIDA":row.shortItem,CLASE:row.className,DETALLE:row.detail,"CENTRO DE COSTO":row.costCenter,CUENTA:row.account,PROVEEDOR:row.supplier,PRESUPUESTO_USD:row.budget,EJECUTADO_USD:row.actual}));
  const csv="\ufeff"+Papa.unparse(exportRows,{delimiter:";"}),blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`Mantto_SSGG_${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(link.href);
}
function closeDetail(){state.selectedItem=null;state.detailRows=[];el.detailPanel.hidden=true;renderItems()}
function showError(message){el.statusText.textContent="No se pudo cargar la información";el.errorBox.textContent=message;el.errorBox.hidden=false}

document.querySelectorAll(".area-button").forEach(button=>button.addEventListener("click",()=>{state.area=button.dataset.area;applyArea()}));
el.itemSearch.addEventListener("input",renderItems);el.downloadButton.addEventListener("click",downloadData);el.closeDetailButton.addEventListener("click",closeDetail);
el.previousDetailPage.addEventListener("click",()=>{state.detailPage-=1;renderDetailTable()});el.nextDetailPage.addEventListener("click",()=>{state.detailPage+=1;renderDetailTable()});
loadData();
