/**
 * One-off: emit the saved STAGE1 route that is embedded in script.js.
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
  { stringName: 5, fret: 0 },
  { stringName: 5, fret: 2 },
  { stringName: 5, fret: 3 },
  { stringName: 4, fret: 0 },
  { stringName: 4, fret: 2 },
  { stringName: 4, fret: 3 },
  { stringName: 3, fret: 0 },
  { stringName: 3, fret: 2 },
  { stringName: 2, fret: 0 },
  { stringName: 2, fret: 1 },
  { stringName: 2, fret: 3 },
  { stringName: 1, fret: 0 },
  { stringName: 1, fret: 1 },
  { stringName: 1, fret: 3 },
  { stringName: 1, fret: 1 },
  { stringName: 1, fret: 0 },
  { stringName: 2, fret: 3 },
  { stringName: 2, fret: 1 },
  { stringName: 2, fret: 0 },
  { stringName: 3, fret: 2 },
  { stringName: 3, fret: 0 },
  { stringName: 4, fret: 3 },
  { stringName: 4, fret: 2 },
  { stringName: 4, fret: 0 },
  { stringName: 5, fret: 3 }
];

const groupBreaks = [0, 5, 10, 17, 21, 25];
const groupScrollLefts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

console.log(JSON.stringify({ slotCount: slots.length, slots, groupBreaks, groupScrollLefts }, null, 2));
