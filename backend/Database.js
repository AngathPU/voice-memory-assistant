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

async function columnExists(table, column) {
  const result = await db.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

async function init() {
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task TEXT NOT NULL,
    timestamp TEXT NOT NULL
  )`);

  // Add user_id to tasks if this is an existing database from before auth existed.
  // Nullable so old, pre-auth rows don't break — they just won't belong to anyone.
  if (!(await columnExists('tasks', 'user_id'))) {
    await db.execute(`ALTER TABLE tasks ADD COLUMN user_id INTEGER REFERENCES users(id)`);
    console.log('Added user_id column to tasks table.');
  }

  await db.execute(`CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    reminder_time TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`);

  console.log('Connected to Turso and verified schema (including users/auth).');
}

init().catch((err) => {
  console.error('Error initializing Turso database:', err.message);
  process.exit(1);
});

module.exports = db;