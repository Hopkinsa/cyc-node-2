export const DELETE_GITLOG_DATA = `DELETE FROM gitlog`;
export const CREATE_GITLOG_DATA = `INSERT INTO gitlog ("id", "labels", "datetime") VALUES (?, ?, ?)`;

export const UPDATE_REPORT_DATA = `UPDATE reports SET project = ?, report = ?, timestamp = ? WHERE id = ?`;
export const CREATE_REPORT_DATA = `INSERT INTO reports ("project", "report", "timestamp") VALUES (?, ?, ?)`;
export const DELETE_FUNCTIONS_BY_REPORT_ID = `DELETE FROM functions WHERE report_id = ?`;
export const DELETE_FILES_BY_REPORT_ID = `DELETE FROM files WHERE report_id = ?`;
export const DELETE_REPORT_BY_ID = `DELETE FROM reports WHERE id = ?`;


export const UPDATE_FILE_DATA = `UPDATE files SET report_id = ?, filename = ?, fileComplexity = ?, totalFunctions = ?, totalComplexity = ?, averageComplexity = ? WHERE id = ?`;
export const CREATE_FILE_DATA = `INSERT INTO files ("report_id", "filename", "fileComplexity", "totalFunctions", "totalComplexity", "averageComplexity") VALUES (?, ?, ?, ?, ?, ?)`;


export const UPDATE_FUNCTION_DATA = `UPDATE functions SET report_id = ?, summary_id = ?, function = ?, line = ?, functionComplexity = ? WHERE id = ?`;
export const CREATE_FUNCTION_DATA = `INSERT INTO functions ("report_id", "summary_id", "function", "line", "functionComplexity") VALUES (?, ?, ?, ?, ?)`;
