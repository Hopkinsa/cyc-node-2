export const ANALYSIS_REPORTS = {
  attribution: 'Change Attribution',
  persistence: 'Persistent Hotspots',
  distribution: 'Complexity Distribution',
  concentration: 'Complexity Concentration',
  modules: 'Module Trends',
};

export type AnalysisKind = keyof typeof ANALYSIS_REPORTS;
export type AnalysisFunction = { filename: string; name: string; line: number; complexity: number };
export type AnalysisRun = { id: number; timestamp: number; report: string; functions: AnalysisFunction[] };
type Row = Record<string, string | number | null>;
type Metric = { label: string; value: number | null; unit?: string };
type Insight = {
  summary: Metric[];
  rows: Row[];
  trend: Row[];
  notice?: string;
  contributions?: Array<{ label: string; value: number }>;
  details?: Row[];
  modules?: string[];
};

const sum = (functions: AnalysisFunction[]): number => functions.reduce((total, item) => total + item.complexity, 0);
const mean = (functions: AnalysisFunction[]): number | null => functions.length ? sum(functions) / functions.length : null;
const percent = (numerator: number, denominator: number): number | null => denominator > 0 ? 100 * numerator / denominator : null;
const change = (current: number | null, baseline: number | null): number | null => (
  current !== null && baseline !== null && baseline !== 0 ? 100 * (current / baseline - 1) : null
);
const group = (functions: AnalysisFunction[], keyFor: (item: AnalysisFunction) => string): Map<string, AnalysisFunction[]> => {
  const groups = new Map<string, AnalysisFunction[]>();
  for (const item of functions) {
    const key = keyFor(item);
    const entries = groups.get(key) ?? [];
    entries.push(item);
    groups.set(key, entries);
  }
  return groups;
};

const attribution = (runs: AnalysisRun[]): Insight => {
  const first = runs[0];
  const latest = runs.at(-1)!;
  const before = group(first.functions, (item) => JSON.stringify([item.filename, item.name]));
  const after = group(latest.functions, (item) => JSON.stringify([item.filename, item.name]));
  let added = 0;
  let removed = 0;
  let retained = 0;
  let unmatchedBefore = 0;
  let unmatchedAfter = 0;
  const rows: Row[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(key) ?? [];
    const current = after.get(key) ?? [];
    const sample = current[0] ?? previous[0];
    const beforeComplexity = sum(previous);
    const afterComplexity = sum(current);
    let status: string;
    if (previous.length > 1 || current.length > 1) {
      status = 'Unmatched duplicate name';
      unmatchedBefore += beforeComplexity;
      unmatchedAfter += afterComplexity;
    } else if (previous.length && current.length) {
      status = 'Name-based match';
      retained += afterComplexity - beforeComplexity;
    } else if (current.length) {
      status = 'Added or renamed';
      added += afterComplexity;
    } else {
      status = 'Removed or renamed';
      removed += beforeComplexity;
    }
    rows.push({
      file: sample.filename, name: sample.name, status,
      before: beforeComplexity, after: afterComplexity,
      delta: afterComplexity - beforeComplexity,
      beforeCount: previous.length, afterCount: current.length,
    });
  }
  const unmatched = unmatchedAfter - unmatchedBefore;
  return {
    summary: [
      { label: 'Net complexity change', value: sum(latest.functions) - sum(first.functions) },
      { label: 'Added contribution', value: added },
      { label: 'Removed contribution', value: -removed },
      { label: 'Name-matched contribution', value: retained },
      { label: 'Unmatched contribution', value: unmatched },
      { label: 'Unmatched before / after', value: unmatchedBefore, unit: ` / ${unmatchedAfter}` },
    ],
    contributions: [
      { label: 'Added or renamed', value: added },
      { label: 'Removed or renamed', value: -removed },
      { label: 'Name-based matches', value: retained },
      { label: 'Unmatched duplicate names', value: unmatched },
    ],
    rows: rows.sort((left, right) => Math.abs(Number(right.delta)) - Math.abs(Number(left.delta))),
    trend: [],
    notice: 'Matches use unique file paths and function names, not verified function identities. Renames and moves appear as additions/removals; duplicate names remain unmatched. Contributions include the unmatched difference and reconcile to the net change.',
  };
};

const persistence = (runs: AnalysisRun[], threshold: number): Insight => {
  const observations = new Map<string, Array<{ runId: number; functions: AnalysisFunction[] }>>();
  const trend = runs.map((run) => {
    const files = group(run.functions, (item) => item.filename);
    let highFiles = 0;
    for (const [filename, functions] of files) {
      const entries = observations.get(filename) ?? [];
      entries.push({ runId: run.id, functions });
      observations.set(filename, entries);
      if (functions.some((item) => item.complexity > threshold)) highFiles += 1;
    }
    return { timestamp: run.timestamp, report: run.report, highFileRate: percent(highFiles, files.size), highFiles };
  });
  const rows = Array.from(observations, ([file, entries]): Row => {
    const highReports = entries.filter((entry) => entry.functions.some((item) => item.complexity > threshold)).length;
    const latest = entries.find((entry) => entry.runId === runs.at(-1)!.id);
    const latestMean = latest ? mean(latest.functions) : null;
    const firstMean = mean(entries[0].functions);
    return {
      file, highReports, observations: entries.length,
      persistence: percent(highReports, entries.length),
      coverage: percent(entries.length, runs.length),
      latestMean, change: latestMean !== null && firstMean !== null ? latestMean - firstMean : null,
      latestPeak: latest ? Math.max(...latest.functions.map((item) => item.complexity)) : null,
      peak: Math.max(...entries.flatMap((entry) => entry.functions.map((item) => item.complexity))),
    };
  }).filter((row) => Number(row.highReports) > 0)
    .sort((left, right) => Number(right.highReports) - Number(left.highReports) || Number(right.peak) - Number(left.peak));
  return {
    summary: [
      { label: 'Files exceeding threshold', value: rows.length },
      { label: 'Hotspots in multiple runs', value: rows.filter((row) => Number(row.highReports) > 1).length },
      { label: 'Runs in period', value: runs.length },
      { label: 'Latest high-file rate', value: trend.at(-1)!.highFileRate, unit: '%' },
    ],
    rows, trend,
    notice: `A file is a hotspot when any function has complexity > ${threshold}. Persistence uses runs containing that file; coverage uses all runs in the period. File renames are not matched.`,
  };
};

const distribution = (runs: AnalysisRun[]): Insight => {
  const rows = runs.map((run) => {
    const counts = [0, 0, 0, 0];
    for (const item of run.functions) {
      counts[item.complexity <= 5 ? 0 : item.complexity <= 10 ? 1 : item.complexity <= 20 ? 2 : 3] += 1;
    }
    return {
      timestamp: run.timestamp, report: run.report, functions: run.functions.length,
      low: percent(counts[0], run.functions.length), minor: percent(counts[1], run.functions.length),
      medium: percent(counts[2], run.functions.length), high: percent(counts[3], run.functions.length),
      lowCount: counts[0], minorCount: counts[1], mediumCount: counts[2], highCount: counts[3],
    };
  });
  const latest = rows.at(-1)!;
  return {
    summary: [
      { label: 'Latest functions', value: latest.functions },
      { label: 'Complexity 1-5', value: latest.low, unit: '%' },
      { label: 'Complexity 6-10', value: latest.minor, unit: '%' },
      { label: 'Complexity 11-20', value: latest.medium, unit: '%' },
      { label: 'Complexity 21+', value: latest.high, unit: '%' },
    ],
    rows, trend: rows,
  };
};

const concentration = (runs: AnalysisRun[], topPercent: number): Insight => {
  const ranked = (run: AnalysisRun) => run.functions.slice().sort((left, right) => right.complexity - left.complexity
    || left.filename.localeCompare(right.filename) || left.line - right.line);
  const rows = runs.map((run) => {
    const functions = ranked(run);
    const selected = Math.ceil(functions.length * topPercent / 100);
    const total = sum(functions);
    const topComplexity = sum(functions.slice(0, selected));
    return {
      timestamp: run.timestamp, report: run.report, functions: functions.length,
      topCount: selected, actualPercent: percent(selected, functions.length),
      total, topComplexity, share: percent(topComplexity, total),
    };
  });
  const latest = rows.at(-1)!;
  let cumulative = 0;
  const details = ranked(runs.at(-1)!).slice(0, latest.topCount).map((item, index) => {
    cumulative += item.complexity;
    return {
      rank: index + 1, file: item.filename, name: item.name, line: item.line,
      complexity: item.complexity, share: percent(item.complexity, latest.total),
      cumulativeShare: percent(cumulative, latest.total),
    };
  });
  return {
    summary: [
      { label: 'Latest functions', value: latest.functions },
      { label: 'Top-ranked functions', value: latest.topCount },
      { label: 'Actual selected fraction', value: latest.actualPercent, unit: '%' },
      { label: 'Complexity in selected functions', value: latest.share, unit: '%' },
    ],
    rows, trend: rows, details,
    notice: `The most complex ${topPercent}% of functions are selected by rank, rounded up to whole functions. Equal-score ties are ordered by path and line; concentration is not a quality score by itself.`,
  };
};

const moduleTrends = (runs: AnalysisRun[], threshold: number, depth: number): Insight => {
  const grouped = runs.map((run) => group(run.functions, (item) => {
    const directories = item.filename.replaceAll('\\', '/').split('/').slice(0, -1);
    return directories.slice(0, depth).join('/') || '(root)';
  }));
  const modules = Array.from(new Set(grouped.flatMap((groups) => [...groups.keys()]))).sort();
  const rows = modules.map((module): Row => {
    const first = grouped[0].get(module) ?? [];
    const latest = grouped.at(-1)!.get(module) ?? [];
    const currentMean = mean(latest);
    return {
      module, functions: latest.length, total: sum(latest), mean: currentMean,
      meanChange: change(currentMean, mean(first)),
      highRate: percent(latest.filter((item) => item.complexity > threshold).length, latest.length),
      observations: grouped.filter((groups) => groups.has(module)).length,
    };
  }).sort((left, right) => Number(right.total) - Number(left.total) || String(left.module).localeCompare(String(right.module)));
  const orderedModules = rows.map((row) => String(row.module));
  const trend = runs.map((run, index): Row => ({
    timestamp: run.timestamp, report: run.report,
    ...Object.fromEntries(orderedModules.flatMap((module, moduleIndex) => {
      const functions = grouped[index].get(module) ?? [];
      return [
        [`module${moduleIndex}Mean`, mean(functions)],
        [`module${moduleIndex}Rate`, percent(functions.filter((item) => item.complexity > threshold).length, functions.length)],
        [`module${moduleIndex}Count`, functions.length],
        [`module${moduleIndex}Total`, sum(functions)],
      ];
    })),
  }));
  return {
    summary: [
      { label: 'Modules in period', value: modules.length },
      { label: 'Latest functions', value: runs.at(-1)!.functions.length },
      { label: 'Latest total complexity', value: sum(runs.at(-1)!.functions) },
      { label: 'Latest mean complexity', value: mean(runs.at(-1)!.functions) },
    ],
    rows, trend, modules: orderedModules,
    notice: `Modules group file paths by the first ${depth} directory levels. Mean changes compare the first and last selected runs; missing-module averages are N/A.`,
  };
};

export const buildProjectAnalysis = (
  kind: AnalysisKind,
  runs: AnalysisRun[],
  options: { threshold: number; topPercent: number; depth: number }
): Insight => {
  if (!runs.length) return { summary: [], rows: [], trend: [] };
  if (kind === 'attribution') return attribution(runs);
  if (kind === 'persistence') return persistence(runs, options.threshold);
  if (kind === 'distribution') return distribution(runs);
  if (kind === 'concentration') return concentration(runs, options.topPercent);
  return moduleTrends(runs, options.threshold, options.depth);
};