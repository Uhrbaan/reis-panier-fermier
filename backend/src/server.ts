import express, { type Request, type Response } from "express";
import cors from "cors";
import Database from "better-sqlite3";

const app = express();
const PORT = 3000;

// Connect to SQLite database
const db = new Database("guestbook.db");

app.use(cors());
app.use(express.json());

// Initialize table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

interface GuestbookEntry {
  id: number;
  name: string;
  message: string;
  created_at: string;
}

// 1. GET /api/entries - Fetch all guestbook messages (newest first)
app.get("/api/entries", (req: Request, res: Response) => {
  const stmt = db.prepare("SELECT * FROM entries ORDER BY id DESC");
  const entries: GuestbookEntry[] = stmt.all() as GuestbookEntry[];
  res.json(entries);
});

// 2. POST /api/entries - Submit a new guestbook entry
app.post("/api/entries", (req: Request, res: Response) => {
  const { name, message } = req.body;

  if (!name || !message) {
    return res.status(400).json({ error: "Name and message are required." });
  }

  const stmt = db.prepare("INSERT INTO entries (name, message) VALUES (?, ?)");
  const result = stmt.run(name, message);

  // Return the newly created entry
  const newEntry = db
    .prepare("SELECT * FROM entries WHERE id = ?")
    .get(result.lastInsertRowid);
  res.status(201).json(newEntry);
});

app.listen(PORT, () => {
  console.log(`Guestbook API running on http://localhost:${PORT}`);
});
