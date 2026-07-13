// Production boot: apply schema, ensure seed data, then start the server.
// Uses `prisma db push` so the app deploys cleanly on Railway without
// requiring a checked-in migration history.
import 'dotenv/config';
import { execSync } from 'node:child_process';

function run(cmd) {
  console.log(`[boot] $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

try {
  run('npx prisma db push --skip-generate --accept-data-loss');
} catch (err) {
  console.error('[boot] prisma db push failed:', err.message);
  process.exit(1);
}

try {
  const { seed } = await import('./seed.js');
  await seed();
} catch (err) {
  console.error('[boot] seed failed (continuing):', err.message);
}

await import('../index.js');
