const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Username
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: "student" },
  progress: { type: Map, of: [mongoose.Schema.Types.Mixed], default: {} },
  testCompletions: { type: Map, of: [mongoose.Schema.Types.Mixed], default: {} },
  unlocks: { type: Map, of: Boolean, default: {} } // New field for unlock preferences
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
