const FILTER_PATTERNS = [
  '%eslint-configs/%',
  '%mock%',
  '%test-setup%',
  '%.json',
  'libs/shared/%',
];

export const REPORT_VISIBLE_FILES_SQL = `(${FILTER_PATTERNS.map((pattern) => `filename NOT LIKE '${pattern}'`).join(' AND ')})`;

const toMatcher = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/%/g, '.*')}$`);
};

const REPORT_HIDDEN_FILE_MATCHERS = FILTER_PATTERNS.map(toMatcher);

export const shouldIncludeReportFile = (
  filename: string,
  excludedFiles: string[] = []
): boolean => {
  const excludedFileMatchers = excludedFiles.map(toMatcher);

  return [...REPORT_HIDDEN_FILE_MATCHERS, ...excludedFileMatchers].every(
    (matcher) => !matcher.test(filename)
  );
};