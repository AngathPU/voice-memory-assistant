require('dotenv').config();
const sound = require('sound-play');
const path = require('path');
const express = require('express');
const cors = require('cors');
const chrono = require('chrono-node');
const multer = require('multer');
const fs = require('fs');
const cron = require('node-cron');
const notifier = require('node-notifier');
const db = require('./Database');
const { OpenAI } = require('openai');

// Fail fast if the API key isn't configured — never fall back to a hardcoded key
if (!process.env.GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY is not set. Add it to your .env file.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: 'uploads/' });

// Initialize OpenAI SDK routed to Groq's servers
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// POST /transcribe - Process audio with Groq's Whisper
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file received" });
  }

  console.log("🎙️ Audio file received:", req.file.originalname);

  const tempFilePath = req.file.path;
  const ext = path.extname(req.file.originalname) || '.m4a';
  const validFilePath = tempFilePath + ext;

  try {
    fs.renameSync(tempFilePath, validFilePath);

    // Check if recording is empty or too short (< 1KB)
    const stats = fs.statSync(validFilePath);
    if (stats.size < 1000) {
      if (fs.existsSync(validFilePath)) fs.unlinkSync(validFilePath);
      return res.status(400).json({ error: "Audio file is too short or empty." });
    }

    console.log(" Sending to Groq Whisper...");

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(validFilePath),
      model: 'whisper-large-v3',
    });

    console.log("🧠 AI Transcription Success:", transcription.text);

    // Cleanup valid temp file
    if (fs.existsSync(validFilePath)) fs.unlinkSync(validFilePath);

    res.json({ transcript: transcription.text });

  } catch (error) {
    console.error("Groq/OpenAI Error:", error);

    // Fallback cleanup
    if (fs.existsSync(validFilePath)) fs.unlinkSync(validFilePath);
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    res.status(500).json({ error: "Transcription failed" });
  }
});

// GET /tasks - Fetch tasks AND their linked reminders
app.get('/tasks', (req, res) => {
  const sql = `
    SELECT tasks.id, tasks.task, tasks.timestamp, reminders.reminder_time 
    FROM tasks 
    LEFT JOIN reminders ON tasks.id = reminders.task_id 
    ORDER BY tasks.id DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST /tasks - Save a new task and extract dates
app.post('/tasks', (req, res) => {
  const { task, timestamp } = req.body;
  if (!task || !timestamp) return res.status(400).json({ error: 'Task and timestamp are required' });

  const parsedDate = chrono.parseDate(task);
  const insertTaskSql = 'INSERT INTO tasks (task, timestamp) VALUES (?, ?)';

  db.run(insertTaskSql, [task, timestamp], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const taskId = this.lastID;

    if (parsedDate) {
      const reminderTime = parsedDate.toISOString();
      const insertReminderSql = 'INSERT INTO reminders (task_id, reminder_time) VALUES (?, ?)';
      db.run(insertReminderSql, [taskId, reminderTime], function(remErr) {
        if (remErr) console.error("Reminder DB Error:", remErr);
        return res.status(201).json({ id: taskId, task, timestamp, reminder: reminderTime });
      });
    } else {
      return res.status(201).json({ id: taskId, task, timestamp });
    }
  });
});

// --- SCHEDULER ---
cron.schedule('* * * * *', () => {
  const now = new Date().toISOString();

  const sql = `
    SELECT reminders.id as reminder_id, tasks.task, reminders.reminder_time 
    FROM reminders 
    JOIN tasks ON reminders.task_id = tasks.id 
    WHERE reminders.status = 'pending' AND reminders.reminder_time <= ?
  `;

  db.all(sql, [now], (err, rows) => {
    if (err) {
      console.error("Scheduler DB Error:", err.message);
      return;
    }

    if (rows && rows.length > 0) {
      rows.forEach(row => {
        console.log(`\n🔔 REMINDER DUE: "${row.task}"! (Scheduled for ${row.reminder_time})\n`);

        // 1. Show desktop notification
        notifier.notify({
          title: '⏰ Voice Memory Reminder',
          message: row.task,
          sound: false,
          wait: false
        });

        // 2. Play MP3 if file exists
        const audioPath = path.join(__dirname, 'alert.mp3');
        if (fs.existsSync(audioPath)) {
          sound.play(audioPath).catch(err => console.error("Audio playback error:", err));
        }

        // Mark as completed
        db.run(`UPDATE reminders SET status = 'completed' WHERE id = ?`, [row.reminder_id]);
      });
    }
  });
});

// Bind to 0.0.0.0 to accept network requests from physical mobile devices
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running on http://0.0.0.0:${PORT} (Accessible on your local network)`);
});