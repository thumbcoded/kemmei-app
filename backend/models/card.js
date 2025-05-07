const mongoose = require("mongoose");

const CardSchema = new mongoose.Schema({
  _id: String,

  cert_id: {
    type: [String],
    required: true
  },

  domain_id: {
    type: String,
    required: true // E.g. "3.0"
  },

  domain_title: {
    type: String,
    required: true
  },

  subdomain_id: {
    type: String, // E.g. "3.2"
    required: true
  },

  difficulty: {
    type: String,
    enum: ["easy", "medium", "hard"],
    required: true
  },

  question_type: {
    type: String,
    enum: ["multiple_choice", "select_multiple", "select_all"],
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
  }
});

// Optional: Block "All of the above" if question type is not select_all
CardSchema.pre("save", function (next) {
  if (
    this.answer_options.includes("All of the above") &&
    this.question_type !== "select_all"
  ) {
    return next(
      new Error("'All of the above' is only allowed in select_all questions.")
    );
  }
  next();
});

module.exports = mongoose.model("Card", CardSchema);
