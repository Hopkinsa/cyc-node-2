import { once } from 'node:events';
import { createServer } from 'node:http';

import { app } from './app.ts';
import DBService from './services/db.service.ts';

const start = async (): Promise<void> => {
  await DBService.connectToDatabase();

  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The desktop report server did not expose a TCP port.');
  }

  process.send?.({ port: address.port });

  const shutdown = (): void => {
    server.close(() => process.exit(0));
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
};

start().catch((error: unknown) => {
  console.error('Unable to start the desktop report server.', error);
  process.exit(1);
});