function checkCardCoverage(card, topicTerms) {
  const text = (card.question_text + " " + (card.tags || []).join(" ")).toLowerCase();
  return topicTerms.some(term => {
    return term.split(" ").every(word => text.includes(word));
  });
}

export function analyzeCoverage(cards, covmapSub) {
  const report = {
    conceptCoverage: {},
    difficultyBreakdown: {
      easy: 0,
      medium: 0,
      hard: 0
    },
    matchedCards: {},
    unmatchedCards: []
  };

  const concepts = covmapSub.concepts || {};

  // Initialize concept buckets
  for (const [conceptName, { terms }] of Object.entries(concepts)) {
    report.conceptCoverage[conceptName] = {
      hitCount: 0,
      cardIds: []
    };
  }

  for (const card of cards) {
    const text = (card.question_text + " " + (card.tags || []).join(" ")).toLowerCase();
    const difficulty = card.difficulty.toLowerCase();

    if (report.difficultyBreakdown[difficulty] !== undefined) {
      report.difficultyBreakdown[difficulty]++;
    }

    let matchedAnyConcept = false;

    for (const [conceptName, { terms }] of Object.entries(concepts)) {
      for (const term of terms) {
        const tokens = term.toLowerCase().split(" ");
        const matches = tokens.every(token => text.includes(token));

        if (matches) {
          matchedAnyConcept = true;

          if (!report.conceptCoverage[conceptName].cardIds.includes(card._id)) {
            report.conceptCoverage[conceptName].cardIds.push(card._id);
            report.conceptCoverage[conceptName].hitCount++;
          }

          if (!report.matchedCards[card._id]) {
            report.matchedCards[card._id] = [];
          }
          if (!report.matchedCards[card._id].includes(conceptName)) {
            report.matchedCards[card._id].push(conceptName);
          }
        }
      }
    }

    if (!matchedAnyConcept) {
      report.unmatchedCards.push(card._id);
    }
  }

  return report;
}
