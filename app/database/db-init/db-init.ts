import Database from 'better-sqlite3';

import { log } from '../../utility/logger.ts';
import {
  FILE_TABLE,
  FUNCTION_TABLE,
  GITLOG_TABLE,
  REPORT_TABLE,
  REPORT_UNIQUE_INDEX,
} from './sql-init.ts';

const DEBUG = 'db-init | ';

export async function createDatabase(pathToDB: string): Promise<void> {
  const db = new Database(pathToDB);

  db.prepare(GITLOG_TABLE).run();
  log.info_lv3(`${DEBUG}Gitlog table created successfully`);

  db.prepare(REPORT_TABLE).run();
  log.info_lv3(`${DEBUG}Reports table created successfully`);

  db.prepare(FILE_TABLE).run();
  log.info_lv3(`${DEBUG}Files table created successfully`);

  db.prepare(FUNCTION_TABLE).run();
  log.info_lv3(`${DEBUG}Functions table created successfully`);

  db.prepare(REPORT_UNIQUE_INDEX).run();
  log.info_lv3(`${DEBUG}Reports unique index created successfully`);

  db.close();
}
