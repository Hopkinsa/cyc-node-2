import { renderReportTrend } from './report-chart.js';

const elements = {
  title: document.querySelector('#title'),
  subtitle: document.querySelector('#subtitle'),
  reportsLink: document.querySelector('#reports-link'),
  message: document.querySelector('#message'),
  refresh: document.querySelector('#refresh'),
  scopeFiles: document.querySelector('#scope-files'),
  scopeStartDate: document.querySelector('#scope-start-date'),
  scopeEndDate: document.querySelector('#scope-end-date'),
  scopeClear: document.querySelector('#scope-clear'),
  scopeSummary: document.querySelector('#scope-summary'),
  scopedTrendChart: document.querySelector('#scoped-trend-chart'),
  scopedChartToggles: document.querySelectorAll('.scoped-chart-toggle'),
  hotspotTable: document.querySelector('#hotspot-table'),
};

const [, , idxSegment] = window.location.pathname.split('/');
const reportIdx = Number(idxSegment);
let scopedHistory = [];
const activeMetrics = new Set([
  'averageComplexityPerFunction',
  'highComplexityFileCount',
]);
const hotspotTableState = {
  rows: [],
  filter: '',
  sortKey: 'latestComplexity',
  sortDirection: 'desc',
};
let hotspotFilterTimer;

const setStatus = (message, state = '') => {
  elements.message.textContent = message;
  if (state) {
    elements.message.dataset.state = state;
  } else {
    delete elements.message.dataset.state;
  }
};

const formatPath = (path) => String(path).replaceAll('/', ' / ');

const getComplexityClass = (complexity) => {
  if (complexity < 6) return 'minimum';
  if (complexity < 11) return 'minor';
  if (complexity < 21) return 'medium';
  return 'high';
};

const dateForInput = (timestamp) => {
  const date = new Date(Number(timestamp) * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getSelectedFiles = () => Array.from(elements.scopeFiles.selectedOptions)
  .map((option) => option.value);

const getScopedRuns = () => {
  const selectedFiles = new Set(getSelectedFiles());
  const startTimestamp = elements.scopeStartDate.value
    ? Math.floor(new Date(`${elements.scopeStartDate.value}T00:00:00`).getTime() / 1000)
    : Number.NEGATIVE_INFINITY;
  const endTimestamp = elements.scopeEndDate.value
    ? Math.floor(new Date(`${elements.scopeEndDate.value}T00:00:00`).getTime() / 1000) + 86400
    : Number.POSITIVE_INFINITY;

  return scopedHistory
    .filter((run) => run.timestamp >= startTimestamp && run.timestamp < endTimestamp)
    .map((run) => {
      const files = selectedFiles.size === 0
        ? run.files
        : run.files.filter((file) => selectedFiles.has(file.filename));
      const totalComplexity = files.reduce(
        (total, file) => total + Number(file.fileComplexity || 0),
        0
      );
      const functionCount = files.reduce(
        (total, file) => total + Number(file.totalFunctions || 0),
        0
      );

      return {
        timestamp: run.timestamp,
        report: run.report,
        totalComplexity,
        averageComplexityPerFunction: functionCount > 0
          ? totalComplexity / functionCount
          : 0,
        highComplexityFileCount: files.filter(
          (file) => Number(file.averageComplexity || 0) > 20
        ).length,
      };
    });
};

const renderHotspots = () => {
  elements.hotspotTable.textContent = '';
  const rows = hotspotTableState.rows
    .filter((row) => row.file.toLowerCase().includes(hotspotTableState.filter.toLowerCase()))
    .slice()
    .sort((left, right) => {
      const multiplier = hotspotTableState.sortDirection === 'asc' ? 1 : -1;
      if (hotspotTableState.sortKey === 'file') {
        return left.file.localeCompare(right.file, undefined, { numeric: true }) * multiplier;
      }
      return (Number(left[hotspotTableState.sortKey]) - Number(right[hotspotTableState.sortKey])) * multiplier;
    });
  const wrapper = document.createElement('div');
  wrapper.className = 'report-table-shell hotspot-table-shell';
  const toolbar = document.createElement('div');
  toolbar.className = 'table-toolbar';
  const resultCount = document.createElement('p');
  resultCount.className = 'table-results';
  resultCount.textContent = `${rows.length} of ${hotspotTableState.rows.length} files shown`;
  const filter = document.createElement('input');
  filter.type = 'search';
  filter.value = hotspotTableState.filter;
  filter.placeholder = 'Filter files';
  filter.setAttribute('aria-label', 'Filter hotspot files');
  filter.addEventListener('input', () => {
    hotspotTableState.filter = filter.value;
    clearTimeout(hotspotFilterTimer);
    hotspotFilterTimer = setTimeout(renderHotspots, 350);
  });
  toolbar.append(resultCount, filter);
  wrapper.append(toolbar);

  const columns = [
    { key: 'file', label: 'File' },
    { key: 'latestComplexity', label: 'Latest total complexity' },
    { key: 'complexityChange', label: 'Change in period' },
    { key: 'peakComplexity', label: 'Peak complexity' },
    { key: 'observations', label: 'Reports containing file' },
  ];
  const table = document.createElement('table');
  const headRow = document.createElement('tr');
  columns.forEach((column) => {
    const header = document.createElement('th');
    const sortButton = document.createElement('button');
    sortButton.type = 'button';
    sortButton.className = 'table-sort';
    sortButton.textContent = column.label;
    sortButton.dataset.direction = hotspotTableState.sortKey === column.key
      ? hotspotTableState.sortDirection
      : '';
    sortButton.addEventListener('click', () => {
      if (hotspotTableState.sortKey === column.key) {
        hotspotTableState.sortDirection = hotspotTableState.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        hotspotTableState.sortKey = column.key;
        hotspotTableState.sortDirection = column.key === 'file' ? 'asc' : 'desc';
      }
      renderHotspots();
    });
    header.append(sortButton);
    headRow.append(header);
  });
  const thead = document.createElement('thead');
  thead.append(headRow);
  table.append(thead);
  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    columns.forEach((column) => {
      const cell = document.createElement('td');
      if (column.key === 'file') {
        cell.textContent = formatPath(row.file);
      } else if (column.key === 'complexityChange') {
        cell.textContent = `${row.complexityChange > 0 ? '+' : ''}${row.complexityChange.toFixed(2)}`;
      } else if (column.key === 'latestComplexity' || column.key === 'peakComplexity') {
        const score = document.createElement('span');
        score.className = `complexityScore ${getComplexityClass(row[column.key])}`;
        score.textContent = row[column.key].toFixed(2);
        cell.append(score);
      } else {
        cell.textContent = String(row[column.key]);
      }
      tr.append(cell);
    });
    tbody.append(tr);
  });
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'empty-table';
    cell.colSpan = columns.length;
    cell.textContent = 'No files match this scope and date range.';
    tr.append(cell);
    tbody.append(tr);
  }
  table.append(tbody);
  wrapper.append(table);
  elements.hotspotTable.append(wrapper);
};

const updateAnalysis = () => {
  const runs = getScopedRuns();
  const selectedFiles = getSelectedFiles();
  const scopeName = selectedFiles.length === 0
    ? 'Application'
    : selectedFiles.length === 1
      ? selectedFiles[0]
      : `${selectedFiles.length} selected files`;
  elements.scopeSummary.textContent = `${scopeName}: ${runs.length} runs in the selected date range.`;
  renderReportTrend(elements.scopedTrendChart, runs, Array.from(activeMetrics));

  const runTimestamps = new Set(runs.map((run) => run.timestamp));
  const selectedFileSet = new Set(selectedFiles);
  const filesByName = new Map();
  scopedHistory.forEach((run) => {
    if (!runTimestamps.has(run.timestamp)) return;
    run.files.forEach((file) => {
      if (selectedFileSet.size > 0 && !selectedFileSet.has(file.filename)) return;
      const observations = filesByName.get(file.filename) ?? [];
      observations.push({ timestamp: run.timestamp, complexity: Number(file.fileComplexity || 0) });
      filesByName.set(file.filename, observations);
    });
  });
  hotspotTableState.rows = Array.from(filesByName, ([file, observations]) => {
    const ordered = observations.sort((left, right) => left.timestamp - right.timestamp);
    const latestComplexity = ordered.at(-1).complexity;
    return {
      file,
      latestComplexity,
      complexityChange: latestComplexity - ordered[0].complexity,
      peakComplexity: Math.max(...ordered.map((observation) => observation.complexity)),
      observations: ordered.length,
    };
  });
  renderHotspots();
};

const resetDateRange = () => {
  if (scopedHistory.length === 0) return;
  const firstDate = dateForInput(scopedHistory[0].timestamp);
  const lastDate = dateForInput(scopedHistory.at(-1).timestamp);
  [elements.scopeStartDate, elements.scopeEndDate].forEach((input) => {
    input.min = firstDate;
    input.max = lastDate;
  });
  elements.scopeStartDate.value = firstDate;
  elements.scopeEndDate.value = lastDate;
};

const renderFileOptions = () => {
  const filenames = Array.from(new Set(
    scopedHistory.flatMap((run) => run.files.map((file) => file.filename))
  )).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  elements.scopeFiles.textContent = '';
  filenames.forEach((filename) => {
    const option = document.createElement('option');
    option.value = filename;
    option.textContent = filename;
    elements.scopeFiles.append(option);
  });
};

const loadAnalysis = async () => {
  const [reportResponse, trendResponse] = await Promise.all([
    fetch(`/api/reports/${reportIdx}`),
    fetch(`/api/reports/${reportIdx}/trends`),
  ]);
  const [reportData, trendData] = await Promise.all([
    reportResponse.json(),
    trendResponse.json(),
  ]);
  if (!reportResponse.ok) throw new Error(reportData.error || 'Unable to load report data.');
  if (!trendResponse.ok) throw new Error(trendData.error || 'Unable to load complexity trend data.');

  elements.title.textContent = reportData.report.NAME;
  elements.subtitle.textContent = `Historical complexity for ${trendData.projectKey}`;
  elements.reportsLink.href = `/reports/${reportIdx}`;
  document.querySelector('#analysis-link').href = `/reports/${reportIdx}/analysis`;
  scopedHistory = trendData.history;
  renderFileOptions();
  resetDateRange();
  updateAnalysis();
  setStatus('Complexity analysis loaded.', 'success');
};

elements.scopeFiles.addEventListener('change', updateAnalysis);
elements.scopeStartDate.addEventListener('change', updateAnalysis);
elements.scopeEndDate.addEventListener('change', updateAnalysis);
elements.scopeClear.addEventListener('click', () => {
  Array.from(elements.scopeFiles.options).forEach((option) => { option.selected = false; });
  resetDateRange();
  updateAnalysis();
});
elements.scopedChartToggles.forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const metric = toggle.dataset.metric;
    if (!metric) return;
    if (activeMetrics.has(metric)) activeMetrics.delete(metric);
    else activeMetrics.add(metric);
    toggle.setAttribute('aria-pressed', String(activeMetrics.has(metric)));
    updateAnalysis();
  });
});
elements.refresh.addEventListener('click', () => {
  loadAnalysis().catch((error) => {
    setStatus(error instanceof Error ? error.message : 'Unable to refresh analysis.', 'error');
  });
});

loadAnalysis().catch((error) => {
  setStatus(error instanceof Error ? error.message : 'Unable to load complexity analysis.', 'error');
});