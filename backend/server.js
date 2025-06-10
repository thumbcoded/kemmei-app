const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const app = express();
const PORT = 3000;

const targetMapPath = path.join(__dirname, "..", "data", "targetmap.json");

app.use(express.static(path.join(__dirname, "..")));

app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect("mongodb://localhost:27017/kemmei")
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

const Card = require("./models/card");
const domainMapPath = path.join(__dirname, "..", "data", "domainmap.json");

const User = require("./models/user");

console.log("📁 domainMapPath resolved to:", domainMapPath);
try {
  fs.accessSync(domainMapPath, fs.constants.R_OK);
  console.log("✅ domainmap.json is readable");
} catch (err) {
  console.error("❌ domainmap.json is missing or unreadable:", err);
  process.exit(1); // crash hard so we know
}

// ==============================
// USER ROUTES
// ==============================

// Create a new user
app.post("/api/users", async (req, res) => {
  try {
    const { _id, email, role } = req.body;
    if (!_id || !email) {
      return res.status(400).json({ error: "Missing _id or email" });
    }

    const user = new User({ _id, email, role: role || "student" });
    await user.save();
    res.status(201).json({ success: true, user });
  } catch (err) {
    console.error("❌ Failed to create user:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fetch user by ID
app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Add test progress for a specific subdomain
app.put("/api/users/:id/progress", async (req, res) => {
  try {
    const { subdomainKey, attempt } = req.body;
    if (!subdomainKey || !attempt) {
      return res.status(400).json({ error: "Missing subdomainKey or attempt" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const attempts = user.progress.get(subdomainKey) || [];
    attempts.push(attempt);
    user.progress.set(subdomainKey, attempts);

    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    console.error("❌ Failed to update progress:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/users/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const existingUser = await User.findById(username);
    if (existingUser) {
      return res.status(400).json({ error: "Username already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ _id: username, email, passwordHash });
    await user.save();

    res.status(201).json({ success: true, message: "User registered successfully." });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Failed to register user." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const user = await User.findById(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    res.json({
      success: true,
      user: {
        _id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed." });
  }
});

// PATCH-based update to user progress (used by flashcards.js)
app.patch("/api/user-progress/:userId", async (req, res) => {
  const { key, correct, viewedOnly } = req.body;
  if (!key) return res.status(400).json({ error: "Missing progress key" });

  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const entry = user.progress.get(key) || { total: 0, correct: 0, viewed: 0, lastSession: null };

    if (viewedOnly) entry.viewed++;
    else {
      entry.total++;
      if (correct) entry.correct++;
    }

    entry.lastSession = new Date();
    user.progress.set(key, entry);
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to update progress:", err);
    res.status(500).json({ error: "Failed to update progress" });
  }
});

app.get("/api/user-progress/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(Object.fromEntries(user.progress.entries()));
  } catch (err) {
    res.status(500).json({ error: "Failed to load progress" });
  }
});

// DELETE user progress for a specific user
app.delete("/api/user-progress/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.progress = new Map(); // Clear all progress
    await user.save();

    res.sendStatus(204); // No content
  } catch (err) {
    console.error("❌ Failed to clear user progress:", err);
    res.status(500).json({ error: "Failed to clear progress" });
  }
});

// ==============================
// TARGETMAP ROUTES
// ==============================

app.put("/api/targetmap", (req, res) => {
  const { key, update } = req.body;
  if (!key || !update) {
    return res.status(400).json({ error: "Missing key or update object" });
  }

  try {
    const data = JSON.parse(fs.readFileSync(targetMapPath, "utf8"));
    data[key] = update;
    fs.writeFileSync(targetMapPath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to update targetmap:", err);
    res.status(500).json({ error: "Failed to update target map" });
  }
});

app.get("/api/targetmap", (req, res) => {
  try {
    const raw = fs.readFileSync(targetMapPath, "utf8");
    const json = JSON.parse(raw);
    res.json(json);
  } catch (err) {
    console.error("❌ Failed to load targetmap.json:", err);
    res.status(500).json({ error: "Failed to load target map" });
  }
});

// Test route
app.get("/", (req, res) => {
  res.send("Kemmei backend is up and running! 🚀");
});

// ==============================
// CARD ROUTES
// ==============================

app.get("/api/cards", async (req, res) => {
  try {
    const { cert_id, domain_id, subdomain_id, difficulty, include_deleted } = req.query;

    const filter = {};

    // Exclude soft-deleted cards unless explicitly included
    if (include_deleted !== "true") {
      filter.status = { $ne: "deleted" };
    }

    if (cert_id) filter.cert_id = { $in: [cert_id] };
    if (domain_id) filter.domain_id = domain_id;
    if (subdomain_id) filter.subdomain_id = subdomain_id;
    if (difficulty) filter.difficulty = difficulty.toLowerCase();

    const cards = await Card.find(filter);

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

function generateCardId(certId, domainId, subId, existingIds) {
  const prefix = `Q-${certId}-${domainId}-${subId}`;
  let counter = 1;

  while (true) {
    const candidate = `${prefix}-${String(counter).padStart(3, "0")}`;
    if (!existingIds.has(candidate)) return candidate;
    counter++;
  }
}

// Inside your POST /api/cards handler
app.post("/api/cards", async (req, res) => {
  try {
    const certId = req.body.cert_id[0];         // e.g., "220-1201"
    const domainId = req.body.domain_id;        // e.g., "2.0"
    const subId = req.body.subdomain_id;        // e.g., "2.1"

    // Load existing card IDs from Mongo
    const existing = await Card.find({}, "_id").lean();
    const usedIds = new Set(existing.map(c => c._id));

    // Generate safe, unique ID
    const uniqueId = generateCardId(certId, domainId, subId, usedIds);
    req.body._id = uniqueId;

    // Save to Mongo
    const newCard = new Card(req.body);
    await newCard.save();
console.log(`🆕 Created card ${newCard._id}`);

    res.json({ success: true, card: newCard });
  } catch (err) {
    console.error("❌ Error saving card:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete("/api/cards/:id", async (req, res) => {
  try {
    const updated = await Card.findByIdAndUpdate(
      
      req.params.id,
      { status: "deleted" },
      { new: true }
    );
console.log(`🗑️ Soft-deleted card ${updated._id}`);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Card not found" });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/cards/:id/permanent", async (req, res) => {
  try {
    const result = await Card.findByIdAndDelete(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, error: "Card not found" });
    }
    console.log(`💀 Permanently deleted card ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Permanent delete failed:", err);
    res.status(500).json({ success: false, error: "Failed to delete permanently" });
  }
});

app.put("/api/cards/:id", async (req, res) => {
  const cardId = req.params.id;
  const updatedCard = req.body;

  try {
    const result = await Card.findByIdAndUpdate(cardId, updatedCard, { new: true });
if (updatedCard.status === "approved") {
  console.log(`♻️ Restored card ${cardId}`);
} else {
  console.log(`✏️ Updated card ${cardId}`);
}

    if (!result) {
      return res.status(404).json({ success: false, error: "Card not found" });
    }

    res.json({ success: true });
    console.log(`✅ PUT completed for card ${cardId}`);

  } catch (err) {
    console.error("❌ Error updating card:", err);
    res.status(500).json({ success: false, error: "Failed to update card" });
  }
});

// 🔁 Sync cards from MongoDB to /data/cards folder
function hashCard(card) {
  return crypto.createHash("sha256").update(JSON.stringify(card)).digest("hex");
}

async function syncCardsToDisk() {
  try {
    const allCards = await Card.find({}).lean();
    const existingPaths = new Set();
    let writeCount = 0;
    let deleteCount = 0;

    for (const card of allCards) {
      const certId = card.cert_id[0];
      const domainId = card.domain_id;
      const subId = card.subdomain_id;
      const cardId = card._id;

      const dirPath = path.join(__dirname, "..", "data", "cards", certId, domainId, subId);
      fs.mkdirSync(dirPath, { recursive: true });

      const filePath = path.join(dirPath, `${cardId}.json`);
      existingPaths.add(filePath);

      const newHash = hashCard(card);
      let existingHash = null;

      if (fs.existsSync(filePath)) {
        try {
          const existing = fs.readFileSync(filePath, "utf8");
          existingHash = hashCard(JSON.parse(existing));
        } catch (err) {
          console.warn("⚠️ Couldn't parse existing file:", filePath);
        }
      }

      if (newHash !== existingHash) {
        fs.writeFileSync(filePath, JSON.stringify(card, null, 2));
        writeCount++;
      }
    }

    // Delete orphaned files
    const rootDir = path.join(__dirname, "..", "data", "cards");
    const walkAndDelete = (dir) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkAndDelete(fullPath);
          if (fs.readdirSync(fullPath).length === 0) {
            fs.rmdirSync(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith(".json") && !existingPaths.has(fullPath)) {
          fs.unlinkSync(fullPath);
          deleteCount++;
        }
      });
    };
    walkAndDelete(rootDir);

    if (writeCount || deleteCount) {
      console.log(`🕒 [Sync] ${writeCount} written, ${deleteCount} deleted.`);
    }
  } catch (err) {
    console.error("❌ [Sync error]:", err.message);
  }
}

// 🌐 Manual trigger route
app.get("/api/sync-cards-to-disk", async (req, res) => {
  try {
    await syncCardsToDisk();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/cards/bulk", async (req, res) => {
  try {
    const cards = req.body;

    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ success: false, error: "No cards provided." });
    }

    const existing = await Card.find({}, "_id").lean();
    const usedIds = new Set(existing.map(c => c._id));

    const newCards = cards.map(card => {
      const certId = card.cert_id[0];
      const domainId = card.domain_id;
      const subId = card.subdomain_id;
      const uniqueId = generateCardId(certId, domainId, subId, usedIds);
      usedIds.add(uniqueId);
      return { ...card, _id: uniqueId };
    });

    await Card.insertMany(newCards);
    console.log(`🚀 Bulk insert: ${newCards.length} cards`);

    res.json({ success: true, inserted: newCards.length });
  } catch (err) {
    console.error("❌ Bulk insert failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// 🕒 Auto sync every 60 seconds
setInterval(syncCardsToDisk, 60 * 1000);



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

app.put("/api/domainmap", (req, res) => {
  const { type, cert_id, domain_id, sub_id, new_title } = req.body;

  if (!type || !cert_id || !new_title) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const data = JSON.parse(fs.readFileSync(domainMapPath, "utf8"));

    if (type === "title") {
      if (!data.certNames[cert_id]) {
        return res.status(404).json({ error: "Title not found." });
      }
      data.certNames[cert_id] = new_title;
    }

    else if (type === "domain") {
      if (!domain_id || !data.domainMaps[cert_id]?.[domain_id]) {
        return res.status(404).json({ error: "Domain not found." });
      }
      data.domainMaps[cert_id][domain_id] = new_title;
    }

    else if (type === "subdomain") {
      if (!domain_id || !sub_id || !data.subdomainMaps[cert_id]?.[domain_id]?.[sub_id]) {
        return res.status(404).json({ error: "Subdomain not found." });
      }
      data.subdomainMaps[cert_id][domain_id][sub_id] = new_title;
    }

    else {
      return res.status(400).json({ error: "Invalid type." });
    }

    fs.writeFileSync(domainMapPath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to rename:", err);
    res.status(500).json({ error: "Failed to update domain map." });
  }
});

app.delete("/api/domainmap", async (req, res) => {
  const { type, cert_id, domain_id, sub_id } = req.body;

  if (!type || !cert_id) return res.status(400).json({ error: "Missing required fields" });

  try {
    const data = JSON.parse(fs.readFileSync(domainMapPath, "utf8"));

    const cards = await Card.find({}).lean();

    if (type === "title") {
      const used = cards.some(c => c.cert_id.includes(cert_id));
      if (used) return res.status(409).json({ error: "Cards still exist under this title." });

      delete data.certNames[cert_id];
      delete data.domainMaps[cert_id];
      delete data.subdomainMaps[cert_id];
    }

    else if (type === "domain") {
      if (!domain_id) return res.status(400).json({ error: "Missing domain_id." });

      const used = cards.some(c => c.cert_id.includes(cert_id) && c.domain_id === domain_id);
      if (used) return res.status(409).json({ error: "Cards still exist under this domain." });

      delete data.domainMaps[cert_id]?.[domain_id];
      delete data.subdomainMaps[cert_id]?.[domain_id];
    }

    else if (type === "subdomain") {
      if (!domain_id || !sub_id) return res.status(400).json({ error: "Missing domain_id or sub_id." });

      const used = cards.some(c => c.cert_id.includes(cert_id) && c.domain_id === sub_id);
      if (used) return res.status(409).json({ error: "Cards still exist under this subdomain." });

      delete data.subdomainMaps[cert_id]?.[domain_id]?.[sub_id];
    }

    else {
      return res.status(400).json({ error: "Invalid type." });
    }

    fs.writeFileSync(domainMapPath, JSON.stringify(data, null, 2));
    res.json({ success: true });

  } catch (err) {
    console.error("❌ Failed to delete from domainmap:", err);
    res.status(500).json({ error: "Failed to update domain map." });
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
