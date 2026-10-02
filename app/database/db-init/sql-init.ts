import { REPORT_VISIBLE_FILES_SQL } from '../report-file-filter.ts';

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

export const REPORT_FUNCTION_STATS_BACKFILL_KEY = 'reports:function-stats-backfill:v1';

export const MARK_REPORT_FUNCTION_STATS_BACKFILL_COMPLETE = `
INSERT INTO extraction_state (key, value)
VALUES (?, 'complete')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
`;

export const REPORT_TABLE = `
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    report TEXT NOT NULL,
        isTemporary INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        fileCount INTEGER NOT NULL DEFAULT 0,
        functionCount INTEGER NOT NULL DEFAULT 0,
        totalComplexity REAL NOT NULL DEFAULT 0,
        averageComplexity REAL NOT NULL DEFAULT 0,
        averageComplexityPerFunction REAL NOT NULL DEFAULT 0
);
`;

export const REPORT_STATS_MIGRATIONS = [
    'ALTER TABLE reports ADD COLUMN isTemporary INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE reports ADD COLUMN fileCount INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE reports ADD COLUMN functionCount INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE reports ADD COLUMN totalComplexity REAL NOT NULL DEFAULT 0',
    'ALTER TABLE reports ADD COLUMN averageComplexity REAL NOT NULL DEFAULT 0',
    'ALTER TABLE reports ADD COLUMN averageComplexityPerFunction REAL NOT NULL DEFAULT 0',
];

export const REPORT_FUNCTION_STATS_BACKFILL = `
UPDATE reports
SET
    functionCount = COALESCE((
        SELECT SUM(totalFunctions)
        FROM files
        WHERE report_id = reports.id AND ${REPORT_VISIBLE_FILES_SQL}
    ), 0),
    averageComplexityPerFunction = CASE
        WHEN COALESCE((
            SELECT SUM(totalFunctions)
            FROM files
            WHERE report_id = reports.id AND ${REPORT_VISIBLE_FILES_SQL}
        ), 0) > 0
        THEN totalComplexity / (
            SELECT SUM(totalFunctions)
            FROM files
            WHERE report_id = reports.id AND ${REPORT_VISIBLE_FILES_SQL}
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
