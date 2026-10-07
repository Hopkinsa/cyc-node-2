import { renderReportTrend } from './report-chart.js';

const reportIdx = Number(window.location.pathname.split('/')[2]);
const kind = window.location.pathname.split('/')[4];
const select = (id) => document.getElementById(id);
const column = (key, label, unit = '', text = false) => ({ key, label, unit, text });
const definitions = {
  attribution: {
    title: 'Change Attribution', chart: 'Complexity change contributions', table: 'Function attribution',
    columns: [column('file', 'File', '', true), column('name', 'Function', '', true), column('status', 'Matching status', '', true),
      column('before', 'Before'), column('after', 'After'), column('delta', 'Change'), column('beforeCount', 'Functions before'), column('afterCount', 'Functions after')],
  },
  persistence: {
    title: 'Persistent Hotspots', chart: 'Files containing high-complexity functions (%)', table: 'Hotspot persistence',
    columns: [column('file', 'File', '', true), column('highReports', 'Hotspot runs'), column('observations', 'Observed runs'),
      column('persistence', 'Persistence', '%'), column('coverage', 'Period coverage', '%'), column('latestMean', 'Latest mean'),
      column('change', 'Mean change'), column('latestPeak', 'Latest peak'), column('peak', 'Period peak')],
    series: [{ key: 'highFileRate', label: 'High-complexity file rate', color: '#ad2525' }],
  },
  distribution: {
    title: 'Complexity Distribution', chart: 'Function complexity bands (%)', table: 'Band counts and rates',
    columns: [column('report', 'Report', '', true), column('functions', 'Functions'), column('lowCount', '1-5 count'), column('low', '1-5', '%'),
      column('minorCount', '6-10 count'), column('minor', '6-10', '%'), column('mediumCount', '11-20 count'), column('medium', '11-20', '%'),
      column('highCount', '21+ count'), column('high', '21+', '%')],
    series: [
      { key: 'low', label: '1-5', color: '#286f6c' }, { key: 'minor', label: '6-10', color: '#426a9c' },
      { key: 'medium', label: '11-20', color: '#9c4a25' }, { key: 'high', label: '21+', color: '#ad2525' },
    ],
  },
  concentration: {
    title: 'Complexity Concentration', chart: 'Complexity share in top-ranked functions (%)', table: 'Concentration history',
    columns: [column('report', 'Report', '', true), column('functions', 'Functions'), column('topCount', 'Selected functions'),
      column('actualPercent', 'Actual selected fraction', '%'), column('total', 'Total complexity'), column('topComplexity', 'Selected complexity'), column('share', 'Complexity share', '%')],
    series: [{ key: 'share', label: 'Top-ranked complexity share', color: '#426a9c' }],
  },
  modules: {
    title: 'Module Trends', chart: 'Module complexity over time', table: 'Modules in the last report',
    columns: [column('module', 'Module', '', true), column('functions', 'Functions'), column('total', 'Total complexity'),
      column('mean', 'Mean / function'), column('meanChange', 'Mean change', '%'), column('highRate', 'High-complexity rate', '%'), column('observations', 'Observed runs')],
  },
};
const definition = definitions[kind];
const format = (value, unit = '') => Number.isFinite(value)
  ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit}` : 'N/A';
const colors = ['#286f6c', '#426a9c', '#9c4a25', '#72558a', '#ad2525', '#4d7f56'];
let history = [];
let currentData;
let requestVersion = 0;

select('analysis-link').href = `/reports/${reportIdx}/analysis`;
select('reports-link').href = `/reports/${reportIdx}`;
select('report-name').textContent = definition.title;
select('chart-heading').textContent = definition.chart;
select('table-heading').textContent = definition.table;
select('threshold-control').hidden = !['persistence', 'modules'].includes(kind);
select('top-control').hidden = kind !== 'concentration';
select('depth-control').hidden = kind !== 'modules';
select('module-controls').hidden = kind !== 'modules';

const status = (message, error = false) => {
  select('message').textContent = message;
  select('message').hidden = !message;
  select('message').dataset.state = error ? 'error' : '';
};

const populateRuns = () => {
  const eligible = history.filter((run) => select('include-temporary').checked || !run.isTemporary);
  ['start-report', 'end-report'].forEach((id) => {
    const previous = select(id).value;
    select(id).replaceChildren();
    eligible.forEach((run) => {
      const option = document.createElement('option');
      option.value = String(run.id);
      option.textContent = run.report;
      select(id).append(option);
    });
    select(id).value = eligible.some((run) => String(run.id) === previous) ? previous
      : String((id === 'start-report' ? eligible[0] : eligible.at(-1))?.id ?? '');
  });
};

const buildTable = (id, rows, columns) => {
  const container = select(id);
  container.replaceChildren();
  let filter = '';
  let sortKey;
  let direction = 1;
  let pageIndex = 0;
  let pageSize = 25;
  const toolbar = document.createElement('div');
  toolbar.className = 'table-toolbar analysis-table-toolbar';
  const count = document.createElement('p');
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Filter rows';
  search.setAttribute('aria-label', id === 'detail-table' ? 'Filter ranked functions' : 'Filter report rows');
  toolbar.append(count, search);
  const scroll = document.createElement('div');
  scroll.className = 'analysis-history-scroll';
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', id === 'detail-table' ? 'Ranked function table' : definition.table);
  const table = document.createElement('table');
  table.className = 'analysis-history-table';
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  const body = document.createElement('tbody');
  const headers = [];
  columns.forEach((spec) => {
    const header = document.createElement('th');
    header.scope = 'col';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'table-sort';
    button.textContent = spec.label;
    button.addEventListener('click', () => {
      direction = sortKey === spec.key ? -direction : (spec.text ? 1 : -1);
      sortKey = spec.key;
      pageIndex = 0;
      update();
    });
    header.append(button);
    headers.push({ header, key: spec.key });
    headRow.append(header);
  });
  head.append(headRow);
  table.append(head, body);
  scroll.append(table);
  const pagination = document.createElement('div');
  pagination.className = 'stored-reports-pagination';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'secondary stored-reports-page-button';
  previous.textContent = 'Previous';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = previous.className;
  next.textContent = 'Next';
  const pageInfo = document.createElement('span');
  const sizeWrapper = document.createElement('span');
  sizeWrapper.className = 'stored-reports-page-select';
  const size = document.createElement('select');
  size.setAttribute('aria-label', id === 'detail-table' ? 'Ranked functions per page' : 'Report rows per page');
  size.className = 'analysis-page-size';
  [25, 50, 100].forEach((value) => {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = `${value} rows`;
    size.append(option);
  });
  sizeWrapper.append(size);
  pagination.append(previous, pageInfo, next, sizeWrapper);
  container.append(toolbar, scroll, pagination);
  const update = () => {
    const visible = rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(filter)));
    if (sortKey) {
      visible.sort((left, right) => {
        if (left[sortKey] === null) return right[sortKey] === null ? 0 : 1;
        if (right[sortKey] === null) return -1;
        return (typeof left[sortKey] === 'number'
          ? left[sortKey] - right[sortKey] : String(left[sortKey]).localeCompare(String(right[sortKey]), undefined, { numeric: true })) * direction;
      });
    }
    const pages = Math.max(1, Math.ceil(visible.length / pageSize));
    pageIndex = Math.min(pageIndex, pages - 1);
    count.textContent = `${visible.length} of ${rows.length} rows`;
    pageInfo.textContent = `Page ${pageIndex + 1} of ${pages}`;
    previous.disabled = pageIndex === 0;
    next.disabled = pageIndex === pages - 1;
    pagination.hidden = visible.length <= 25;
    headers.forEach(({ header, key }) => header.setAttribute('aria-sort', key === sortKey ? (direction === 1 ? 'ascending' : 'descending') : 'none'));
    body.replaceChildren();
    visible.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize).forEach((row) => {
      const tr = document.createElement('tr');
      columns.forEach((spec) => {
        const cell = document.createElement('td');
        cell.textContent = spec.text ? String(row[spec.key] ?? '') : format(row[spec.key], spec.unit);
        if (spec.text) cell.className = 'analysis-text-cell';
        if (spec.key === 'report' && row.timestamp) {
          const link = document.createElement('a');
          link.href = `/reports/${reportIdx}/${row.timestamp}`;
          link.textContent = cell.textContent;
          cell.replaceChildren(link);
        }
        tr.append(cell);
      });
      body.append(tr);
    });
    if (!visible.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = columns.length;
      cell.textContent = rows.length ? 'No rows match this filter.' : 'No matching function data in this period.';
      row.append(cell);
      body.append(row);
    }
  };
  search.addEventListener('input', () => { filter = search.value.toLowerCase(); pageIndex = 0; update(); });
  previous.addEventListener('click', () => { pageIndex -= 1; update(); });
  next.addEventListener('click', () => { pageIndex += 1; update(); });
  size.addEventListener('change', () => { pageSize = Number(size.value); pageIndex = 0; update(); });
  update();
};

const renderChart = () => {
  const data = currentData;
  if (!data) return;
  if (kind === 'attribution') {
    select('insight-chart').replaceChildren();
    const maximum = Math.max(...data.contributions.map((item) => Math.abs(item.value)), 1);
    data.contributions.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'analysis-contribution';
      const label = document.createElement('span');
      label.textContent = item.label;
      const track = document.createElement('div');
      track.className = 'analysis-contribution-track';
      const bar = document.createElement('span');
      bar.className = item.value < 0 ? 'analysis-bar negative' : 'analysis-bar positive';
      const width = Math.abs(item.value) / maximum * 50;
      bar.style.width = `${width}%`;
      bar.style.left = `${item.value < 0 ? 50 - width : 50}%`;
      track.append(bar);
      const value = document.createElement('strong');
      value.textContent = `${item.value > 0 ? '+' : ''}${format(item.value)}`;
      row.append(label, track, value);
      select('insight-chart').append(row);
    });
    return;
  }
  let series = definition.series;
  let unit = '%';
  if (kind === 'modules') {
    const suffix = select('module-metric').value;
    unit = suffix === 'Rate' ? '%' : '';
    series = Array.from(select('module-selection').selectedOptions, (option) => ({
      key: `module${option.value}${suffix}`, label: option.textContent, color: colors[Number(option.value) % colors.length],
    }));
  }
  renderReportTrend(select('insight-chart'), data.trend, series.map((item) => item.key),
    { series, unit, timeScale: true, preserveMissing: true, label: definition.chart });
};

const render = (data) => {
  currentData = data;
  select('range-summary').textContent = `${data.period.runs} runs | First: ${data.period.start} | Last: ${data.period.end}`;
  select('metric-summary').replaceChildren();
  data.summary.forEach((item) => {
    const wrapper = document.createElement('div');
    const title = document.createElement('dt');
    title.textContent = item.label;
    const value = document.createElement('dd');
    value.textContent = format(item.value, item.unit);
    wrapper.append(title, value);
    select('metric-summary').append(wrapper);
  });
  select('analysis-notice').hidden = !data.notice;
  select('analysis-notice').textContent = data.notice || '';
  if (kind === 'modules') {
    const previous = new Set(Array.from(select('module-selection').selectedOptions, (option) => option.textContent));
    select('module-selection').replaceChildren();
    data.modules.forEach((module, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = module;
      option.selected = previous.size ? previous.has(module) : index < 3;
      select('module-selection').append(option);
    });
  }
  renderChart();
  buildTable('report-table', data.rows, definition.columns);
  select('detail-section').hidden = !data.details;
  if (data.details) buildTable('detail-table', data.details, [
    column('rank', 'Rank'), column('file', 'File', '', true), column('name', 'Function', '', true), column('line', 'Line'),
    column('complexity', 'Complexity'), column('share', 'Project share', '%'), column('cumulativeShare', 'Cumulative share', '%'),
  ]);
  select('insight-results').hidden = false;
};

const loadInsight = async () => {
  const version = ++requestVersion;
  select('insight-results').hidden = true;
  select('refresh').disabled = false;
  if (!select('insight-controls').reportValidity()) {
    status('Enter valid analysis parameters.', true);
    return;
  }
  if (!select('start-report').value || !select('end-report').value) {
    status('No report history available.');
    return;
  }
  if (select('start-report').selectedIndex > select('end-report').selectedIndex) {
    status('First report must be on or before the last report.', true);
    return;
  }
  status('Loading analysis...');
  select('refresh').disabled = true;
  const params = new URLSearchParams({
    start: select('start-report').value, end: select('end-report').value,
    temporary: String(select('include-temporary').checked), threshold: select('threshold').value,
    topPercent: select('top-percent').value, depth: select('depth').value,
  });
  try {
    const response = await fetch(`/api/reports/${reportIdx}/analysis/${kind}?${params}`);
    const data = await response.json();
    if (version !== requestVersion) return;
    if (!response.ok) throw new Error(data.error || 'Unable to load analysis.');
    render(data);
    status('');
  } catch (error) {
    if (version === requestVersion) status(error.message, true);
  } finally {
    if (version === requestVersion) select('refresh').disabled = false;
  }
};

const loadHistory = async () => {
  requestVersion += 1;
  select('insight-results').hidden = true;
  status('Loading report history...');
  select('refresh').disabled = true;
  try {
    const response = await fetch(`/api/reports/${reportIdx}/function-trends`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load report history.');
    history = data.history;
    document.title = `${data.name} - ${definition.title}`;
    select('title').textContent = data.name;
    select('subtitle').textContent = data.projectKey;
    populateRuns();
    await loadInsight();
  } catch (error) {
    status(error.message, true);
    select('refresh').disabled = false;
  }
};

select('insight-controls').addEventListener('submit', (event) => event.preventDefault());
['start-report', 'end-report', 'threshold', 'top-percent', 'depth'].forEach((id) => select(id).addEventListener('change', loadInsight));
select('include-temporary').addEventListener('change', () => { populateRuns(); loadInsight(); });
select('refresh').addEventListener('click', loadHistory);
select('module-selection').addEventListener('change', renderChart);
select('module-metric').addEventListener('change', renderChart);
loadHistory();