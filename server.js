const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Speech service running" });
});

app.post("/api/transcription", (req, res) => {
  const { transcript, isFinal, lang, timestamp } = req.body;
  console.log("\n─────────────────────────────────────");
  console.log(`🕐 Time      : ${timestamp}`);
  console.log(`🌐 Language  : ${lang}`);
  console.log(`📝 Transcript: ${transcript}`);
  console.log(`✅ Is Final  : ${isFinal}`);
  console.log("─────────────────────────────────────");
  res.json({ success: true, received: transcript });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("\n✅ Server running at http://localhost:" + PORT);
  console.log("📡 Now run in a NEW terminal: ngrok http " + PORT);
  console.log("🌍 Then open the ngrok URL in Chrome or Edge\n");
});