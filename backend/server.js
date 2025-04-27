const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect("mongodb://localhost:27017/kemmei")
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
  });

// Load the Card model
const Card = require("./models/card");

// Test route
app.get("/", (req, res) => {
  res.send("Kemmei backend is up and running! 🚀");
});

// Get all cards
app.get("/api/cards", async (req, res) => {
  try {
    const cards = await Card.find().limit(50);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🔍 Get all card IDs only (for frontend use)
app.get("/api/cards/ids", async (req, res) => {
  try {
    const ids = await Card.find({}, "_id").sort({ _id: 1 }).lean();
    res.json(ids.map(c => c._id));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🆕 Get the next N available card IDs (e.g., ["Q005", "Q006", ...])
app.get("/api/cards/next-ids/:count", async (req, res) => {
  try {
    const count = parseInt(req.params.count, 10) || 1;

    const existing = await Card.find({}, "_id").lean();
    const used = new Set(existing.map(c => parseInt(c._id.replace("Q", ""), 10)));

    const ids = [];
    let next = 1;
    while (ids.length < count) {
      if (!used.has(next)) {
        ids.push("Q" + next.toString().padStart(3, "0"));
      }
      next++;
    }

    res.json(ids);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add a new card
app.post("/api/cards", async (req, res) => {
  try {
    const newCard = new Card(req.body);
    await newCard.save();
    res.json({ success: true, card: newCard });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🧠 Kemmei API is listening at http://localhost:${PORT}`);
});
