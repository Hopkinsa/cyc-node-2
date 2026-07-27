export const GITLOG_TABLE = `
CREATE TABLE IF NOT EXISTS gitlog (
    id TEXT PRIMARY KEY,
    labels TEXT NOT NULL,
    datetime INTEGER NOT NULL
);
`;

export const REPORT_TABLE = `
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    report TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);
`;

export const FILE_TABLE = `
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    fileComplexity INTEGER,
    totalFunctions INTEGER,
    totalComplexity INTEGER,
    averageComplexity INTEGER,
    FOREIGN KEY (report_id) REFERENCES reports(id)
);
`;

export const FUNCTION_TABLE = `
CREATE TABLE IF NOT EXISTS functions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    summary_id INTEGER NOT NULL,
    function TEXT NOT NULL,
    line INTEGER,
    functionComplexity INTEGER,
    FOREIGN KEY (report_id) REFERENCES reports(id),
    FOREIGN KEY (summary_id) REFERENCES files(id)
);
`;

export const REPORT_UNIQUE_INDEX = `
CREATE UNIQUE INDEX IF NOT EXISTS reports_project_timestamp_idx
ON reports(project, timestamp);
`;
