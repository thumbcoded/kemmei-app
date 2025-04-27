// cardTemplate.js
// This is a schema reference for all Kemmei flashcards.
// It defines the structure and default fields every card should follow.

export const cardTemplate = {
    id: 0,                            // [number] Unique identifier per card
    topic: "",                        // [string] e.g., "CompTIA A+ Core 1"
    domain: "",                       // [string] e.g., "3.0 Hardware"
    difficulty: "Medium",             // [string] "Easy" | "Medium" | "Hard"
  
    type: "single",                   // [string] "single" or "multi"
    requiredCount: null,             // [number|null] For multi: how many to select (optional)
  
    question: "",                     // [string] Question text
    image: null,                      // [string|null] Path to image (optional)
    explanation: "",                  // [string] Explanation shown after answering
  
    answers: [                        // [array of objects] 2–10 answer options
      { text: "", correct: false }
    ],
  
    tags: [],                         // [array of strings] Optional labels or keywords
    flags: {                          // [object] State flags for internal features
      isBookmarked: false,
      isReported: false
    }
  };
  
  // NOTE: This file is NOT imported into cards.js
  // It exists as a universal reference for all decks and any admin/editor tools.
  