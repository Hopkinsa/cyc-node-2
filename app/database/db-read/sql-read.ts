const filterOutFiles = `(filename NOT LIKE '%eslint-configs/%' AND filename NOT LIKE '%mock%' AND filename NOT LIKE '%test-setup%' AND filename NOT LIKE '%.json' AND filename NOT LIKE 'libs/shared/%')`;

export const GET_ALL_GITLOG = `SELECT id, labels, datetime FROM gitlog ORDER BY datetime ASC`;
export const GET_GITLOG_BY_PROJECT = `SELECT id, labels, datetime FROM gitlog WHERE labels LIKE ? ORDER BY datetime ASC`;
export const GET_EXTRACTION_STATE = `SELECT value FROM extraction_state WHERE key = ?`;

export const GET_ALL_REPORTS = `SELECT id, project, report, timestamp, fileCount, totalComplexity, averageComplexity FROM reports`;
export const GET_ALL_FILES = `SELECT id, report_id, filename, fileComplexity, totalFunctions, totalComplexity, averageComplexity FROM files WHERE ${filterOutFiles}`;
export const GET_ALL_FUNCTIONS = `SELECT id, report_id, summary_id, function, line, functionComplexity FROM functions`;

export const GET_REPORT_BY_NAME = `SELECT id FROM reports WHERE report = ?`;
export const GET_REPORT_BY_PROJECT_AND_TIMESTAMP = `SELECT id, project, report, timestamp, fileCount, totalComplexity, averageComplexity FROM reports WHERE project = ? AND timestamp = ?`;
export const GET_ALL_REPORT_FILES = `SELECT id, report_id, filename, fileComplexity, totalFunctions, totalComplexity, averageComplexity FROM files WHERE report_id = ? AND ${filterOutFiles}`;
export const GET_ALL_REPORT_FILE_FUNCTIONS = `SELECT id, report_id, summary_id, function, line, functionComplexity FROM functions WHERE report_id = ? AND summary_id = ?`;



export const GET_COMPARE_REPORT_FILES = `
SELECT filename, fileComplexity, totalFunctions, totalComplexity, averageComplexity, '1' AS report FROM files WHERE report_id = ? AND ${filterOutFiles}
UNION ALL
SELECT filename, fileComplexity, totalFunctions, totalComplexity, averageComplexity, '2' AS report FROM files WHERE report_id = ? AND ${filterOutFiles}
ORDER BY filename ASC
`;
