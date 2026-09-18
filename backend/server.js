require('dotenv').config();
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const express = require('express');
const cors = require('cors');
const chrono = require('chrono-node');
const multer = require('multer');
const db = require('./Database');
const { OpenAI } = require('openai');
const authRoutes = require('./authRoutes');
const { requireAuth } = require('./authMiddleware');

if (!process.env.GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY is not set. Add it to your .env file.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- Auth routes (public) ---
app.use('/auth', authRoutes);

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: 'uploads/' });

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// POST /transcribe - now requires auth too (no reason to let anonymous
// callers burn your Groq quota)
app.post('/transcribe', requireAuth, upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file received' });
  }

  console.log('🎙️ Audio file received:', req.file.originalname);

  const tempFilePath = req.file.path;
  const ext = path.extname(req.file.originalname) || '.m4a';
  const validFilePath = tempFilePath + ext;

  try {
    fs.renameSync(tempFilePath, validFilePath);

    const stats = fs.statSync(validFilePath);
    if (stats.size < 1000) {
      if (fs.existsSync(validFilePath)) fs.unlinkSync(validFilePath);
      return res.status(400).json({ error: 'Audio file is too short or empty.' });
    }

    console.log('Sending to Groq Whisper...');

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(validFilePath),
      model: 'whisper-large-v3',
    });

    console.log('🧠 AI Transcription Success:', transcription.text);

    if (fs.existsSync(validFilePath)) fs.unlinkSync(validFilePath);

    res.json({ transcript: transcription.text });
  } catch (error) {
    console.error('Groq/OpenAI Error:', error);
    if (fs.existsSync(validFilePath)) fs.unlinkSync(validFilePath);
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    res.status(500).json({ error: 'Transcription failed' });
  }
});

// GET /tasks - now requires auth, only returns the current user's tasks
app.get('/tasks', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `
        SELECT tasks.id, tasks.task, tasks.timestamp, reminders.reminder_time
        FROM tasks
        LEFT JOIN reminders ON tasks.id = reminders.task_id
        WHERE tasks.user_id = ?
        ORDER BY tasks.id DESC
      `,
      args: [req.userId],
    });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tasks - now requires auth, attributes the new task to the current user
app.post('/tasks', requireAuth, async (req, res) => {
  const { task, timestamp } = req.body;
  if (!task || !timestamp) {
    return res.status(400).json({ error: 'Task and timestamp are required' });
  }

  try {
    const parsedDate = chrono.parseDate(task);
    const insertResult = await db.execute({
      sql: 'INSERT INTO tasks (task, timestamp, user_id) VALUES (?, ?, ?)',
      args: [task, timestamp, req.userId],
    });
    const taskId = Number(insertResult.lastInsertRowid);

    if (parsedDate) {
      const reminderTime = parsedDate.toISOString();
      try {
        await db.execute({
          sql: 'INSERT INTO reminders (task_id, reminder_time) VALUES (?, ?)',
          args: [taskId, reminderTime],
        });
      } catch (remErr) {
        console.error('Reminder DB Error:', remErr.message);
      }
      return res.status(201).json({ id: taskId, task, timestamp, reminder: reminderTime });
    }

    res.status(201).json({ id: taskId, task, timestamp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reminders/due - now requires auth, only returns the current user's due reminders
app.get('/reminders/due', requireAuth, async (req, res) => {
  const now = new Date().toISOString();
  try {
    const result = await db.execute({
      sql: `
        SELECT reminders.id as reminder_id, tasks.task, reminders.reminder_time
        FROM reminders
        JOIN tasks ON reminders.task_id = tasks.id
        WHERE reminders.status = 'pending'
          AND reminders.reminder_time <= ?
          AND tasks.user_id = ?
      `,
      args: [now, req.userId],
    });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /reminders/:id/complete - requires auth, only lets you complete YOUR OWN reminder
app.post('/reminders/:id/complete', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `
        UPDATE reminders SET status = 'completed'
        WHERE id = ?
          AND task_id IN (SELECT id FROM tasks WHERE user_id = ?)
      `,
      args: [req.params.id, req.userId],
    });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Server startup ---
const certDir = path.join(__dirname, 'certs');
const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on https://0.0.0.0:${PORT} (self-signed cert)`);
  });
} else {
  http.createServer(app).listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on http://0.0.0.0:${PORT} (no local cert found)`);
  });
}
