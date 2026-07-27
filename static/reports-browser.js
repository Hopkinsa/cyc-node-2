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
};

const [_, reportsSegment, idxSegment, targetSegment] = window.location.pathname.split('/');
const reportIdx = Number(idxSegment);
const targetName = targetSegment ? decodeURIComponent(targetSegment) : null;
const compareAParam = new URLSearchParams(window.location.search).get('compareA');
const compareBParam = new URLSearchParams(window.location.search).get('compareB');
let currentProjectKey = null;

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

const formatTableValue = (columnKey, value) => {
  if (value == null) {
    return '';
  }

  if (
    (columnKey === 'complexityAverage' || columnKey === 'complexityAverageChange') &&
    typeof value === 'number'
  ) {
    let val = String(Number(value.toFixed(2)));

    let calClass = value < 6 ? 'minimum' : value < 11 ? 'minor' : value < 21 ? 'medium' : 'high'

    return `<span class="complexityScore ${calClass}">${val}</span>`;
  }

  return String(value);
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
    columns.forEach((column) => {
      const td = document.createElement('td');
      td.innerHTML = formatTableValue(column.key, row[column.key]);
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
  showProjectView();
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
    item.append(link);
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

  elements.generateProject.onclick = () => runAction(`/reports/${data.idx}`, 'POST', 'Project reports processed.');

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
        { key: 'complexityTotal', label: 'Complexity Total' },
        { key: 'complexityAverage', label: 'Complexity Average' },
        { key: 'complexityTotalChange', label: 'Complexity Total Change' },
        { key: 'complexityAverageChange', label: 'Average Change' },
        { key: 'status', label: 'Status' },
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
  elements.subtitle.textContent = `Summary for ${data.targetName}`;
  showSummaryView();
  elements.summaryTitle.textContent = data.targetName;
  elements.summaryBack.href = `/reports/${reportIdx}`;
  elements.summaryTable.textContent = '';
  elements.summaryTable.append(
    renderTable(data.complexityObj, [
      { key: 'file', label: 'File' },
      { key: 'complexity', label: 'Complexity' },
      { key: 'functionTotal', label: 'Functions' },
      { key: 'complexityTotal', label: 'Complexity Total' },
      { key: 'complexityAverage', label: 'Complexity Average' },
    ])
  );
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
    setStatus(successMessage, 'success');
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

window.addEventListener('popstate', () => {
  loadCurrentView().catch((error) => {
    setStatus(error instanceof Error ? error.message : 'Unable to update view.', 'error');
  });
});

loadCurrentView().catch((error) => {
  setStatus(error instanceof Error ? error.message : 'Unable to load report page.', 'error');
});