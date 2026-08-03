export const GITLOG_TABLE = `
CREATE TABLE IF NOT EXISTS gitlog (
    id TEXT PRIMARY KEY,
    labels TEXT NOT NULL,
    datetime INTEGER NOT NULL
);
`;

export const EXTRACTION_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS extraction_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;

export const REPORT_TABLE = `
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    report TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        fileCount INTEGER NOT NULL DEFAULT 0,
        totalComplexity REAL NOT NULL DEFAULT 0,
        averageComplexity REAL NOT NULL DEFAULT 0
);
`;

export const REPORT_STATS_MIGRATIONS = [
    'ALTER TABLE reports ADD COLUMN fileCount INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE reports ADD COLUMN totalComplexity REAL NOT NULL DEFAULT 0',
    'ALTER TABLE reports ADD COLUMN averageComplexity REAL NOT NULL DEFAULT 0',
];

export const BACKFILL_REPORT_STATS = `
UPDATE reports
SET fileCount = (
            SELECT COUNT(*) FROM files WHERE files.report_id = reports.id
        ),
        totalComplexity = (
            SELECT COALESCE(SUM(files.fileComplexity), 0)
            FROM files WHERE files.report_id = reports.id
        ),
        averageComplexity = CASE
            WHEN (
                SELECT COUNT(*) FROM files WHERE files.report_id = reports.id
            ) > 0 THEN (
                SELECT COALESCE(SUM(files.fileComplexity), 0)
                FROM files WHERE files.report_id = reports.id
            ) * 1.0 / (
                SELECT COUNT(*) FROM files WHERE files.report_id = reports.id
            )
            ELSE 0
        END;
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
