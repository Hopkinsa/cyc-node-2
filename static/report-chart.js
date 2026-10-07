const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const baselineChange = (value, baseline) => (
  Number.isFinite(value) && Number.isFinite(baseline) && baseline !== 0
    ? 100 * (value / baseline - 1)
    : null
);

const SERIES = [
  { key: 'fileCount', label: 'Files', color: '#286f6c' },
  { key: 'functionCount', label: 'Functions', color: '#426a9c' },
  { key: 'totalComplexity', label: 'Total complexity', color: '#9c4a25' },
  { key: 'averageComplexity', label: 'Average complexity', color: '#72558a' },
  { key: 'averageComplexityPerFunction', label: 'Average complexity per function', color: '#4d7f56' },
  { key: 'highComplexityFileCount', label: 'High-complexity files', color: '#ad2525' },
];

export const renderFunctionBaselineTrend = (container, history) => {
  const series = [
    { key: 'totalFunctionComplexity', label: 'Total function complexity', color: '#9c4a25' },
    { key: 'meanFunctionComplexity', label: 'Mean complexity per function', color: '#286f6c' },
  ];
  const runs = history.filter((run) => !run.isTemporary && Number.isFinite(run.timestamp))
    .slice().sort((left, right) => left.timestamp - right.timestamp);
  const baseline = runs[0];
  const changes = runs.map((run) => ({
    timestamp: run.timestamp,
    report: run.report,
    ...Object.fromEntries(series.map(({ key }) => [key, baselineChange(run[key], baseline[key])])),
  }));
  renderReportTrend(container, changes, series.map(({ key }) => key), {
    series, timeScale: true, signedValues: true, preserveMissing: true, unit: '%',
    label: 'Total function complexity and mean complexity per function: percentage change from first displayed run',
  });
};

const createSvgElement = (name, attributes = {}) => {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
};

const formatValue = (value) => Number(value).toLocaleString(undefined, {
  maximumFractionDigits: 2,
});

export const renderReportTrend = (container, reports, metricKeys = SERIES.map((series) => series.key), options = {}) => {
  container.textContent = '';

  const chartData = reports.filter((report) => Number.isFinite(report.timestamp));
  if (options.timeScale) chartData.sort((left, right) => left.timestamp - right.timestamp);
  const activeSeries = (options.series || SERIES).filter((series) => metricKeys.includes(series.key));
  if (chartData.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'chart-empty';
    empty.textContent = 'No report history available.';
    container.append(empty);
    return;
  }

  if (activeSeries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'chart-empty';
    empty.textContent = 'Select a metric to view the trend.';
    container.append(empty);
    return;
  }

  const width = 640;
  const height = 220;
  const padding = { top: 18, right: 16, bottom: 34, left: 48 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const valueFor = (report, key) => options.preserveMissing
    ? (Number.isFinite(report[key]) ? report[key] : null)
    : (Number(report[key]) || 0);
  const values = chartData.flatMap((report) => activeSeries
    .map((series) => valueFor(report, series.key)).filter((value) => value !== null));
  const minimum = options.signedValues ? Math.min(...values, 0) : 0;
  const maximum = Math.max(...values, options.signedValues ? 0 : 1);
  const valueRange = maximum - minimum || 1;
  const timeRange = chartData.at(-1).timestamp - chartData[0].timestamp;
  const xForIndex = (index) => {
    if (chartData.length === 1 || (options.timeScale && timeRange === 0)) {
      return padding.left + plotWidth / 2;
    }
    const ratio = options.timeScale
      ? (chartData[index].timestamp - chartData[0].timestamp) / timeRange
      : index / (chartData.length - 1);
    return padding.left + plotWidth * ratio;
  };
  const yForValue = (value) => padding.top + plotHeight - (((value - minimum) / valueRange) * plotHeight);
  const formatAxisValue = (value) => `${formatValue(value)}${options.unit || ''}`;
  const formatDate = (run) => options.timeScale
    ? new Date(run.timestamp * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : run.report;

  const legend = document.createElement('div');
  legend.className = 'chart-key';
  activeSeries.forEach((series) => {
    const item = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.backgroundColor = series.color;
    item.append(swatch, document.createTextNode(series.label));
    legend.append(item);
  });
  container.append(legend);

  const svg = createSvgElement('svg', {
    class: 'chart-svg',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': options.label || 'Report metrics trend chart',
  });

  [0, 0.5, 1].forEach((ratio) => {
    const y = padding.top + (plotHeight * ratio);
    svg.append(createSvgElement('line', {
      x1: padding.left,
      y1: y,
      x2: width - padding.right,
      y2: y,
      class: 'chart-grid-line',
    }));

    const label = createSvgElement('text', {
      x: padding.left - 8,
      y: y + 4,
      class: 'chart-axis-label',
      'text-anchor': 'end',
    });
    label.textContent = formatAxisValue(maximum - (maximum - minimum) * ratio);
    svg.append(label);
  });

  if (options.signedValues) {
    svg.append(createSvgElement('line', {
      x1: padding.left,
      y1: yForValue(0),
      x2: width - padding.right,
      y2: yForValue(0),
      class: 'chart-baseline-line',
    }));
  }

  const firstLabel = createSvgElement('text', {
    x: xForIndex(0),
    y: height - 10,
    class: 'chart-axis-label',
    'text-anchor': chartData.length === 1 ? 'middle' : 'start',
  });
  firstLabel.textContent = formatDate(chartData[0]);
  svg.append(firstLabel);

  if (chartData.length > 1) {
    const lastLabel = createSvgElement('text', {
      x: xForIndex(chartData.length - 1),
      y: height - 10,
      class: 'chart-axis-label',
      'text-anchor': 'end',
    });
    lastLabel.textContent = formatDate(chartData.at(-1));
    svg.append(lastLabel);
  }

  activeSeries.forEach((series) => {
    const points = chartData.map((report, index) => {
      const value = valueFor(report, series.key);
      return value === null ? null : [xForIndex(index), yForValue(value)];
    });
    let connected = false;
    const segments = points.map((point) => {
      if (!point) {
        connected = false;
        return '';
      }
      const segment = `${connected ? 'L' : 'M'} ${point[0]} ${point[1]}`;
      connected = true;
      return segment;
    });
    const path = createSvgElement('path', {
      d: segments.join(' '),
      class: 'chart-series-line',
      stroke: series.color,
    });
    svg.append(path);

    points.forEach((coordinates, index) => {
      if (!coordinates) return;
      const [x, y] = coordinates;
      const point = createSvgElement('circle', {
        cx: x,
        cy: y,
        r: 3.5,
        fill: series.color,
        class: 'chart-point',
      });
      const title = createSvgElement('title');
      title.textContent = `${chartData[index].report}: ${series.label} ${formatAxisValue(chartData[index][series.key])}`;
      point.append(title);
      svg.append(point);
    });
  });

  container.append(svg);
};
