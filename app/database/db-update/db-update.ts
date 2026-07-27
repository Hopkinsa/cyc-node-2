import { log } from '../../utility/logger.ts';
import DBService from '../../services/db.service.ts';
import {
  IFiles,
  IFunctions,
  IGitLog,
  IReports,
} from '../../interface/report-data.interface.ts';
import {
  CREATE_GITLOG_DATA,
  CREATE_FILE_DATA,
  CREATE_FUNCTION_DATA,
  CREATE_REPORT_DATA,
  DELETE_FILES_BY_REPORT_ID,
  DELETE_FUNCTIONS_BY_REPORT_ID,
  DELETE_REPORT_BY_ID,
  DELETE_GITLOG_DATA,
  UPDATE_REPORT_DATA,
} from './sql-update.ts';

const DEBUG = 'db-update | ';

class DBUpdate {

  static replaceGitLog = async (data: IGitLog[]): Promise<void> => {
    log.info_lv2(`${DEBUG}replaceGitLog`);

    DBService.db.prepare(DELETE_GITLOG_DATA).run();

    const insert = DBService.db.prepare(CREATE_GITLOG_DATA);
    const transaction = DBService.db.transaction((rows: IGitLog[]) => {
      rows.forEach((row) => {
        insert.run(row.id, JSON.stringify(row.labels), row.datetime);
      });
    });

    transaction(data);
  };

  static updateReports = async (data: IReports): Promise<void> => {
    log.info_lv2(`${DEBUG}updateReports`);
    await DBService.db
      .prepare(UPDATE_REPORT_DATA)
      .run(data.project, data.report, data.timestamp, data.id);
  };

  static createReports = async (data: IReports): Promise<number | bigint> => {
    log.info_lv2(`${DEBUG}createReports`);
    const result = await DBService.db
      .prepare(CREATE_REPORT_DATA)
      .run(data.project, data.report, data.timestamp);

    const priKey = result.lastInsertRowid;

    return priKey;
  };

  static createFiles = async (data: IFiles): Promise<number | bigint> => {
    log.info_lv2(`${DEBUG}createFiles`);
    const result = await DBService.db
      .prepare(CREATE_FILE_DATA)
      .run(
        data.report_id,
        data.filename,
        data.fileComplexity,
        data.totalFunctions,
        data.totalComplexity,
        data.averageComplexity
      );

    const priKey = result.lastInsertRowid;

    return priKey;
  };

  static createFunctions = async (data: IFunctions): Promise<number | bigint> => {
    log.info_lv2(`${DEBUG}createFunctions`);
    const result = await DBService.db
      .prepare(CREATE_FUNCTION_DATA)
      .run(
        data.report_id,
        data.summary_id,
        data.function,
        data.line,
        data.functionComplexity
      );
      const priKey = result.lastInsertRowid;

      return priKey;
  };

  static deleteReportCascade = async (reportId: number | bigint): Promise<void> => {
    log.info_lv2(`${DEBUG}deleteReportCascade - ${reportId}`);

    const transaction = DBService.db.transaction((id: number | bigint) => {
      DBService.db.prepare(DELETE_FUNCTIONS_BY_REPORT_ID).run(id);
      DBService.db.prepare(DELETE_FILES_BY_REPORT_ID).run(id);
      DBService.db.prepare(DELETE_REPORT_BY_ID).run(id);
    });

    transaction(reportId);
  };
}

export default DBUpdate;
