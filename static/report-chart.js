const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const SERIES = [
  { key: 'fileCount', label: 'Files', color: '#286f6c' },
  { key: 'totalComplexity', label: 'Total complexity', color: '#9c4a25' },
  { key: 'averageComplexity', label: 'Average complexity', color: '#72558a' },
];

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

export const renderReportTrend = (container, reports, metricKeys = SERIES.map((series) => series.key)) => {
  container.textContent = '';

  const chartData = reports.filter((report) => Number.isFinite(report.timestamp));
  const activeSeries = SERIES.filter((series) => metricKeys.includes(series.key));
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
  const values = chartData.flatMap((report) => activeSeries.map((series) => Number(report[series.key]) || 0));
  const maximum = Math.max(...values, 1);
  const xForIndex = (index) => chartData.length === 1
    ? padding.left + (plotWidth / 2)
    : padding.left + ((plotWidth * index) / (chartData.length - 1));
  const yForValue = (value) => padding.top + plotHeight - ((value / maximum) * plotHeight);

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
    'aria-label': 'Report metrics trend chart',
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
    label.textContent = formatValue(maximum * (1 - ratio));
    svg.append(label);
  });

  const firstLabel = createSvgElement('text', {
    x: xForIndex(0),
    y: height - 10,
    class: 'chart-axis-label',
    'text-anchor': chartData.length === 1 ? 'middle' : 'start',
  });
  firstLabel.textContent = chartData[0].report;
  svg.append(firstLabel);

  if (chartData.length > 1) {
    const lastLabel = createSvgElement('text', {
      x: xForIndex(chartData.length - 1),
      y: height - 10,
      class: 'chart-axis-label',
      'text-anchor': 'end',
    });
    lastLabel.textContent = chartData.at(-1).report;
    svg.append(lastLabel);
  }

  activeSeries.forEach((series) => {
    const points = chartData.map((report, index) => {
      const value = Number(report[series.key]) || 0;
      return [xForIndex(index), yForValue(value)];
    });
    const path = createSvgElement('path', {
      d: points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' '),
      class: 'chart-series-line',
      stroke: series.color,
    });
    svg.append(path);

    points.forEach(([x, y], index) => {
      const point = createSvgElement('circle', {
        cx: x,
        cy: y,
        r: 3.5,
        fill: series.color,
        class: 'chart-point',
      });
      const title = createSvgElement('title');
      title.textContent = `${chartData[index].report}: ${series.label} ${formatValue(chartData[index][series.key])}`;
      point.append(title);
      svg.append(point);
    });
  });

  container.append(svg);
};
