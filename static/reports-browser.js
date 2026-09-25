import { renderReportTrend } from './report-chart.js';

const elements = {
  title: document.querySelector('#title'),
  subtitle: document.querySelector('#subtitle'),
  message: document.querySelector('#message'),
  projectView: document.querySelector('#project-view'),
  summaryView: document.querySelector('#summary-view'),
  folders: document.querySelector('#folders'),
  generateProject: document.querySelector('#generate-project'),
  compareForm: document.querySelector('#compare-form'),
  compareA: document.querySelector('#compare-a'),
  compareB: document.querySelector('#compare-b'),
  compareView: document.querySelector('#compare-view'),
  comparePageTitle: document.querySelector('#compare-page-title'),
  comparePageTable: document.querySelector('#compare-page-table'),
  compareBack: document.querySelector('#compare-back'),
  summaryTitle: document.querySelector('#summary-title'),
  summaryTable: document.querySelector('#summary-table'),
  summaryBack: document.querySelector('#summary-back'),
  refresh: document.querySelector('#refresh'),
  projectTrendChart: document.querySelector('#project-trend-chart'),
  chartToggles: document.querySelectorAll('.chart-toggle'),
  exclusionList: document.querySelector('#exclusion-list'),
  addExclusion: document.querySelector('#add-exclusion'),
  saveExclusions: document.querySelector('#save-exclusions'),
};

const [_, reportsSegment, idxSegment, targetSegment] = window.location.pathname.split('/');
const reportIdx = Number(idxSegment);
const targetName = targetSegment ? decodeURIComponent(targetSegment) : null;
const compareAParam = new URLSearchParams(window.location.search).get('compareA');
const compareBParam = new URLSearchParams(window.location.search).get('compareB');
let currentProjectKey = null;
let projectHistory = [];
let exclusionPatterns = [];
const activeTrendMetrics = new Set(['fileCount', 'averageComplexity']); // 'totalComplexity',
const summaryTableState = {
  rows: [],
  columns: [],
  sortKey: 'file',
  sortDirection: 'asc',
  filters: {
    complexity: { min: '', max: '' },
    functionTotal: { min: '', max: '' },
    complexityTotal: { min: '', max: '' },
    complexityAverage: { min: '', max: '' },
  },
};

const renderProjectTrend = () => {
  renderReportTrend(
    elements.projectTrendChart,
    projectHistory,
    Array.from(activeTrendMetrics)
  );
};

const getExclusionPatterns = () => Array.from(
  elements.exclusionList.querySelectorAll('input')
).map((input) => input.value.trim()).filter(Boolean);

const renderExclusionList = () => {
  elements.exclusionList.textContent = '';

  if (exclusionPatterns.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-exclusions';
    emptyState.textContent = 'No additional files are excluded.';
    elements.exclusionList.append(emptyState);
    return;
  }

  exclusionPatterns.forEach((pattern, index) => {
    const row = document.createElement('div');
    row.className = 'exclusion-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = pattern;
    input.placeholder = 'Path or % wildcard pattern';
    input.setAttribute('aria-label', `Excluded file ${index + 1}`);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'secondary exclusion-remove';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => {
      exclusionPatterns = getExclusionPatterns();
      exclusionPatterns.splice(index, 1);
      renderExclusionList();
    });

    row.append(input, removeButton);
    elements.exclusionList.append(row);
  });
};

const getCompareParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    compareA: params.get('compareA'),
    compareB: params.get('compareB'),
  };
};

const setCompareParams = (compareA, compareB) => {
  const url = new URL(window.location.href);
  url.searchParams.set('compareA', compareA);
  url.searchParams.set('compareB', compareB);
  window.history.pushState({}, '', url);
};

const clearCompareParams = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('compareA');
  url.searchParams.delete('compareB');
  window.history.pushState({}, '', url);
};

const showProjectView = () => {
  elements.projectView.classList.remove('hidden');
  elements.summaryView.classList.add('hidden');
  elements.compareView.classList.add('hidden');
};

const showSummaryView = () => {
  elements.projectView.classList.add('hidden');
  elements.summaryView.classList.remove('hidden');
  elements.compareView.classList.add('hidden');
};

const showCompareView = () => {
  elements.projectView.classList.add('hidden');
  elements.summaryView.classList.add('hidden');
  elements.compareView.classList.remove('hidden');
};

const setStatus = (message, state = '') => {
  elements.message.textContent = message;
  if (state) {
    elements.message.setAttribute('data-state', state);
  } else {
    elements.message.removeAttribute('data-state');
  }
};

const setBusy = (busy) => {
  document.querySelectorAll('button, select').forEach((element) => {
    element.disabled = busy;
  });
};

const formatHiddenStats = (storedReport) => {
  if (!storedReport.hiddenFileCount) {
    return '';
  }

  return ` | ${storedReport.hiddenFileCount} hidden files filtered out (${storedReport.hiddenComplexity} complexity)`;
};

const formatTableValue = (columnKey, value, comparisonRow = null) => {
  const comparisonMetricKeys = {
    complexity: ['compareAComplexity', 'compareBComplexity'],
    functionTotal: ['compareAFunctionTotal', 'compareBFunctionTotal'],
    complexityAverage: ['compareAComplexityAverage', 'compareBComplexityAverage'],
  };

  const formatMetric = (metricKey, metricValue) => {
    if (metricValue == null) {
      return '-';
    }

    if (metricKey === 'complexityAverage' && typeof metricValue === 'number') {
      const formattedValue = String(Number(metricValue.toFixed(2)));
      const className = metricValue < 6 ? 'minimum' : metricValue < 11 ? 'minor' : metricValue < 21 ? 'medium' : 'high';

      return `<span class="complexityScore ${className}">${formattedValue}</span>`;
    }

    return String(metricValue);
  };

  const comparisonKeys = comparisonMetricKeys[columnKey];
  if (comparisonRow && comparisonKeys) {
    const compareAValue = comparisonRow[comparisonKeys[0]];
    const compareBValue = comparisonRow[comparisonKeys[1]];

    if (compareAValue === compareBValue) {
      return formatMetric(columnKey, compareAValue);
    }

    return `${formatMetric(columnKey, compareAValue)} (${formatMetric(columnKey, compareBValue)})`;
  }

  if (value == null) {
    return '';
  }

  if (
    (columnKey === 'complexityChange' || columnKey === 'complexityAverageChange') &&
    typeof value === 'number'
  ) {
    let val = String(Number(value.toFixed(2)));
    let plusMinus = value > 0 ? '+' : '';

    return `${plusMinus}${val}`;
  }

  if (columnKey === 'complexityAverage') {
    return formatMetric(columnKey, value);
  }

  return String(value);
};

const cellClass = (status) => {
  if (status === null || status === undefined) {
    return '';
  }
  if (String(status).trim() === '') {
    return '';
  }
  if (String(status).toUpperCase() === 'N') {
    return 'added';
  }
  if (String(status).toUpperCase() === 'D') {
    return 'removed';
  }
}

const parseFilterNumber = (value) => {
  if (value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const compareColumnValues = (left, right, columnKey, direction) => {
  const sortMultiplier = direction === 'asc' ? 1 : -1;

  if (columnKey === 'file') {
    return String(left ?? '').localeCompare(String(right ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    }) * sortMultiplier;
  }

  const leftNumber = Number(left ?? 0);
  const rightNumber = Number(right ?? 0);

  if (leftNumber === rightNumber) {
    return 0;
  }

  return (leftNumber - rightNumber) * sortMultiplier;
};

const applySummaryFilters = (rows) => rows.filter((row) => (
  Object.entries(summaryTableState.filters).every(([key, bounds]) => {
    const minValue = parseFilterNumber(bounds.min);
    const maxValue = parseFilterNumber(bounds.max);
    const rowValue = Number(row[key]);

    if (!Number.isFinite(rowValue)) {
      return minValue === null && maxValue === null;
    }

    if (minValue !== null && rowValue < minValue) {
      return false;
    }

    if (maxValue !== null && rowValue > maxValue) {
      return false;
    }

    return true;
  })
));

const getFilteredAndSortedSummaryRows = () => {
  const filteredRows = applySummaryFilters(summaryTableState.rows).slice();

  if (!summaryTableState.sortKey || !summaryTableState.sortDirection) {
    return filteredRows;
  }

  return filteredRows.sort((left, right) => {
    const result = compareColumnValues(
      left[summaryTableState.sortKey],
      right[summaryTableState.sortKey],
      summaryTableState.sortKey,
      summaryTableState.sortDirection
    );

    if (result !== 0) {
      return result;
    }

    return compareColumnValues(left.file, right.file, 'file', 'asc');
  });
};

const updateSummarySort = (columnKey) => {
  if (summaryTableState.sortKey !== columnKey) {
    summaryTableState.sortKey = columnKey;
    summaryTableState.sortDirection = 'asc';
    return;
  }

  if (summaryTableState.sortDirection === 'asc') {
    summaryTableState.sortDirection = 'desc';
    return;
  }

  if (summaryTableState.sortDirection === 'desc') {
    summaryTableState.sortKey = null;
    summaryTableState.sortDirection = null;
    return;
  }

  summaryTableState.sortKey = columnKey;
  summaryTableState.sortDirection = 'asc';
};

const getComplexityClass = (complexity) => {
  if (complexity < 6) {
    return 'minimum';
  }

  if (complexity < 11) {
    return 'minor';
  }

  if (complexity < 21) {
    return 'medium';
  }

  return 'high';
};

const renderFunctionDetails = (functions) => {
  const details = document.createElement('div');
  details.className = 'function-details';

  if (functions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-function-details';
    empty.textContent = 'No functions were stored for this file.';
    details.append(empty);
    return details;
  }

  const table = document.createElement('table');
  table.className = 'function-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Function', 'Line', 'Complexity'].forEach((label) => {
    const header = document.createElement('th');
    header.textContent = label;
    headerRow.append(header);
  });
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  functions.forEach((functionItem) => {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = functionItem.name;
    const line = document.createElement('td');
    line.textContent = String(functionItem.line);
    const complexity = document.createElement('td');
    const score = document.createElement('span');
    score.className = `complexityScore ${getComplexityClass(functionItem.complexity)}`;
    score.textContent = String(functionItem.complexity);
    complexity.append(score);
    row.append(name, line, complexity);
    tbody.append(row);
  });
  table.append(tbody);
  details.append(table);
  return details;
};

const renderSummaryTable = () => {
  elements.summaryTable.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'report-table-shell';

  const toolbar = document.createElement('div');
  toolbar.className = 'table-toolbar';

  const summary = document.createElement('p');
  const visibleRows = getFilteredAndSortedSummaryRows();
  summary.className = 'table-results';
  summary.textContent = `${visibleRows.length} of ${summaryTableState.rows.length} files shown`;
  toolbar.append(summary);
  wrapper.append(toolbar);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const filterRow = document.createElement('tr');
  filterRow.className = 'filter-row';

  summaryTableState.columns.forEach((column) => {
    const th = document.createElement('th');
    if (column.key === 'functions') {
      th.textContent = column.label;
    } else {
      const sortButton = document.createElement('button');
      sortButton.type = 'button';
      sortButton.className = 'table-sort';
      sortButton.textContent = column.label;
      sortButton.setAttribute(
        'aria-sort',
        summaryTableState.sortKey === column.key ? summaryTableState.sortDirection : 'none'
      );

      if (summaryTableState.sortKey === column.key) {
        sortButton.dataset.direction = summaryTableState.sortDirection;
      }

      sortButton.addEventListener('click', () => {
        updateSummarySort(column.key);
        renderSummaryTable();
      });

      th.append(sortButton);
    }
    headRow.append(th);

    const filterCell = document.createElement('th');
    if (Object.hasOwn(summaryTableState.filters, column.key)) {
      const bounds = summaryTableState.filters[column.key];
      const filterGroup = document.createElement('div');
      filterGroup.className = 'filter-range';

      const minInput = document.createElement('input');
      minInput.type = 'number';
      minInput.inputMode = 'decimal';
      minInput.placeholder = 'Min';
      minInput.value = bounds.min;
      minInput.setAttribute('aria-label', `${column.label} minimum value`);
      minInput.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }

        summaryTableState.filters[column.key].min = target.value;
        renderSummaryTable();
      });

      const maxInput = document.createElement('input');
      maxInput.type = 'number';
      maxInput.inputMode = 'decimal';
      maxInput.placeholder = 'Max';
      maxInput.value = bounds.max;
      maxInput.setAttribute('aria-label', `${column.label} maximum value`);
      maxInput.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }

        summaryTableState.filters[column.key].max = target.value;
        renderSummaryTable();
      });

      filterGroup.append(minInput, maxInput);
      filterCell.append(filterGroup);
    }
    filterRow.append(filterCell);
  });

  thead.append(headRow, filterRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  visibleRows.forEach((row, index) => {
    const tr = document.createElement('tr');
    summaryTableState.columns.forEach((column) => {
      const td = document.createElement('td');
      if (column.key === 'functions') {
        const detailsId = `function-details-${index}`;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'function-details-toggle secondary';
        toggle.textContent = 'View functions';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', detailsId);
        toggle.addEventListener('click', () => {
          const expanded = toggle.getAttribute('aria-expanded') === 'true';
          toggle.setAttribute('aria-expanded', String(!expanded));
          toggle.textContent = expanded ? 'View functions' : 'Hide functions';
          detailRow.hidden = expanded;
        });
        td.append(toggle);
      } else {
        td.innerHTML = formatTableValue(column.key, row[column.key]);
      }
      tr.append(td);
    });
    tbody.append(tr);

    const detailRow = document.createElement('tr');
    detailRow.id = `function-details-${index}`;
    detailRow.className = 'function-details-row';
    detailRow.hidden = true;
    const detailCell = document.createElement('td');
    detailCell.colSpan = summaryTableState.columns.length;
    detailCell.append(renderFunctionDetails(row.functions));
    detailRow.append(detailCell);
    tbody.append(detailRow);
  });

  if (visibleRows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = summaryTableState.columns.length;
    td.className = 'empty-table';
    td.textContent = 'No files match the current filters.';
    tr.append(td);
    tbody.append(tr);
  }

  table.append(tbody);
  wrapper.append(table);
  elements.summaryTable.append(wrapper);
};

const renderTable = (rows, columns) => {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((column) => {
    const th = document.createElement('th');
    th.textContent = column.label;
    headRow.append(th);
  });
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const indicatorClass = cellClass(row['status']);
    columns.forEach((column) => {
      const td = document.createElement('td');
      if (indicatorClass !== '') { td.classList.add(indicatorClass); }
      td.innerHTML = formatTableValue(column.key, row[column.key], row);
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  return table;
};

const loadProjectView = async () => {
  const response = await fetch(`/api/reports/${reportIdx}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Unable to load project report data.');
  }

  elements.title.textContent = data.report.NAME;
  elements.subtitle.textContent = `Stored report runs for ${data.projectKey}`;
  currentProjectKey = data.projectKey;
  exclusionPatterns = data.report.EXCLUDE_FILES || [];
  renderExclusionList();
  showProjectView();
  projectHistory = data.storedReports.slice().reverse();
  renderProjectTrend();
  elements.folders.textContent = '';

  if (data.storedReports.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'No stored reports available yet';
    elements.folders.append(item);
  }

  data.storedReports.forEach((storedReport) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `/reports/${data.idx}/${encodeURIComponent(String(storedReport.timestamp))}`;
    link.textContent = `${storedReport.report}`;
    const stats = document.createElement('span');
    stats.className = 'run-stats';
    stats.textContent = `${storedReport.fileCount} files | ${storedReport.totalComplexity} total complexity | ${Number(storedReport.averageComplexity).toFixed(2)} average/file${formatHiddenStats(storedReport)}`;
    item.append(link);
    item.append(stats);
    elements.folders.append(item);
  });

  elements.compareA.innerHTML = '';
  elements.compareB.innerHTML = '';
  data.storedReports.forEach((storedReport) => {
    const optionA = document.createElement('option');
    optionA.value = String(storedReport.timestamp);
    optionA.textContent = storedReport.report;
    elements.compareA.append(optionA);

    const optionB = document.createElement('option');
    optionB.value = String(storedReport.timestamp);
    optionB.textContent = storedReport.report;
    elements.compareB.append(optionB);
  });

  elements.generateProject.onclick = () => runAction(
    `/reports/${data.idx}`,
    'POST',
    (result) => `${result.reportsGenerated} reports generated from ${result.gitlogRows} gitlog rows.`
  );

  elements.addExclusion.onclick = () => {
    exclusionPatterns = getExclusionPatterns();
    exclusionPatterns.push('');
    renderExclusionList();
    elements.exclusionList.querySelector('input:last-of-type')?.focus();
  };

  elements.saveExclusions.onclick = async () => {
    setBusy(true);
    setStatus('Saving file exclusions...');
    try {
      const responseSave = await fetch(`/api/reports/${reportIdx}/exclusions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ EXCLUDE_FILES: getExclusionPatterns() }),
      });
      const savedData = await responseSave.json();
      if (!responseSave.ok) {
        throw new Error(savedData.error || 'Unable to save file exclusions.');
      }

      exclusionPatterns = savedData.report.EXCLUDE_FILES || [];
      await loadProjectView();
      setStatus('File exclusions saved. Report data updated.', 'success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save file exclusions.', 'error');
    } finally {
      setBusy(false);
    }
  };

  elements.compareForm.onsubmit = async (event) => {
    event.preventDefault();
    const compareA = elements.compareA.value;
    const compareB = elements.compareB.value;
    setCompareParams(compareA, compareB);
    await loadCompareView(compareA, compareB);
  };

  setStatus('Project report data loaded.', 'success');
};

const loadCompareView = async (compareA, compareB) => {
  setBusy(true);
  setStatus('Generating comparison...');
  try {
    const responseCompare = await fetch('/api/reports/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: currentProjectKey,
        tgt_1: compareA,
        tgt_2: compareB,
      }),
    });
    const compareData = await responseCompare.json();
    if (!responseCompare.ok) {
      throw new Error(compareData.error || 'Unable to compare reports.');
    }

   showCompareView();

    elements.comparePageTitle.textContent = `${compareData.targetNames.tgt_1} vs ${compareData.targetNames.tgt_2}`;
    elements.comparePageTable.textContent = '';
    elements.comparePageTable.append(
      renderTable(compareData.complexityObj, [
        { key: 'file', label: 'File' },
        { key: 'complexity', label: 'Complexity' },
        { key: 'functionTotal', label: 'Functions' },
        { key: 'complexityAverage', label: 'Complexity Average' },
        { key: 'complexityChange', label: 'Complexity Change' },
        { key: 'complexityAverageChange', label: 'Average Change' },
      ])
    );

    setStatus('Comparison ready.', 'success');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Unable to compare reports.', 'error');
  } finally {
    setBusy(false);
  }
};

const loadSummaryView = async () => {
  const response = await fetch(`/api/reports/${reportIdx}/${encodeURIComponent(targetName)}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Unable to load summary data.');
  }

  elements.title.textContent = data.report.NAME;
  elements.subtitle.textContent = `Summary for ${data.targetName} | ${data.storedReport.fileCount} files | ${data.storedReport.totalComplexity} total complexity | ${Number(data.storedReport.averageComplexity).toFixed(2)} average/file${formatHiddenStats(data.storedReport)}`;
  showSummaryView();
  elements.summaryTitle.textContent = data.targetName;
  elements.summaryBack.href = `/reports/${reportIdx}`;
  summaryTableState.rows = data.complexityObj;
  summaryTableState.columns = [
    { key: 'file', label: 'File' },
    { key: 'complexity', label: 'Complexity' },
    { key: 'functionTotal', label: 'Functions' },
    { key: 'complexityTotal', label: 'Complexity Total' },
    { key: 'complexityAverage', label: 'Complexity Average' },
    { key: 'functions', label: 'Function details' },
  ];
  summaryTableState.sortKey = 'file';
  summaryTableState.sortDirection = 'asc';
  Object.keys(summaryTableState.filters).forEach((key) => {
    summaryTableState.filters[key].min = '';
    summaryTableState.filters[key].max = '';
  });
  renderSummaryTable();
  setStatus('Summary data loaded.', 'success');
};

const runAction = async (url, method, successMessage) => {
  setBusy(true);
  setStatus('Processing request...');
  try {
    const response = await fetch(url, { method });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Request failed.');
    }
    const resultMessage = typeof successMessage === 'function'
      ? successMessage(data)
      : successMessage;
    setStatus(resultMessage, 'success');
    await loadCurrentView();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Request failed.', 'error');
  } finally {
    setBusy(false);
  }
};

const loadCurrentView = async () => {
  if (targetName) {
    await loadSummaryView();
    return;
  }

  const { compareA, compareB } = getCompareParams();

  await loadProjectView();

  if (compareA && compareB) {
    await loadCompareView(compareA, compareB);
  }
};

elements.compareBack.addEventListener('click', () => {
  clearCompareParams();
  loadProjectView().catch((error) => {
    setStatus(error instanceof Error ? error.message : 'Unable to return to report list.', 'error');
  });
});

elements.refresh.addEventListener('click', () => {
  loadCurrentView().catch((error) => {
    setStatus(error instanceof Error ? error.message : 'Unable to refresh.', 'error');
  });
});

elements.chartToggles.forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const metric = toggle.dataset.metric;
    if (!metric) {
      return;
    }

    if (activeTrendMetrics.has(metric)) {
      activeTrendMetrics.delete(metric);
    } else {
      activeTrendMetrics.add(metric);
    }

    toggle.setAttribute('aria-pressed', String(activeTrendMetrics.has(metric)));
    renderProjectTrend();
  });
});

window.addEventListener('popstate', () => {
  loadCurrentView().catch((error) => {
    setStatus(error instanceof Error ? error.message : 'Unable to update view.', 'error');
  });
});

loadCurrentView().catch((error) => {
  setStatus(error instanceof Error ? error.message : 'Unable to load report page.', 'error');
});