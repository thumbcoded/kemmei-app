const mongoose = require("mongoose");

const CardSchema = new mongoose.Schema({
  _id: String,

  cert_id: {
    type: [String],
    required: true
  },

  domain_id: {
    type: String,
    required: true
  },

  domain_title: {
    type: String,
    required: true
  },

  subdomain_id: {
    type: String,
    required: true
  },

  difficulty: {
    type: String,
    enum: ["easy", "medium", "hard"],
    required: true
  },

  question_type: {
    type: String,
    enum: ["multiple_choice", "select_multiple", "select_all", "pbq"],
    required: true
  },

  question_text: {
    type: String,
    required: true
  },

  answer_options: {
    type: [String],
    required: true,
    validate: v => Array.isArray(v) && v.length >= 2
  },

  correct_answer: {
    type: [String],
    required: true,
    validate: v => Array.isArray(v) && v.length >= 1
  },

  explanation: String,

  tags: {
    type: [String],
    default: []
  },

  status: {
    type: String,
    default: "approved"
  },

  image: {
    type: String,
    default: null
  },

  media: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  requiredCount: {
    type: Number,
    default: null
  }
});

module.exports = mongoose.model("Card", CardSchema);
