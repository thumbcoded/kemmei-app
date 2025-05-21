// cardTemplate.js
// Reference template for frontend (editor tools, previewers, generators)

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
