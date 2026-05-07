/**
 * One-off: emit the saved STAGE4 route that is embedded in script.js.
 * STAGE4 is a copy of STAGE3 in the current numbering.
 */
const slots = [
  { stringName: 5, fret: 3 },
  { stringName: 5, fret: 2 },
  { stringName: 6, fret: 5 },
  { stringName: 6, fret: 3 },
  { stringName: 6, fret: 1 },
  { stringName: 6, fret: 0 },
  { stringName: 6, fret: 0 },
  { stringName: 6, fret: 1 },
  { stringName: 6, fret: 3 },
  { stringName: 6, fret: 5 },
  { stringName: 6, fret: 7 },
  { stringName: 6, fret: 8 },
  { stringName: 6, fret: 8 },
  { stringName: 5, fret: 5 },
  { stringName: 5, fret: 7 },
  { stringName: 5, fret: 8 },
  { stringName: 4, fret: 5 },
  { stringName: 4, fret: 7 },
  { stringName: 3, fret: 4 },
  { stringName: 3, fret: 5 },
  { stringName: 3, fret: 5 },
  { stringName: 3, fret: 7 },
  { stringName: 2, fret: 5 },
  { stringName: 2, fret: 6 },
  { stringName: 2, fret: 8 },
  { stringName: 1, fret: 5 },
  { stringName: 1, fret: 7 },
  { stringName: 1, fret: 8 },
  { stringName: 1, fret: 8 },
  { stringName: 1, fret: 7 },
  { stringName: 1, fret: 5 },
  { stringName: 2, fret: 8 },
  { stringName: 2, fret: 6 },
  { stringName: 2, fret: 5 },
  { stringName: 3, fret: 7 },
  { stringName: 3, fret: 5 },
  { stringName: 3, fret: 5 },
  { stringName: 3, fret: 4 },
  { stringName: 4, fret: 7 },
  { stringName: 4, fret: 5 },
  { stringName: 5, fret: 8 },
  { stringName: 5, fret: 7 },
  { stringName: 5, fret: 5 },
  { stringName: 6, fret: 8 }
];

const groupBreaks = [0, 6, 10, 12, 20, 28, 36];

console.log(JSON.stringify({ slotCount: slots.length, slots, groupBreaks }, null, 2));
