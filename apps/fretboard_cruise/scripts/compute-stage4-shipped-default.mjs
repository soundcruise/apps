/**
 * One-off: emit the saved STAGE4 route that is embedded in script.js.
 */
const slots = [
  { stringName: 6, fret: 8 },
  { stringName: 6, fret: 10 },
  { stringName: 6, fret: 12 },
  { stringName: 6, fret: 13 },
  { stringName: 5, fret: 10 },
  { stringName: 5, fret: 12 },
  { stringName: 4, fret: 9 },
  { stringName: 4, fret: 10 },
  { stringName: 4, fret: 10 },
  { stringName: 4, fret: 12 },
  { stringName: 3, fret: 9 },
  { stringName: 3, fret: 10 },
  { stringName: 3, fret: 12 },
  { stringName: 2, fret: 10 },
  { stringName: 2, fret: 12 },
  { stringName: 2, fret: 13 },
  { stringName: 2, fret: 13 },
  { stringName: 1, fret: 10 },
  { stringName: 1, fret: 12 },
  { stringName: 1, fret: 13 },
  { stringName: 1, fret: 13 },
  { stringName: 1, fret: 12 },
  { stringName: 1, fret: 10 },
  { stringName: 2, fret: 13 },
  { stringName: 2, fret: 13 },
  { stringName: 2, fret: 12 },
  { stringName: 2, fret: 10 },
  { stringName: 3, fret: 12 },
  { stringName: 3, fret: 10 },
  { stringName: 3, fret: 9 },
  { stringName: 4, fret: 12 },
  { stringName: 4, fret: 10 },
  { stringName: 4, fret: 10 },
  { stringName: 4, fret: 9 },
  { stringName: 5, fret: 12 },
  { stringName: 5, fret: 10 },
  { stringName: 6, fret: 13 },
  { stringName: 6, fret: 12 },
  { stringName: 6, fret: 10 },
  { stringName: 6, fret: 8 }
];

const groupBreaks = [0, 8, 16, 20, 24, 32];

console.log(JSON.stringify({ slotCount: slots.length, slots, groupBreaks }, null, 2));
