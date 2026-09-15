const { createClient } = require('@libsql/client');

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error(
    '❌ TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN are not set. Add them to your .env file.'
  );
  process.exit(1);
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function init() {
  await db.execute(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task TEXT NOT NULL,
    timestamp TEXT NOT NULL
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    reminder_time TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`);

  console.log('Connected to Turso and verified schema.');
}

init().catch((err) => {
  console.error('Error initializing Turso database:', err.message);
  process.exit(1);
});

module.exports = db;
