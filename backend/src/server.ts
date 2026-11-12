import express, { type Request, type Response } from "express";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// 1. Route Client
app.get("/api/client/hello", (req: Request, res: Response) => {
  res.json({ message: "Hello Client 🥕" });
});

// 2. Route Producteur
app.get("/api/farmer/hello", (req: Request, res: Response) => {
  res.json({ message: "Hello Producteur 🚜" });
});

// 3. Route Admin
app.get("/api/admin/hello", (req: Request, res: Response) => {
  res.json({ message: "Hello Admin 🛡️" });
});

app.listen(PORT, () => {
  console.log(`API sans auth démarrée sur http://localhost:${PORT}`);
});
