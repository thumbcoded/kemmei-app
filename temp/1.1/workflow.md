KEMMEI FLASHCARD GENERATION WORKFLOW (PER SUBDOMAIN) – MINIMAL FILE SET

🗂 REQUIRED FILES TO UPLOAD EACH SESSION:
- transcript.txt       → Raw source material for card creation
- covmap.json          → Concept definitions + terms
- bulk-template.txt    → Reference card schema (if needed)

----

1. SELECT SUBDOMAIN
   1.1. Provide:
        - cert_id (e.g. "220-1201")
        - domain_id (e.g. "1.0")
        - subdomain_id (e.g. "1.1")
   1.2. Upload `transcript.txt` for this subdomain

2. DEFINE CONCEPTS (IF MISSING)
   2.1. Ask ChatGPT to extract concepts from transcript
   2.2. Define each concept’s "terms" that should match in question text/tags
   2.3. Insert concepts into `covmap.json` under correct subdomain

3. GENERATE FLASHCARDS
IMPORTANT NOTE - WHEN GENERATING CARDS, ALWAYS POST AS A SINGLE CODE SNIPPET
   3.1. Start with EASY cards (1–3 per concept)
   3.2. Continue with MEDIUM and HARD based on concept depth
   3.3. Prioritize actual coverage over target ratios

4. TAGGING FOR COVERAGE
   4.1. Each card must include at least one tag that matches a concept term from `covmap.json`
   4.2. This ensures Concur matches the card to a concept, even if the question is paraphrased

5. VALID CARD STRUCTURE
   5.1. Use `bulk-template.txt` as reference, or ask ChatGPT to output cards in correct format
   5.2. Do not include `_id` — backend auto-generates it on import
   5.3. Ensure fields:
        - cert_id (array)
        - domain_id, subdomain_id
        - difficulty
        - question_type
        - question_text
        - answer_options (usually 4, but up to 6–8 allowed if justified)
        - correct_answer (array)
        - tags (include concept terms)
        - status: "approved"
   5.4. For `select_multiple`, always specify "Select two/three..." in the question text
   5.5. For select_all, only use if all correct answers apply. Always include (Select all that apply) in the question text. Larger option sets (up to 6–8) are fine if the intent is clear.

6. SUBMIT & VERIFY
   6.1. Paste the batch into admin panel → "Import Many"
   6.2. Backend will validate and assign IDs
   6.3. Confirm in Concur that cards matched expected concepts
