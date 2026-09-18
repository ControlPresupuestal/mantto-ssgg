const DATA_FILES = [
  "data/BD_ManttoSSGG.csv",
  "data/BD_ManttoSSGG.csv.csv"
];

const OPTIMIZED_DATA_FILE = "data/dashboard.json.gz";

const MONTHS = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
];

const state = {
  rows: [],
  filtered: [],
  currentPage: 1,
  pageSize: 50,
  charts: {}
};

const el = Object.fromEntries([
  "statusText", "downloadButton", "clearButton", "monthFilter", "categoryFilter",
  "itemFilter", "classFilter", "searchFilter", "budgetKpi", "actualKpi",
  "executionKpi", "recordsKpi", "totalRecordsText", "tableBody", "tableSummary",
  "pageSize", "previousPage", "nextPage", "pageText", "errorBox"
].map(id => [id, document.getElementById(id)]));

const money = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("es-PE");

function clean(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let text = clean(value).replace(/\s/g, "");
  if (!text) return 0;

  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRow(row) {
  const detail = clean(row["DETALLE*"]) || clean(row["Glosa'"]) || clean(row.DETALLE);
  return prepareRow({
    month: clean(row["MES'"]).toUpperCase(),
    category: clean(row["Rubro'"]),
    item: clean(row["Partida'"]),
    shortItem: clean(row["Partida*"]),
    className: clean(row.Clase),
    detail,
    costCenter: clean(row.CCOSTO) || clean(row.IDCCOSTO),
    account: clean(row.CUENTA) || clean(row.IDCUENTA),
    supplier: clean(row.RAZON_SOCIAL),
    period: clean(row.PERIODO),
    quantity: toNumber(row.CANTIDAD),
    budget: toNumber(row["$ SEM"]),
    actual: toNumber(row.IMPORTE)
  });
}

function prepareRow(normalized) {
  normalized.search = [
    normalized.month, normalized.category, normalized.item, normalized.shortItem,
    normalized.className, normalized.detail, normalized.costCenter,
    normalized.account, normalized.supplier, normalized.period
  ].join(" ").toLocaleLowerCase("es");

  return normalized;
}

function dictionaryValue(dictionary, position) {
  return position >= 0 ? dictionary[position] || "" : "";
}

async function loadOptimizedData() {
  const response = await fetch(OPTIMIZED_DATA_FILE);
  if (!response.ok) throw new Error(`Archivo optimizado no disponible (${response.status})`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  let jsonText;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Este navegador no admite la descompresión rápida.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    jsonText = await new Response(stream).text();
  } else {
    jsonText = new TextDecoder().decode(bytes);
  }

  const data = JSON.parse(jsonText);
  return data.rows.map(row => prepareRow({
    month: dictionaryValue(data.months, row[0]),
    category: dictionaryValue(data.categories, row[1]),
    item: dictionaryValue(data.items, row[2]),
    shortItem: dictionaryValue(data.shortItems, row[3]),
    className: dictionaryValue(data.classes, row[4]),
    detail: row[5] || "",
    costCenter: dictionaryValue(data.costCenters, row[6]),
    account: dictionaryValue(data.accounts, row[7]),
    supplier: dictionaryValue(data.suppliers, row[8]),
    period: dictionaryValue(data.periods, row[9]),
    quantity: row[10] || 0,
    budget: row[11] || 0,
    actual: row[12] || 0
  }));
}

function parseCsv(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: "greedy",
      worker: true,
      complete: result => {
        if (result.errors?.length && !result.data?.length) {
          reject(new Error(result.errors[0].message));
          return;
        }
        resolve(result.data);
      },
      error: reject
    });
  });
}

async function loadData() {
  try {
    state.rows = await loadOptimizedData();
    if (!state.rows.length) throw new Error("El archivo optimizado está vacío.");
    initialize();
    return;
  } catch (optimizedError) {
    console.info("Se utilizará el CSV de respaldo:", optimizedError.message);
  }

  let lastError;
  for (const file of DATA_FILES) {
    try {
      const rawRows = await parseCsv(file);
      state.rows = rawRows.map(normalizeRow).filter(row => row.month || row.item || row.actual || row.budget);
      if (!state.rows.length) throw new Error("El archivo no contiene registros utilizables.");
      initialize();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  showError(`No se pudo leer la base de datos. ${lastError?.message || "Verifica el archivo CSV."}`);
}

function initialize() {
  populateSelect(el.monthFilter, MONTHS.filter(month => state.rows.some(row => row.month === month)));
  populateSelect(el.categoryFilter, uniqueValues("category"));
  populateSelect(el.itemFilter, uniqueValues("item"));
  populateSelect(el.classFilter, uniqueValues("className"));

  [el.monthFilter, el.categoryFilter, el.itemFilter, el.classFilter, el.searchFilter, el.downloadButton]
    .forEach(control => { control.disabled = false; });

  el.statusText.textContent = `${number.format(state.rows.length)} registros cargados`;
  el.totalRecordsText.textContent = `de ${number.format(state.rows.length)} registros`;
  createCharts();
  applyFilters();
}

function uniqueValues(key) {
  return [...new Set(state.rows.map(row => row[key]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

function populateSelect(select, values) {
  const first = select.options[0];
  select.replaceChildren(first);
  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function applyFilters() {
  const month = el.monthFilter.value;
  const category = el.categoryFilter.value;
  const item = el.itemFilter.value;
  const className = el.classFilter.value;
  const query = clean(el.searchFilter.value).toLocaleLowerCase("es");

  state.filtered = state.rows.filter(row =>
    (!month || row.month === month) &&
    (!category || row.category === category) &&
    (!item || row.item === item) &&
    (!className || row.className === className) &&
    (!query || row.search.includes(query))
  );

  state.currentPage = 1;
  render();
}

function render() {
  renderKpis();
  updateCharts();
  renderTable();
}

function totals(rows) {
  return rows.reduce((sum, row) => {
    sum.budget += row.budget;
    sum.actual += row.actual;
    return sum;
  }, { budget: 0, actual: 0 });
}

function renderKpis() {
  const total = totals(state.filtered);
  const execution = total.budget ? total.actual / total.budget : 0;
  el.budgetKpi.textContent = money.format(total.budget);
  el.actualKpi.textContent = money.format(total.actual);
  el.executionKpi.textContent = `${(execution * 100).toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
  el.recordsKpi.textContent = number.format(state.filtered.length);
}

function createCharts() {
  Chart.defaults.font.family = 'Inter, "Segoe UI", Arial, sans-serif';
  Chart.defaults.color = "#667987";

  state.charts.monthly = new Chart(document.getElementById("monthlyChart"), {
    type: "bar",
    data: { labels: [], datasets: chartDatasets() },
    options: chartOptions()
  });

  state.charts.items = new Chart(document.getElementById("itemsChart"), {
    type: "bar",
    data: { labels: [], datasets: chartDatasets() },
    options: {
      ...chartOptions(),
      indexAxis: "y",
      plugins: {
        ...chartOptions().plugins,
        legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 9 } }
      }
    }
  });
}

function chartDatasets() {
  return [
    { label: "Presupuesto", data: [], backgroundColor: "#e99138", borderRadius: 4 },
    { label: "Ejecutado", data: [], backgroundColor: "#178f8b", borderRadius: 4 }
  ];
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0 } },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(102,121,135,.12)" },
        ticks: { callback: value => compactMoney(value) }
      }
    },
    plugins: {
      legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 9 } },
      tooltip: { callbacks: { label: context => `${context.dataset.label}: ${money.format(context.raw)}` } }
    }
  };
}

function compactMoney(value) {
  return new Intl.NumberFormat("es-PE", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function updateCharts() {
  const monthly = new Map(MONTHS.map(month => [month, { budget: 0, actual: 0 }]));
  const items = new Map();

  state.filtered.forEach(row => {
    if (monthly.has(row.month)) {
      monthly.get(row.month).budget += row.budget;
      monthly.get(row.month).actual += row.actual;
    }

    const itemName = row.shortItem || row.item || "SIN PARTIDA";
    const itemTotal = items.get(itemName) || { budget: 0, actual: 0 };
    itemTotal.budget += row.budget;
    itemTotal.actual += row.actual;
    items.set(itemName, itemTotal);
  });

  const visibleMonths = [...monthly.entries()].filter(([, value]) => value.budget || value.actual);
  replaceChartData(state.charts.monthly, visibleMonths.map(([name]) => name), visibleMonths.map(([, value]) => value));

  const topItems = [...items.entries()]
    .sort((a, b) => (b[1].budget + b[1].actual) - (a[1].budget + a[1].actual))
    .slice(0, 10)
    .reverse();
  replaceChartData(state.charts.items, topItems.map(([name]) => name), topItems.map(([, value]) => value));
}

function replaceChartData(chart, labels, values) {
  chart.data.labels = labels;
  chart.data.datasets[0].data = values.map(value => value.budget);
  chart.data.datasets[1].data = values.map(value => value.actual);
  chart.update();
}

function renderTable() {
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
  state.currentPage = Math.min(state.currentPage, totalPages);
  const start = (state.currentPage - 1) * state.pageSize;
  const pageRows = state.filtered.slice(start, start + state.pageSize);
  el.tableBody.replaceChildren();

  if (!pageRows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.className = "empty-row";
    cell.textContent = "No se encontraron registros con estos filtros.";
    row.appendChild(cell);
    el.tableBody.appendChild(row);
  } else {
    const fragment = document.createDocumentFragment();
    pageRows.forEach(record => {
      const row = document.createElement("tr");
      [
        record.month,
        record.category,
        record.shortItem || record.item,
        record.className,
        record.detail,
        record.costCenter,
        record.budget ? money.format(record.budget) : "—",
        record.actual ? money.format(record.actual) : "—"
      ].forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value || "—";
        if (index >= 6) cell.className = "number";
        row.appendChild(cell);
      });
      fragment.appendChild(row);
    });
    el.tableBody.appendChild(fragment);
  }

  const shownFrom = state.filtered.length ? start + 1 : 0;
  const shownTo = Math.min(start + state.pageSize, state.filtered.length);
  el.tableSummary.textContent = `Mostrando ${number.format(shownFrom)}–${number.format(shownTo)} de ${number.format(state.filtered.length)}`;
  el.pageText.textContent = `Página ${state.currentPage} de ${totalPages}`;
  el.previousPage.disabled = state.currentPage <= 1;
  el.nextPage.disabled = state.currentPage >= totalPages;
}

function downloadFiltered() {
  const exportRows = state.filtered.map(row => ({
    MES: row.month,
    RUBRO: row.category,
    PARTIDA: row.item,
    "PARTIDA RESUMIDA": row.shortItem,
    CLASE: row.className,
    DETALLE: row.detail,
    "CENTRO DE COSTO": row.costCenter,
    CUENTA: row.account,
    PROVEEDOR: row.supplier,
    PRESUPUESTO: row.budget,
    EJECUTADO: row.actual
  }));

  const csv = "\ufeff" + Papa.unparse(exportRows, { delimiter: ";" });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Mantto_SSGG_filtrado_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function clearFilters() {
  el.monthFilter.value = "";
  el.categoryFilter.value = "";
  el.itemFilter.value = "";
  el.classFilter.value = "";
  el.searchFilter.value = "";
  applyFilters();
}

function showError(message) {
  el.statusText.textContent = "No se pudo cargar la información";
  el.errorBox.textContent = message;
  el.errorBox.hidden = false;
}

let searchTimer;
[el.monthFilter, el.categoryFilter, el.itemFilter, el.classFilter]
  .forEach(control => control.addEventListener("change", applyFilters));

el.searchFilter.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 220);
});
el.clearButton.addEventListener("click", clearFilters);
el.downloadButton.addEventListener("click", downloadFiltered);
el.pageSize.addEventListener("change", () => {
  state.pageSize = Number(el.pageSize.value);
  state.currentPage = 1;
  renderTable();
});
el.previousPage.addEventListener("click", () => { state.currentPage -= 1; renderTable(); });
el.nextPage.addEventListener("click", () => { state.currentPage += 1; renderTable(); });

loadData();
