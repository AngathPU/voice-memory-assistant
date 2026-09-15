require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const chrono = require('chrono-node');
const multer = require('multer');
const fs = require('fs');
const db = require('./Database');
const { OpenAI } = require('openai');

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

// GET /tasks - Fetch tasks AND their linked reminders
app.get('/tasks', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT tasks.id, tasks.task, tasks.timestamp, reminders.reminder_time
      FROM tasks
      LEFT JOIN reminders ON tasks.id = reminders.task_id
      ORDER BY tasks.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tasks - Save a new task and extract dates
app.post('/tasks', async (req, res) => {
  const { task, timestamp } = req.body;
  if (!task || !timestamp) {
    return res.status(400).json({ error: 'Task and timestamp are required' });
  }

  try {
    const parsedDate = chrono.parseDate(task);
    const insertResult = await db.execute({
      sql: 'INSERT INTO tasks (task, timestamp) VALUES (?, ?)',
      args: [task, timestamp],
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

// GET /reminders/due - Reminders that are pending and due now or earlier.
// The FRONTEND polls this (instead of the server firing desktop notifications/
// audio, which only worked when the backend ran on your own machine).
app.get('/reminders/due', async (req, res) => {
  const now = new Date().toISOString();
  try {
    const result = await db.execute({
      sql: `
        SELECT reminders.id as reminder_id, tasks.task, reminders.reminder_time
        FROM reminders
        JOIN tasks ON reminders.task_id = tasks.id
        WHERE reminders.status = 'pending' AND reminders.reminder_time <= ?
      `,
      args: [now],
    });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /reminders/:id/complete - Mark a reminder as handled once the
// frontend has shown/played the notification for it.
app.post('/reminders/:id/complete', async (req, res) => {
  try {
    await db.execute({
      sql: `UPDATE reminders SET status = 'completed' WHERE id = ?`,
      args: [req.params.id],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running on http://0.0.0.0:${PORT}`);
});
