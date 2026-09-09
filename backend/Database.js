const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // 1. Create Tasks table
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )`);

    // 2. NEW: Create Reminders table linked to Tasks
    db.run(`CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      reminder_time TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`);
  }
});

module.exports = db;