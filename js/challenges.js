// Rank-up challenge ("אתגר מעבר") data. Performed as one continuous sequence.
// `source` matches the exact exercise `name` strings in workouts.js so readiness
// can be predicted from logged workout history.

export const CHALLENGES = [
  {
    id: '2.5',
    name: 'אתגר מעבר 2.5#',
    conditions: [
      'טכניקה נקייה וטווח תנועה מלא',
      'הכול ברצף ללא מנוחה ארוכה',
      'לצלם סרטון ברור ללא קאטים',
      'מומלץ יומיים מנוחה לפני',
    ],
    sequence: [
      // Dragon flag: 3s full hold. No direct metric in the workout, so readiness
      // is inferred from logged negative reps (proxy: >=3).
      { kind: 'hold', label: 'דרגון פלאג מלא', sec: 3, source: 'דרגון פלאג מלא שלילי', requirement: 3 },
      { kind: 'reps', label: 'מתח', count: 14, source: 'מתח רגיל', requirement: 14 },
      { kind: 'reps', label: 'מקבילים', count: 16, source: 'מקבילים', requirement: 16 },
      { kind: 'reps', label: 'שכיבות סמיכה פייק בהגבהה', count: 6, source: 'שכיבות סמיכה פייק בהגבהה', requirement: 6 },
    ],
  },
];

export function getChallenge(id) {
  return CHALLENGES.find((c) => c.id === id) || null;
}

// The challenge after the given id (null if none defined yet).
export function nextChallengeId(id) {
  const i = CHALLENGES.findIndex((c) => c.id === id);
  if (i === -1 || i + 1 >= CHALLENGES.length) return null;
  return CHALLENGES[i + 1].id;
}

// Short requirement text for a sequence item.
export function reqText(item) {
  if (item.kind === 'hold') return `${item.sec} שניות`;
  return `${item.count} חזרות`;
}
