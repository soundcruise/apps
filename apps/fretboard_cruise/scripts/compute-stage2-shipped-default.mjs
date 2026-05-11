/**
 * One-off: emit the saved STAGE2 route that is embedded in script.js.
 */
const slots = [
  { stringName: 5, fret: 3 },
  { stringName: 5, fret: 2 },
  { stringName: 5, fret: 0 },
  { stringName: 6, fret: 3 },
  { stringName: 6, fret: 1 },
  { stringName: 6, fret: 0 },
  { stringName: 6, fret: 1 },
  { stringName: 6, fret: 3 },
  { stringName: 6, fret: 5 },
  { stringName: 5, fret: 2 },
  { stringName: 5, fret: 3 },
  { stringName: 5, fret: 5 },
  { stringName: 4, fret: 2 },
  { stringName: 4, fret: 3 },
  { stringName: 4, fret: 5 },
  { stringName: 3, fret: 2 },
  { stringName: 3, fret: 4 },
  { stringName: 3, fret: 5 },
  { stringName: 2, fret: 3 },
  { stringName: 2, fret: 5 },
  { stringName: 2, fret: 6 },
  { stringName: 1, fret: 3 },
  { stringName: 1, fret: 5 },
  { stringName: 1, fret: 3 },
  { stringName: 2, fret: 6 },
  { stringName: 2, fret: 5 },
  { stringName: 2, fret: 3 },
  { stringName: 3, fret: 5 },
  { stringName: 3, fret: 4 },
  { stringName: 3, fret: 2 },
  { stringName: 4, fret: 5 },
  { stringName: 4, fret: 3 },
  { stringName: 4, fret: 2 },
  { stringName: 5, fret: 5 },
  { stringName: 5, fret: 3 }
];

const groupBreaks = [0, 5, 8, 10, 17, 22, 27];
const groupScrollLefts = { 0: 0, 1: 0, 2: 55, 3: 55, 4: 55, 5: 55, 6: 55 };

console.log(JSON.stringify({ slotCount: slots.length, slots, groupBreaks, groupScrollLefts }, null, 2));
