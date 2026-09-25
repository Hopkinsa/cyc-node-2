import Database from 'better-sqlite3';

import { log } from '../../utility/logger.ts';
import {
  FILE_TABLE,
  FUNCTION_TABLE,
  GITLOG_TABLE,
  EXTRACTION_STATE_TABLE,
  REPORT_TABLE,
  REPORT_UNIQUE_INDEX,
  REPORT_STATS_MIGRATIONS,
} from './sql-init.ts';

const DEBUG = 'db-init | ';

export async function createDatabase(pathToDB: string): Promise<void> {
  const db = new Database(pathToDB);

  db.prepare(GITLOG_TABLE).run();
  log.info_lv3(`${DEBUG}Gitlog table opened successfully`);

  db.prepare(EXTRACTION_STATE_TABLE).run();
  log.info_lv3(`${DEBUG}Extraction state table opened successfully`);

  db.prepare(REPORT_TABLE).run();
  log.info_lv3(`${DEBUG}Reports table opened successfully`);

  for (const migration of REPORT_STATS_MIGRATIONS) {
    try {
      db.prepare(migration).run();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('duplicate column name')) {
        throw error;
      }
    }
  }

  db.prepare(FILE_TABLE).run();
  log.info_lv3(`${DEBUG}Files table opened successfully`);

  db.prepare(FUNCTION_TABLE).run();
  log.info_lv3(`${DEBUG}Functions table opened successfully`);

  db.prepare(REPORT_UNIQUE_INDEX).run();
  log.info_lv3(`${DEBUG}Reports unique index opened successfully`);

  db.close();
}
