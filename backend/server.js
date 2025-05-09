const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect("mongodb://localhost:27017/kemmei")
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

const Card = require("./models/card");
const domainMapPath = path.join(__dirname, "..", "js", "domainmap.json");

// Test route
app.get("/", (req, res) => {
  res.send("Kemmei backend is up and running! 🚀");
});

// ==============================
// CARD ROUTES
// ==============================

app.get("/api/cards", async (req, res) => {
  try {
    const { cert_id, domain_id, difficulty } = req.query;
    const filter = {};
    if (cert_id) filter.cert_id = { $in: [cert_id] };
    if (domain_id) filter.domain_id = domain_id;
    if (difficulty) filter.difficulty = difficulty.toLowerCase();

    const cards = await Card.find(filter).limit(50);
    res.json(cards);
  } catch (err) {
    console.error("❌ Error fetching cards:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/cards/ids", async (req, res) => {
  try {
    const ids = await Card.find({}, "_id").sort({ _id: 1 }).lean();
    res.json(ids.map(c => c._id));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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

app.post("/api/cards", async (req, res) => {
  try {
    const newCard = new Card(req.body);
    await newCard.save();
    res.json({ success: true, card: newCard });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete("/api/cards/:id", async (req, res) => {
  try {
    const deleted = await Card.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Card not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================
// DOMAINMAP ROUTES
// ==============================

app.post("/api/add-title", (req, res) => {
  const { _id, title } = req.body;
  if (!_id || !title) return res.status(400).json({ error: "Missing _id or title" });

  try {
    const data = JSON.parse(fs.readFileSync(domainMapPath, "utf8"));

    if (data.certNames[_id]) return res.status(409).json({ error: "Title already exists" });

    data.certNames[_id] = title;

    fs.writeFileSync(domainMapPath, JSON.stringify(data, null, 2));
    res.status(201).json({ success: true });
  } catch (err) {
    console.error("❌ Failed to update certNames:", err);
    res.status(500).json({ error: "Failed to update certNames" });
  }
});

app.post("/api/add-domain", (req, res) => {
  const { cert_id, domain_id, domain_title } = req.body;
  if (!cert_id || !domain_id || !domain_title) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const data = JSON.parse(fs.readFileSync(domainMapPath, "utf8"));

    if (!data.domainMaps[cert_id]) {
      data.domainMaps[cert_id] = {};
    }

    data.domainMaps[cert_id][domain_id] = domain_title;

    fs.writeFileSync(domainMapPath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to update domain:", err);
    res.status(500).json({ error: "Failed to update domain" });
  }
});

app.post("/api/add-subdomain", (req, res) => {
  const { cert_id, domain_id, sub_id, sub_title } = req.body;
  if (!cert_id || !domain_id || !sub_id || !sub_title) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const data = JSON.parse(fs.readFileSync(domainMapPath, "utf8"));

    if (!data.subdomainMaps[cert_id]) {
      data.subdomainMaps[cert_id] = {};
    }

    if (!data.subdomainMaps[cert_id][domain_id]) {
      data.subdomainMaps[cert_id][domain_id] = {};
    }

    data.subdomainMaps[cert_id][domain_id][sub_id] = sub_title;

    fs.writeFileSync(domainMapPath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to update subdomain:", err);
    res.status(500).json({ error: "Failed to update subdomain" });
  }
});

app.get("/api/domainmap", (req, res) => {
  try {
    const raw = fs.readFileSync(domainMapPath, "utf8");
    const json = JSON.parse(raw);
    res.json(json);
  } catch (err) {
    console.error("❌ Failed to load domainmap.json:", err);
    res.status(500).json({ error: "Failed to load domain map" });
  }
});

app.listen(PORT, () => {
  console.log(`🧠 Kemmei API is listening at http://localhost:${PORT}`);
});
