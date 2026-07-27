import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import config from './utility/config.ts';
import { REPORT_ROUTES } from './routes/report.routes.ts';

const REPORTS = config.REPORTS;
const BASE_PATH = config.REPORT_BASE_PATH;

export const app: Express = express();

app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Expose-Headers', 'x-total-count');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type,authorization');
  next();
});

// parse requests of content-type - application/x-www-form-urlencoded
app.use(
  express.urlencoded({
    extended: true,
  })
);

// parse requests of content-type - application/json
app.use(
  express.json({
    inflate: true,
    limit: '100kb',
    strict: true,
    type: 'application/json',
  })
);

app.use(cors());

app.use('/static', express.static('static'));
app.use('/reporting', express.static('reporting'));

app.use(REPORT_ROUTES);
