import './report-snackbar.js';
import { baselineChange, renderReportTrend } from './report-chart.js';

export { baselineChange } from './report-chart.js';

const reportIdx = Number(window.location.pathname.split('/')[2]);
const isGrowthReport = window.location.pathname.endsWith('/analysis/growth');
const select = (id) => document.getElementById(id);
const series = [
  ...(isGrowthReport ? [{ key: 'fileCount', label: 'Included files', color: '#426a9c' }] : []),
  { key: 'totalFunctionComplexity', label: 'Total function complexity', color: '#9c4a25' },
  { key: 'functionCount', label: 'Functions', color: '#426a9c' },
  { key: 'meanFunctionComplexity', label: 'Mean complexity per function', color: '#286f6c' },
  { key: 'percentile90', label: '90th percentile', color: '#72558a' },
  { key: 'highComplexityFunctionRate', label: 'High-complexity function rate', color: '#ad2525' },
].filter(({ key }) => !isGrowthReport || ['fileCount', 'meanFunctionComplexity'].includes(key));
const chartOptions = { series, timeScale: true, preserveMissing: true };
const format = (value) => Number.isFinite(value)
  ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  : 'N/A';
const signed = (value, unit = '') => Number.isFinite(value)
  ? `${value > 0 ? '+' : ''}${format(value)}${unit}`
  : 'N/A';
const rateChange = (value, baseline) => Number.isFinite(value) && Number.isFinite(baseline)
  ? value - baseline
  : null;
const dateForInput = (timestamp) => {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
let history = [];
let requestVersion = 0;
let loadedThreshold = 10;

select('analysis-link').href = `/reports/${reportIdx}/analysis`;
select('reports-link').href = `/reports/${reportIdx}`;

const setStatus = (message, error = false) => {
  select('message').textContent = message;
  select('message').hidden = !message;
  select('message').dataset.state = error ? 'error' : '';
};

const eligibleHistory = () => history.filter((run) => select('include-temporary').checked || !run.isTemporary);

const populateControls = () => {
  const runs = eligibleHistory();
  const previousBaseline = select('baseline').value;
  select('baseline').replaceChildren();
  runs.forEach((run) => {
    const option = document.createElement('option');
    option.value = String(run.id);
    option.textContent = run.report;
    select('baseline').append(option);
  });
  if (runs.some((run) => String(run.id) === previousBaseline)) select('baseline').value = previousBaseline;
  ['start-date', 'end-date'].forEach((id) => {
    const input = select(id);
    const followedEnd = id === 'end-date' && input.value === input.max;
    input.min = runs.length ? dateForInput(runs[0].timestamp) : '';
    input.max = runs.length ? dateForInput(runs.at(-1).timestamp) : '';
    if (!input.value || followedEnd) input.value = id === 'start-date' ? input.min : input.max;
  });
};

const appendMetric = (label, value, change, unit = '%') => {
  const wrapper = document.createElement('div');
  const heading = document.createElement('dt');
  heading.textContent = label;
  const metric = document.createElement('dd');
  metric.textContent = format(value);
  const difference = document.createElement('span');
  difference.className = 'analysis-metric-change';
  difference.textContent = signed(change, unit);
  wrapper.append(heading, metric, difference);
  select('metric-summary').append(wrapper);
};

const render = () => {
  const start = select('start-date').value;
  const end = select('end-date').value;
  if (start && end && start > end) {
    setStatus('Start date must be on or before end date.', true);
    select('trend-results').hidden = true;
    return;
  }
  const eligible = eligibleHistory();
  const baseline = eligible.find((run) => String(run.id) === select('baseline').value);
  const runs = eligible.filter((run) => {
    const date = dateForInput(run.timestamp);
    return (!start || date >= start) && (!end || date <= end);
  });
  if (!baseline || !runs.length) {
    setStatus('No report history in the selected range.');
    select('trend-results').hidden = true;
    return;
  }
  setStatus(runs.some((run) => run.functionCount === 0)
    ? 'Some reports have no function data; function metrics are N/A.' : '');
  select('trend-results').hidden = false;
  select('range-summary').textContent = `${runs.length} runs | Baseline: ${baseline.report} | Latest: ${runs.at(-1).report}`;
  if (!isGrowthReport) select('risk-threshold').textContent = `Function complexity > ${loadedThreshold}`;
  select('metric-summary').replaceChildren(...(isGrowthReport ? [select('range-summary').parentElement] : []));
  const latest = runs.at(-1);
  if (isGrowthReport) {
    appendMetric('Included files', latest.fileCount, baselineChange(latest.fileCount, baseline.fileCount));
    select('comparison-rows').replaceChildren();
    const metrics = [
      ['Included files', 'fileCount'],
      ['Mean complexity per function', 'meanFunctionComplexity'],
    ];
    metrics.forEach(([label, key]) => {
      const row = document.createElement('tr');
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.textContent = label;
      row.append(heading);
      const difference = rateChange(latest[key], baseline[key]);
      const values = [
        format(baseline[key]), format(latest[key]), signed(difference),
        signed(baselineChange(latest[key], baseline[key]), '%'),
      ];
      values.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      select('comparison-rows').append(row);
    });
  }
  if (!isGrowthReport) appendMetric('Total function complexity', latest.totalFunctionComplexity,
    baselineChange(latest.totalFunctionComplexity, baseline.totalFunctionComplexity));
  if (!isGrowthReport) appendMetric('Functions', latest.functionCount, baselineChange(latest.functionCount, baseline.functionCount));
  appendMetric('Mean complexity / function', latest.meanFunctionComplexity,
    baselineChange(latest.meanFunctionComplexity, baseline.meanFunctionComplexity));
  if (!isGrowthReport) appendMetric('90th percentile', latest.percentile90, baselineChange(latest.percentile90, baseline.percentile90));
  if (!isGrowthReport) appendMetric('High-complexity rate (%)', latest.highComplexityFunctionRate,
    rateChange(latest.highComplexityFunctionRate, baseline.highComplexityFunctionRate), ' pp');

  const baselineRuns = runs.map((run) => ({
    timestamp: run.timestamp,
    report: run.report,
    ...Object.fromEntries(series.map(({ key }) => [key, baselineChange(run[key], baseline[key])])),
  }));
  const selectedMetrics = Array.from(document.querySelectorAll('.analysis-metrics input:checked'), (input) => input.value);
  renderReportTrend(select('baseline-chart'), baselineRuns, selectedMetrics,
    { ...chartOptions, signedValues: true, unit: '%', label: 'Percentage change from selected baseline over time' });
  if (!isGrowthReport) {
    renderReportTrend(select('function-chart'), runs, ['meanFunctionComplexity', 'percentile90'],
      { ...chartOptions, label: 'Mean and 90th percentile function complexity over time' });
    renderReportTrend(select('risk-chart'), runs, ['highComplexityFunctionRate'],
      { ...chartOptions, unit: '%', label: 'Percentage of functions above the complexity threshold over time' });
  }

  select('history-rows').replaceChildren();
  runs.forEach((run) => {
    const row = document.createElement('tr');
    if (run.id === baseline.id) row.className = 'analysis-baseline-row';
    const reportCell = document.createElement('td');
    const link = document.createElement('a');
    link.href = `/reports/${reportIdx}/${run.timestamp}`;
    link.textContent = `${run.report}${run.id === baseline.id ? ' (baseline)' : ''}`;
    reportCell.append(link);
    row.append(reportCell);
    const values = [
      ...(isGrowthReport ? [format(run.fileCount), signed(baselineChange(run.fileCount, baseline.fileCount), '%')] : []),
      format(run.functionCount),
      ...(!isGrowthReport ? [format(run.totalFunctionComplexity),
        signed(baselineChange(run.totalFunctionComplexity, baseline.totalFunctionComplexity))] : []),
      format(run.meanFunctionComplexity), signed(baselineChange(run.meanFunctionComplexity, baseline.meanFunctionComplexity)),
      ...(!isGrowthReport ? [format(run.percentile90)] : []),
      ...(!isGrowthReport ? [format(run.highComplexityFunctionRate),
        signed(rateChange(run.highComplexityFunctionRate, baseline.highComplexityFunctionRate))] : []),
    ];
    values.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });
    select('history-rows').append(row);
  });
};

const load = async () => {
  if (!isGrowthReport && !select('threshold').reportValidity()) return;
  const version = ++requestVersion;
  setStatus('Loading function history...');
  select('trend-results').hidden = true;
  select('refresh').disabled = true;
  try {
    const query = isGrowthReport ? '' : `?threshold=${encodeURIComponent(select('threshold').value)}`;
    const response = await fetch(`/api/reports/${reportIdx}/function-trends${query}`);
    const data = await response.json();
    if (version !== requestVersion) return;
    if (!response.ok) throw new Error(data.error || 'Unable to load function history.');
    history = data.history;
    loadedThreshold = data.threshold;
    document.title = `${data.name} - ${isGrowthReport ? 'Growth and Complexity' : 'Baseline Changes'}`;
    select('title').textContent = data.name;
    select('subtitle').textContent = data.projectKey;
    populateControls();
    render();
  } catch (error) {
    if (version !== requestVersion) return;
    setStatus(error.message, true);
    select('trend-results').hidden = true;
  } finally {
    if (version === requestVersion) select('refresh').disabled = false;
  }
};

select('trend-controls').addEventListener('submit', (event) => event.preventDefault());
['baseline', 'start-date', 'end-date'].forEach((id) => select(id).addEventListener('change', render));
select('include-temporary').addEventListener('change', () => { populateControls(); render(); });
document.querySelectorAll('.analysis-metrics input').forEach((input) => input.addEventListener('change', render));
if (!isGrowthReport) select('threshold').addEventListener('change', load);
select('refresh').addEventListener('click', load);
load();