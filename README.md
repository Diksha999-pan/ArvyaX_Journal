#  ArvyaX AI-Assisted Journal System

An AI-powered journal app for ArvyaX nature session users. Users write journal entries after immersive forest/ocean/mountain sessions, and an LLM analyzes their emotional state over time.


## Tech Stack

| Layer    | Technology              |
|----------|------------------------|
| Backend  | Node.js + Express       |
| Database | SQLite (better-sqlite3) |
| Frontend | React + Vite            |
| LLM      | Google Gemini (free tier) with smart fallback |



## Prerequisites

- Node.js v18+
- npm v9+


## Setup & Run

### 1 You can clone/ Download the project
cd arvyax-journal


### 2. Setup Backend


cd backend
npm install
cp .env.example .env


Edit `.env` and add your Gemini API key (free at https://aistudio.google.com/app/apikey):


GEMINI_API_KEY=your_key_here


> **No key?** The app still works — it uses a built-in rule-based emotion analyzer as fallback.

Start the backend:


npm start
# API running at http://localhost:5000


### 3. Setup Frontend


cd ../frontend
npm install
npm run dev
# App running at http://localhost:5173
```

Open http://localhost:5173 in your browser.

---

## API Endpoints

### Create Journal Entry
```
POST /api/journal
Body: { "userId": "123", "ambience": "forest", "text": "I felt calm..." }
```

### Get All Entries
```
GET /api/journal/:userId
```

### Analyze Emotion (LLM)
```
POST /api/journal/analyze
Body: { "text": "I felt calm today...", "entryId": 1 }
Response: { "emotion": "calm", "keywords": [...], "summary": "..." }
```

### Get Insights
```
GET /api/journal/insights/:userId
Response: { "totalEntries": 8, "topEmotion": "calm", "mostUsedAmbience": "forest", ... }
```

### Health Check
GET /api/health



## Project Structure


arvyax-journal/
├── backend/
│   ├── server.js          # Express app entry
│   ├── db.js              # SQLite database setup
│   ├── llmService.js      # Gemini API + fallback analyzer
│   ├── routes/
│   │   └── journal.js     # All journal API routes
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main single-page app
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── README.md
└── ARCHITECTURE.md

