import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import Database from 'better-sqlite3';
import DBService from '../app/services/db.service.ts';
import DBRead from '../app/database/db-read/db-read.ts';
import DBUpdate from '../app/database/db-update/db-update.ts';
import { FILE_TABLE, FUNCTION_TABLE, REPORT_TABLE } from '../app/database/db-init/sql-init.ts';
import { baselineChange, renderFunctionBaselineTrend, renderReportTrend } from '../static/report-chart.js';
import { buildProjectAnalysis } from '../app/utility/project-analysis.ts';
import config from '../app/utility/config.ts';
import Report from '../app/utility/report.ts';
import { app } from '../app/app.ts';

const analysisOptions = { threshold: 10, topPercent: 10, depth: 2 };
const observation = (name, complexity, filename = 'apps/probe/main.ts') => ({ filename, name, complexity, line: 1 });
const run = (id, functions) => ({ id, timestamp: id * 100, report: `Run ${id}`, functions });

test('attribution reconciles additions, removals, name matches and duplicate-name uncertainty', () => {
  const result = buildProjectAnalysis('attribution', [
    run(1, [observation('retained', 10), observation('removed', 5), observation('duplicate', 2), observation('duplicate', 3)]),
    run(2, [observation('retained', 7), observation('added', 4), observation('duplicate', 8)]),
  ], analysisOptions);
  assert.equal(result.summary[0].value, -1);
  assert.deepEqual(result.contributions.map((item) => item.value), [4, -5, -3, 3]);
  assert.equal(result.contributions.reduce((total, item) => total + item.value, 0), -1);
  assert.equal(result.rows.find((row) => row.name === 'duplicate').status, 'Unmatched duplicate name');
  const moved = buildProjectAnalysis('attribution', [run(1, [observation('same', 3)]),
    run(2, [observation('same', 3, 'apps/probe/moved.ts')])], analysisOptions);
  assert.equal(moved.rows.filter((row) => row.status === 'Name-based match').length, 0);
});

test('hotspot persistence distinguishes observed-run persistence from period coverage', () => {
  const result = buildProjectAnalysis('persistence', [
    run(1, [observation('high', 11)]), run(2, [observation('low', 10)]), run(3, []),
  ], analysisOptions);
  assert.equal(result.rows[0].highReports, 1);
  assert.equal(result.rows[0].persistence, 50);
  assert.equal(result.rows[0].coverage, 200 / 3);
  assert.equal(result.rows[0].latestMean, null);
  assert.equal(result.trend[2].highFileRate, null);
});

test('distribution counts exact band boundaries and keeps empty percentages unavailable', () => {
  const result = buildProjectAnalysis('distribution', [
    run(1, [1, 5, 6, 10, 11, 20, 21].map((value) => observation(String(value), value))), run(2, []),
  ], analysisOptions);
  assert.deepEqual(['lowCount', 'minorCount', 'mediumCount', 'highCount'].map((key) => result.rows[0][key]), [2, 2, 2, 1]);
  assert.ok(Math.abs(['low', 'minor', 'medium', 'high'].reduce((total, key) => total + result.rows[0][key], 0) - 100) < 1e-10);
  assert.equal(result.rows[1].high, null);
});

test('concentration rounds up selected functions and bounds cumulative shares', () => {
  const result = buildProjectAnalysis('concentration', [run(1, [observation('low', 1), observation('high', 9)])], analysisOptions);
  assert.equal(result.rows[0].topCount, 1);
  assert.equal(result.rows[0].actualPercent, 50);
  assert.equal(result.rows[0].share, 90);
  assert.equal(result.details[0].name, 'high');
  assert.equal(result.details[0].cumulativeShare, 90);
  const all = buildProjectAnalysis('concentration', [run(1, [observation('one', 1)])], { ...analysisOptions, topPercent: 100 });
  assert.equal(all.rows[0].share, 100);
});

test('module totals reconcile with the project and absent averages remain unavailable', () => {
  const result = buildProjectAnalysis('modules', [
    run(1, [observation('first', 10, 'apps/probe/main.ts')]),
    run(2, [observation('first', 5, 'apps/probe/main.ts'), observation('new', 20, 'libs/probe/main.ts')]),
  ], analysisOptions);
  assert.equal(result.rows.reduce((total, row) => total + row.total, 0), 25);
  assert.equal(result.rows.find((row) => row.module === 'apps/probe').meanChange, -50);
  assert.equal(result.rows.find((row) => row.module === 'libs/probe').meanChange, null);
  assert.equal(result.trend[0].module0Mean, null);
  for (const kind of ['attribution', 'persistence', 'distribution', 'concentration', 'modules']) {
    assert.deepEqual(buildProjectAnalysis(kind, [], analysisOptions), { summary: [], rows: [], trend: [] });
  }
});

test('analysis API isolates projects, validates periods and rejects invalid parameters', async () => {
  const index = config.REPORTS.length;
  config.REPORTS.push({ NAME: 'Analysis fixture', PATH: process.cwd(), FOLDER: 'analysis-fixture' });
  let code;
  let data;
  const response = {
    status(value) { code = value; return this; },
    json(value) { data = value; },
  };
  try {
    const first = await DBUpdate.createReports({ project: 'analysis-fixture', report: 'First', timestamp: 1, fileCount: 0, totalComplexity: 0, averageComplexity: 0 });
    const last = await DBUpdate.createReports({ project: 'analysis-fixture', report: 'Last', timestamp: 2, fileCount: 0, totalComplexity: 0, averageComplexity: 0 });
    const foreign = await DBUpdate.createReports({ project: 'other-project', report: 'Foreign', timestamp: 3, fileCount: 0, totalComplexity: 0, averageComplexity: 0 });
    const temporary = await DBUpdate.createReports({ project: 'analysis-fixture', report: 'Temporary', isTemporary: true, timestamp: 4, fileCount: 0, totalComplexity: 0, averageComplexity: 0 });
    const request = (query = {}, kind = 'distribution') => ({ params: { idx: String(index), kind }, query });
    for (const kind of ['attribution', 'persistence', 'distribution', 'concentration', 'modules']) {
      await Report.getProjectInsightData(request({}, kind), response);
      assert.equal(code, 200);
      assert.equal(data.period.runs, 2);
      assert.ok(data.notice.includes('no function data'));
    }
    await Report.getProjectInsightData(request({ temporary: 'true' }), response);
    assert.equal(code, 200);
    assert.equal(data.period.runs, 3);
    for (const query of [
      { start: String(last), end: String(first) }, { start: String(foreign) },
      { end: String(temporary) }, { threshold: '0' }, { topPercent: '101' },
      { depth: '0' }, { temporary: 'maybe' },
    ]) {
      await Report.getProjectInsightData(request(query), response);
      assert.equal(code, 400);
    }
    await Report.getProjectInsightData(request({}, 'unsupported'), response);
    assert.equal(code, 400);
  } finally {
    config.REPORTS.pop();
  }
});

beforeEach(() => {
  DBService.db = new Database(':memory:');
  for (const schema of [REPORT_TABLE, FILE_TABLE, FUNCTION_TABLE]) DBService.db.exec(schema);
});
afterEach(() => {
  DBService.db.close();
  delete globalThis.document;
});

test('baseline changes retain direction and reject zero or missing baselines', () => {
  assert.ok(Math.abs(baselineChange(120, 100) - 20) < 1e-10);
  assert.ok(Math.abs(baselineChange(80, 100) + 20) < 1e-10);
  assert.equal(baselineChange(10, 10), 0);
  assert.equal(baselineChange(0, 10), -100);
  assert.equal(baselineChange(1, 0), null);
  assert.equal(baselineChange(null, 10), null);
  assert.equal(baselineChange(10, undefined), null);
});

test('growth history counts included files independently of functions and applies project exclusions', async () => {
  const index = config.REPORTS.length;
  config.REPORTS.push({ NAME: 'Growth fixture', PATH: process.cwd(), FOLDER: 'growth-fixture', EXCLUDE_FILES: ['apps/probe/excluded.ts'] });
  const file = (filename, complexities) => ({
    file: filename, complexity: complexities.reduce((total, value) => total + value, 0),
    functionTotal: complexities.length,
    complexityTotal: complexities.reduce((total, value) => total + value, 0), complexityAverage: 0,
    functions: complexities.map((complexity) => ({ name: 'same', line: 1, complexity })),
  });
  try {
    for (const [timestamp, files] of [
      [1, [file('apps/probe/main.ts', [10, 20])]],
      [2, [file('apps/probe/main.ts', [5, 5]), file('apps/probe/empty.ts', []),
        file('apps/probe/excluded.ts', [100]), file('libs/shared/common.ts', [100])]],
    ]) {
      DBUpdate.createReportWithData({ project: 'growth-fixture', report: `Run ${timestamp}`, timestamp,
        fileCount: 999, totalComplexity: 999, averageComplexity: 999 }, files);
    }
    await DBUpdate.createReports({ project: 'other-project', report: 'Foreign', timestamp: 3,
      fileCount: 0, totalComplexity: 0, averageComplexity: 0 });
    let data;
    await Report.getFunctionTrends({ params: { idx: String(index) }, query: {} }, {
      status(value) { assert.equal(value, 200); return this; },
      json(value) { data = value; },
    });
    assert.equal(data.history.length, 2);
    const [baseline, latest] = data.history;
    assert.deepEqual(data.history.map((item) => item.fileCount), [1, 2]);
    assert.deepEqual(data.history.map((item) => item.totalFunctionComplexity), [30, 10]);
    assert.deepEqual(data.history.map((item) => item.meanFunctionComplexity), [15, 5]);
    assert.deepEqual(data.history.map((item) => item.highComplexityFunctionRate), [50, 0]);
    assert.equal(baselineChange(latest.fileCount, baseline.fileCount), 100);
    assert.ok(baselineChange(latest.meanFunctionComplexity, baseline.meanFunctionComplexity) < 0);
  } finally {
    config.REPORTS.pop();
  }
});

test('growth report has its own route and is linked from project analysis', async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/reports/0/analysis/growth`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Growth and Complexity/);
    assert.match(html, /id="comparison-rows"/);
    assert.match(html, /value="fileCount" checked/);
    assert.doesNotMatch(html, /totalFunctionComplexity|Total Function Complexity|High-Complexity|90th percentile|id="threshold"/i);
    const hub = await fetch(`${base}/reports/0/analysis`);
    assert.match(await hub.text(), /id="growth-link"/);
    const baseline = await fetch(`${base}/reports/0/analysis/trends`);
    assert.match(await baseline.text(), /Baseline Changes/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('function statistics use individual functions, exclusions and a strict threshold', async () => {
  const file = (filename, complexities) => ({
    file: filename,
    complexity: complexities[0],
    functionTotal: complexities.length,
    complexityTotal: complexities.reduce((total, value) => total + value, 0),
    complexityAverage: complexities[0] / complexities.length,
    functions: complexities.map((complexity, index) => ({ name: 'same', line: index + 1, complexity })),
  });
  DBUpdate.createReportWithData({
    project: 'probe', report: 'probe', timestamp: 1,
    fileCount: 3, totalComplexity: 102, averageComplexity: 34,
  }, [
    file('apps/probe/main.ts', [2, 10, 20]),
    file('apps/probe/excluded.ts', [100]),
    file('libs/shared/common.ts', [100]),
  ]);
  const reports = [{ id: 1, excludedFiles: ['apps/probe/excluded.ts'] }];
  const stats = (await DBRead.getReportFunctionStatsForReports(reports)).get('1');
  assert.deepEqual(stats, {
    functionCount: 3,
    totalFunctionComplexity: 32,
    meanFunctionComplexity: 32 / 3,
    percentile90: 20,
    highComplexityFunctionCount: 1,
    highComplexityFunctionRate: 100 / 3,
  });
  const lowerThreshold = (await DBRead.getReportFunctionStatsForReports(reports, 5)).get('1');
  assert.equal(lowerThreshold.highComplexityFunctionCount, 2);
  const functions = (await DBRead.getReportFunctionsForReports(reports)).get('1');
  assert.equal(functions.length, 3);
  assert.deepEqual(functions[0], { filename: 'apps/probe/main.ts', name: 'same', line: 1, complexity: 2 });
});

test('reports without function data have unavailable averages, percentiles and rates', async () => {
  const stats = (await DBRead.getReportFunctionStatsForReports([{ id: 99 }])).get('99');
  assert.equal(stats.functionCount, 0);
  assert.equal(stats.meanFunctionComplexity, null);
  assert.equal(stats.percentile90, null);
  assert.equal(stats.highComplexityFunctionRate, null);
  assert.equal((await DBRead.getReportFunctionStatsForReports([])).size, 0);
});

test('date-scaled signed charts preserve gaps and keep the legacy interface', () => {
  class Element {
    constructor(name) {
      this.name = name;
      this.children = [];
      this.attributes = {};
      this.style = {};
    }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...children) { this.children.push(...children); }
  }
  globalThis.document = {
    createElement: (name) => new Element(name),
    createElementNS: (_namespace, name) => new Element(name),
    createTextNode: (text) => ({ textContent: text }),
  };
  const container = new Element('div');
  renderReportTrend(container, [
    { timestamp: 100, report: 'start', change: 0 },
    { timestamp: 110, report: 'soon', change: 10 },
    { timestamp: 120, report: 'missing', change: null },
    { timestamp: 200, report: 'end', change: -20 },
  ], ['change'], {
    series: [{ key: 'change', label: 'Change', color: '#286f6c' }],
    timeScale: true, signedValues: true, preserveMissing: true, unit: '%',
  });
  const svg = container.children[1];
  const points = svg.children.filter((element) => element.name === 'circle');
  assert.equal(points.length, 3);
  assert.ok(Number(points[2].attributes.cy) > Number(points[0].attributes.cy));
  assert.ok(Math.abs((points[1].attributes.cx - points[0].attributes.cx)
    / (points[2].attributes.cx - points[0].attributes.cx) - 0.1) < 1e-10);
  const path = svg.children.find((element) => element.name === 'path').attributes.d;
  assert.equal((path.match(/M/g) || []).length, 2);
  assert.ok(!/NaN|Infinity/.test(path));
  assert.ok(svg.children.some((element) => element.attributes.class === 'chart-baseline-line'));
  const legacy = new Element('div');
  renderReportTrend(legacy, [{ timestamp: 1, fileCount: 5, report: 'legacy' }], ['fileCount']);
  assert.equal(legacy.children[1].children.filter((element) => element.name === 'circle').length, 1);

  const baseline = new Element('div');
  renderFunctionBaselineTrend(baseline, [
    { timestamp: 200, report: 'latest', totalFunctionComplexity: 80, meanFunctionComplexity: 3 },
    { timestamp: 50, report: 'temporary', isTemporary: true, totalFunctionComplexity: 1, meanFunctionComplexity: 1 },
    { timestamp: 100, report: 'baseline', totalFunctionComplexity: 100, meanFunctionComplexity: 2 },
  ]);
  assert.deepEqual(baseline.children[0].children.map((item) => item.children[1].textContent),
    ['Total function complexity', 'Mean complexity per function']);
  const baselinePoints = baseline.children[1].children.filter((element) => element.name === 'circle');
  assert.equal(baselinePoints.length, 4);
  assert.match(baselinePoints[1].children[0].textContent, /-20%/);
  assert.match(baselinePoints[3].children[0].textContent, /50%/);
  const unavailable = new Element('div');
  renderFunctionBaselineTrend(unavailable, [
    { timestamp: 100, report: 'zero', totalFunctionComplexity: 0, meanFunctionComplexity: null },
    { timestamp: 200, report: 'latest', totalFunctionComplexity: 80, meanFunctionComplexity: 3 },
  ]);
  assert.equal(unavailable.children[1].children.filter((element) => element.name === 'circle').length, 0);
  const empty = new Element('div');
  renderFunctionBaselineTrend(empty, []);
  assert.equal(empty.children[0].textContent, 'No report history available.');
});