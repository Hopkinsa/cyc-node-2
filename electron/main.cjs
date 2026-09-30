const { fork } = require('node:child_process');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

let reportServer;
let reportServerPort;

const startReportServer = async () => {
  if (reportServerPort !== undefined) {
    return reportServerPort;
  }

  const serverPath = path.resolve(__dirname, '../app/electron-server.ts');
  const nodePath = process.env.npm_node_execpath || 'node';

  reportServer = fork(serverPath, [], {
    cwd: process.cwd(),
    execPath: nodePath,
    execArgv: ['--loader', 'ts-node/esm'],
  });

  return new Promise((resolve, reject) => {
    const handleMessage = (message) => {
      if (message && typeof message.port === 'number') {
        reportServerPort = message.port;
        cleanup();
        resolve(reportServerPort);
      }
    };
    const handleError = (error) => {
      cleanup();
      reject(error);
    };
    const handleExit = (code) => {
      cleanup();
      reject(new Error(`The desktop report server exited before startup (code ${code}).`));
    };
    const cleanup = () => {
      reportServer?.off('message', handleMessage);
      reportServer?.off('error', handleError);
      reportServer?.off('exit', handleExit);
    };

    reportServer.on('message', handleMessage);
    reportServer.once('error', handleError);
    reportServer.once('exit', handleExit);
  });
};

const createWindow = async () => {
  const port = await startReportServer();
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 650,
  });

  await window.loadURL(`http://127.0.0.1:${port}/dashboard`);
};

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
}).catch((error) => {
  console.error('Unable to start the CYC Node desktop application.', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  reportServer?.kill();
});