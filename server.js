const express = require('express');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const config = require('./config.json');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = config.MONGO_URI;
const GEMINI_API_KEY = config.GEMINI_API_KEY;
const DB_NAME = 'technologia_gpt';
const COLLECTION_NAME = 'conversations';

let db;

// Connect to MongoDB
async function connectToMongo() {
  try {
    const client = await MongoClient.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Build the prompt based on subject
function buildPrompt(question, subject, isMath) {
  const identityQs = ['who are you', 'who made you', 'what are you', 'your creator', 'your identity'];
  if (identityQs.some(q => question.toLowerCase().includes(q))) {
    return `Reply to this question in a friendly, unique and slightly varied format each time. Make it clear you are an AI assistant named Technologia GPT, created by Ayaan and Omkar of class 11 A. Vary the wording or sentence style to keep it engaging.\n\nQuestion: "${question}"`;
  }

  if (isMath) {
    return `Generate a concise topic title (3-5 words) summarizing the answer content, followed by '===TITLE===', then provide a detailed step-by-step explanation in LaTeX where required like equation for the given question equation.

Question: "${question}"

In the answer, adhere to the following Latex Guidelines 
- All latex guidelines provided by Google like for square root, function, integration etc provided in equation 
- Also mandatory use of arrows in next step to show answer clearly
- At the end, enclose the final answer in \boxed{} using $$...$$ for rendering

Final Answer: $$\\boxed{2\\sqrt{2}}$$`;
  } else {
    return `Generate a concise topic title (3-5 words) summarizing the answer content, followed by '===TITLE===', then provide a detailed step-by-step explanation for the question.

Question: "${question}"`;
  }
}

// Parse the raw response from Gemini
function parseGeminiResponse(raw, question) {
  const separator = '===TITLE===';
  const parts = raw.split(separator);
  let title, answer;
  if (parts.length >= 2) {
    title = parts[0].trim();
    answer = parts.slice(1).join(separator).trim();
  } else {
    answer = raw.trim();
    title = question.split(' ').slice(0, 4).join(' ');
  }
  if (!title) title = 'General Query';
  return { answer, title };
}

// POST /api/solve
app.post('/api/solve', async (req, res) => {
  const { question, topicId, subject } = req.body;
  if (!question) return res.status(400).json({ error: 'Question is required.' });

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration: missing API key.' });
  }

  try {
    const isMath = subject === 'Maths' || /[0-9+\-*/^√π]/.test(question);
    const prompt = buildPrompt(question, subject, isMath);

    const apiRes = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, candidateCount: 1 },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GEMINI_API_KEY,
        },
      }
    );

    const rawText = apiRes.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const { answer, title } = parseGeminiResponse(rawText, question);
    const finalTopicId = topicId || title;

    await db.collection(COLLECTION_NAME).insertOne({
      question,
      answer,
      title,
      topicId: finalTopicId,
      pinned: false,
      timestamp: new Date(),
    });

    res.json({ answer, topicId: finalTopicId });
  } catch (err) {
    console.error('Gemini Error:', err.response?.data || err.message);
    const msg = err.response?.data?.error?.message 
      || 'Gemini API call failed. Check your API key and model availability.';
    res.status(500).json({ error: msg });
  }
});

// GET /api/history
app.get('/api/history', async (_, res) => {
  try {
    const messages = await db.collection(COLLECTION_NAME)
      .find()
      .sort({ pinned: -1, timestamp: 1 })
      .toArray();
    const grouped = {};
    messages.forEach(m => {
      const key = m.topicId || m.title || 'Untitled';
      if (!grouped[key]) grouped[key] = { messages: [], pinned: m.pinned };
      grouped[key].messages.push(m);
      grouped[key].pinned = grouped[key].pinned || m.pinned;
    });
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history.' });
  }
});

// DELETE /api/topic/:topicId
app.delete('/api/topic/:topicId', async (req, res) => {
  const { topicId } = req.params;
  try {
    const result = await db.collection(COLLECTION_NAME).deleteMany({ topicId });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete topic.' });
  }
});

// PATCH /api/topic/:topicId/rename
app.patch('/api/topic/:topicId/rename', async (req, res) => {
  const { topicId } = req.params;
  const { newTitle } = req.body;
  if (!newTitle || !newTitle.trim()) {
    return res.status(400).json({ error: 'New title is required and must not be empty.' });
  }
  try {
    const existing = await db.collection(COLLECTION_NAME).findOne({ topicId: newTitle });
    if (existing && existing.topicId !== topicId) {
      return res.status(400).json({ error: 'Topic title already exists.' });
    }
    const result = await db.collection(COLLECTION_NAME).updateMany(
      { topicId },
      { $set: { topicId: newTitle.trim(), title: newTitle.trim() } }
    );
    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'No messages found for this topic.' });
    }
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error('Rename Error:', err);
    res.status(500).json({ error: 'Failed to rename topic.' });
  }
});

// PATCH /api/topic/:topicId/pin
app.patch('/api/topic/:topicId/pin', async (req, res) => {
  const { topicId } = req.params;
  const { pinned } = req.body;
  try {
    const result = await db.collection(COLLECTION_NAME).updateMany(
      { topicId },
      { $set: { pinned } }
    );
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update pin status.' });
  }
});

// Start server
(async () => {
  await connectToMongo();
  app.listen(PORT, () =>
    console.log(`🚀 Server running at http://localhost:${PORT}`)
  );
})();
