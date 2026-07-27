import Database, { Database as DBType } from 'better-sqlite3';

import { log } from '../utility/logger.ts';
import { DATA_PATH } from '../utility/helpers.ts';
import { createDatabase } from '../database/db-init/db-init.ts';
import * as fs from 'fs';

const DEBUG = 'db.service | ';
const pathToDB = `${DATA_PATH}/cyclometric-reports.db`;
class DBService {
  static db: DBType;

  static connectToDatabase = async (): Promise<void> => {
    if (!fs.existsSync(pathToDB)) {
      if (!fs.existsSync(DATA_PATH)) {
        log.info_lv2(`${DEBUG}Database folder does not exist.`);
        fs.mkdirSync(DATA_PATH);
        log.info_lv2(`${DEBUG}Database folder created at '${DATA_PATH}'.`);
      }
      await createDatabase(pathToDB);
      log.info_lv2(`${DEBUG}The database at '${pathToDB}' was created.`);
    }
    await createDatabase(pathToDB);
    this.db = new Database(pathToDB, { fileMustExist: true });
  };
}
export default DBService;
