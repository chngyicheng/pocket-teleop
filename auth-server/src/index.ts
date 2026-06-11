import { createApp } from './app.js';
import { initCredentials, enforceDefaultCredentialChange } from './credentials.js';
import { makeWsUpgradeHandler } from './proxy.js';

const adminUser     = process.env['TELEOP_ADMIN_USER'];
const adminPassword = process.env['TELEOP_ADMIN_PASSWORD'];
const sessionSecret = process.env['SESSION_SECRET'];

if (!adminUser || !adminPassword || !sessionSecret) {
  console.error(
    'Error: TELEOP_ADMIN_USER, TELEOP_ADMIN_PASSWORD, and SESSION_SECRET must be set'
  );
  process.exit(1);
}

const CRED_PATH     = '/data/credentials.json';
const SESSIONS_PATH = '/data/sessions';
const PORT          = parseInt(process.env['PORT'] ?? '3000', 10);
const BIND_HOST     = process.env['BIND_HOST'] ?? '0.0.0.0';
const TELEOP_URL    = process.env['TELEOP_SERVER_URL'] ?? 'http://localhost:9091';

await initCredentials(adminUser, adminPassword, CRED_PATH);
await enforceDefaultCredentialChange(adminPassword, CRED_PATH);

const app = createApp({
  credPath:      CRED_PATH,
  sessionsPath:  SESSIONS_PATH,
  sessionSecret,
});

const server = app.listen(PORT, BIND_HOST, () => {
  console.log(`auth-server listening on ${BIND_HOST}:${PORT}`);
});

server.on('upgrade', makeWsUpgradeHandler(TELEOP_URL, app.get('sessionMiddleware')));
