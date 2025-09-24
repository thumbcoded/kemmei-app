// Archived from js/cardTemplate.js — reference frontend template for cards
// Original location: js/cardTemplate.js
// Archived on: 2025-09-24

// archived_cardTemplate: kept for reference only (not exported to app runtime)
const archived_cardTemplate = {
  _id: "",
  cert_id: [],
  domain_id: "",
  domain_title: "",
  subdomain_id: "",
  difficulty: "easy",
  question_type: "multiple_choice",
  question_text: "",
  image: null,
  media: null,
  answer_options: ["Option A", "Option B", "Option C"],
  correct_answer: ["Option B"],
  requiredCount: null,
  explanation: "",
  tags: [],
  status: "approved",
  flags: {
    isBookmarked: false,
    isReported: false,
    isPracticeOnly: false,
    wasAnsweredCorrectly: false
  }
};
// Archived copy of js/cardTemplate.js
// Purpose: reference template for frontend (editor tools, previewers, generators)

export const cardTemplate = {
  _id: "",                       // string — e.g., "Q001"

  // 🧭 Classification
  cert_id: [],                  // array — e.g., ["220-1201"]
  domain_id: "",                // string — e.g., "3.0"
  domain_title: "",             // string — e.g., "Hardware"
  subdomain_id: "",             // string — e.g., "3.2"

  // 🎯 Difficulty & Type
  difficulty: "easy",           // "easy" | "medium" | "hard"
  question_type: "multiple_choice", // "multiple_choice" | "select_multiple" | "select_all" | "pbq"

  // 📝 Question Content
  question_text: "",            // main text
  image: null,                  // string or null — image URL/path
  media: null,                  // optional: for video/audio/PBQ interactive objects
  answer_options: [             // ✅ must be this to match backend
    "Option A", "Option B", "Option C"
  ],
  correct_answer: [             // must match one or more from answer_options
    "Option B"
  ],
  requiredCount: null,          // number or null — only for select_multiple types

  // 🧠 Explanation & Metadata
  explanation: "",              // shown after answer
  tags: [],                     // for filtering (e.g., ["ports", "networking"])
  status: "approved",           // moderation or visibility state

  // 🧩 UI-only flags (not stored in DB)
  flags: {
    isBookmarked: false,
    isReported: false,
    isPracticeOnly: false,
    wasAnsweredCorrectly: false
  }
};

// To restore to runtime copy: move this file to `js/cardTemplate.js` at project root
