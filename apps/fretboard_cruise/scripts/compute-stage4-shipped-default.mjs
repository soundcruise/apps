/**
 * One-off: emit the saved STAGE4 route that is embedded in script.js.
 */
const slots = [
  { stringName: 6, fret: 8 },
  { stringName: 6, fret: 10 },
  { stringName: 5, fret: 7 },
  { stringName: 5, fret: 8 },
  { stringName: 5, fret: 10 },
  { stringName: 4, fret: 7 },
  { stringName: 4, fret: 9 },
  { stringName: 4, fret: 10 },
  { stringName: 3, fret: 7 },
  { stringName: 3, fret: 9 },
  { stringName: 3, fret: 10 },
  { stringName: 2, fret: 8 },
  { stringName: 2, fret: 10 },
  { stringName: 1, fret: 7 },
  { stringName: 1, fret: 8 },
  { stringName: 1, fret: 10 },
  { stringName: 1, fret: 8 },
  { stringName: 1, fret: 7 },
  { stringName: 2, fret: 10 },
  { stringName: 2, fret: 8 },
  { stringName: 3, fret: 10 },
  { stringName: 3, fret: 9 },
  { stringName: 3, fret: 7 },
  { stringName: 4, fret: 10 },
  { stringName: 4, fret: 9 },
  { stringName: 4, fret: 7 },
  { stringName: 5, fret: 10 },
  { stringName: 5, fret: 8 },
  { stringName: 5, fret: 7 },
  { stringName: 6, fret: 10 },
  { stringName: 6, fret: 8 }
];

const groupBreaks = [0, 7, 14, 16, 23];
const groupScrollLefts = { 0: 306, 1: 306, 2: 306, 3: 306, 4: 306 };

console.log(JSON.stringify({ slotCount: slots.length, slots, groupBreaks, groupScrollLefts }, null, 2));
