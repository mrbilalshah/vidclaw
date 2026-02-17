import express from 'express';
import http from 'http';
import { HOST, PORT } from './config.js';
import { setupWebSocket } from './broadcast.js';
import { setupMiddleware } from './middleware.js';
import router from './routes.js';

const app = express();
const server = http.createServer(app);

setupWebSocket(server);
setupMiddleware(app);
app.use(router);

server.listen(PORT, HOST, () => {
  console.log(`Dashboard running at http://${HOST}:${PORT}`);
});
