const mongoose = require("mongoose");

const AttemptSchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: ["simple", "test"],
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  score: Number,
  correct: Number,
  total: Number,
  passed: Boolean
}, { _id: false });

const UserSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true // e.g., "test_user"
  },

  email: {
    type: String,
    required: true,
    unique: true
  },

  role: {
    type: String,
    enum: ["student", "admin"],
    default: "student"
  },

  progress: {
    type: Map,
    of: [AttemptSchema], // key = "cert:domain:sub", value = array of attempts
    default: {}
  }
});

module.exports = mongoose.model("User", UserSchema);
