/**
 * One-off: emit the saved STAGE6 route that is embedded in script.js.
 */
const slots = JSON.parse("[{\"stringName\":5,\"fret\":3},{\"stringName\":5,\"fret\":2},{\"stringName\":5,\"fret\":0},{\"stringName\":6,\"fret\":3},{\"stringName\":6,\"fret\":1},{\"stringName\":6,\"fret\":0},{\"stringName\":6,\"fret\":0},{\"stringName\":6,\"fret\":1},{\"stringName\":6,\"fret\":3},{\"stringName\":5,\"fret\":0},{\"stringName\":5,\"fret\":2},{\"stringName\":5,\"fret\":3},{\"stringName\":5,\"fret\":3},{\"stringName\":4,\"fret\":0},{\"stringName\":4,\"fret\":2},{\"stringName\":4,\"fret\":3},{\"stringName\":3,\"fret\":0},{\"stringName\":3,\"fret\":2},{\"stringName\":2,\"fret\":0},{\"stringName\":2,\"fret\":1},{\"stringName\":2,\"fret\":1},{\"stringName\":2,\"fret\":3},{\"stringName\":1,\"fret\":0},{\"stringName\":1,\"fret\":1},{\"stringName\":1,\"fret\":3},{\"stringName\":1,\"fret\":3},{\"stringName\":1,\"fret\":1},{\"stringName\":1,\"fret\":0},{\"stringName\":2,\"fret\":3},{\"stringName\":2,\"fret\":1},{\"stringName\":2,\"fret\":1},{\"stringName\":2,\"fret\":0},{\"stringName\":3,\"fret\":2},{\"stringName\":3,\"fret\":0},{\"stringName\":4,\"fret\":3},{\"stringName\":4,\"fret\":2},{\"stringName\":4,\"fret\":0},{\"stringName\":5,\"fret\":3},{\"stringName\":5,\"fret\":3},{\"stringName\":5,\"fret\":2},{\"stringName\":5,\"fret\":0},{\"stringName\":6,\"fret\":3},{\"stringName\":6,\"fret\":1},{\"stringName\":6,\"fret\":0},{\"stringName\":6,\"fret\":0},{\"stringName\":6,\"fret\":1},{\"stringName\":6,\"fret\":3},{\"stringName\":6,\"fret\":5},{\"stringName\":5,\"fret\":2},{\"stringName\":5,\"fret\":3},{\"stringName\":5,\"fret\":3},{\"stringName\":5,\"fret\":5},{\"stringName\":4,\"fret\":2},{\"stringName\":4,\"fret\":3},{\"stringName\":4,\"fret\":5},{\"stringName\":3,\"fret\":2},{\"stringName\":3,\"fret\":4},{\"stringName\":3,\"fret\":5},{\"stringName\":3,\"fret\":5},{\"stringName\":2,\"fret\":3},{\"stringName\":2,\"fret\":5},{\"stringName\":2,\"fret\":6},{\"stringName\":1,\"fret\":3},{\"stringName\":1,\"fret\":5},{\"stringName\":1,\"fret\":5},{\"stringName\":1,\"fret\":3},{\"stringName\":2,\"fret\":6},{\"stringName\":2,\"fret\":5},{\"stringName\":2,\"fret\":3},{\"stringName\":3,\"fret\":5},{\"stringName\":3,\"fret\":5},{\"stringName\":3,\"fret\":4},{\"stringName\":3,\"fret\":2},{\"stringName\":4,\"fret\":5},{\"stringName\":4,\"fret\":3},{\"stringName\":4,\"fret\":2},{\"stringName\":5,\"fret\":5},{\"stringName\":5,\"fret\":3},{\"stringName\":5,\"fret\":3},{\"stringName\":5,\"fret\":2},{\"stringName\":6,\"fret\":5},{\"stringName\":6,\"fret\":3},{\"stringName\":6,\"fret\":1},{\"stringName\":6,\"fret\":0},{\"stringName\":6,\"fret\":0},{\"stringName\":6,\"fret\":1},{\"stringName\":6,\"fret\":3},{\"stringName\":6,\"fret\":5},{\"stringName\":6,\"fret\":7},{\"stringName\":6,\"fret\":8},{\"stringName\":6,\"fret\":8},{\"stringName\":5,\"fret\":5},{\"stringName\":5,\"fret\":7},{\"stringName\":5,\"fret\":8},{\"stringName\":4,\"fret\":5},{\"stringName\":4,\"fret\":7},{\"stringName\":3,\"fret\":4},{\"stringName\":3,\"fret\":5},{\"stringName\":3,\"fret\":5},{\"stringName\":3,\"fret\":7},{\"stringName\":2,\"fret\":5},{\"stringName\":2,\"fret\":6},{\"stringName\":2,\"fret\":8},{\"stringName\":1,\"fret\":5},{\"stringName\":1,\"fret\":7},{\"stringName\":1,\"fret\":8},{\"stringName\":1,\"fret\":8},{\"stringName\":1,\"fret\":7},{\"stringName\":1,\"fret\":5},{\"stringName\":2,\"fret\":8},{\"stringName\":2,\"fret\":6},{\"stringName\":2,\"fret\":5},{\"stringName\":3,\"fret\":7},{\"stringName\":3,\"fret\":5},{\"stringName\":3,\"fret\":5},{\"stringName\":3,\"fret\":4},{\"stringName\":4,\"fret\":7},{\"stringName\":4,\"fret\":5},{\"stringName\":5,\"fret\":8},{\"stringName\":5,\"fret\":7},{\"stringName\":5,\"fret\":5},{\"stringName\":6,\"fret\":8},{\"stringName\":6,\"fret\":8},{\"stringName\":6,\"fret\":10},{\"stringName\":5,\"fret\":7},{\"stringName\":5,\"fret\":8},{\"stringName\":5,\"fret\":10},{\"stringName\":4,\"fret\":7},{\"stringName\":4,\"fret\":9},{\"stringName\":4,\"fret\":10},{\"stringName\":4,\"fret\":10},{\"stringName\":3,\"fret\":7},{\"stringName\":3,\"fret\":9},{\"stringName\":3,\"fret\":10},{\"stringName\":2,\"fret\":8},{\"stringName\":2,\"fret\":10},{\"stringName\":1,\"fret\":7},{\"stringName\":1,\"fret\":8},{\"stringName\":1,\"fret\":8},{\"stringName\":1,\"fret\":10},{\"stringName\":1,\"fret\":8},{\"stringName\":1,\"fret\":8},{\"stringName\":1,\"fret\":7},{\"stringName\":2,\"fret\":10},{\"stringName\":2,\"fret\":8},{\"stringName\":3,\"fret\":10},{\"stringName\":3,\"fret\":9},{\"stringName\":3,\"fret\":7},{\"stringName\":4,\"fret\":10},{\"stringName\":4,\"fret\":10},{\"stringName\":4,\"fret\":9},{\"stringName\":4,\"fret\":7},{\"stringName\":5,\"fret\":10},{\"stringName\":5,\"fret\":8},{\"stringName\":5,\"fret\":7},{\"stringName\":6,\"fret\":10},{\"stringName\":6,\"fret\":8},{\"stringName\":6,\"fret\":8},{\"stringName\":6,\"fret\":10},{\"stringName\":6,\"fret\":12},{\"stringName\":6,\"fret\":13},{\"stringName\":5,\"fret\":10},{\"stringName\":5,\"fret\":12},{\"stringName\":4,\"fret\":9},{\"stringName\":4,\"fret\":10},{\"stringName\":4,\"fret\":10},{\"stringName\":4,\"fret\":12},{\"stringName\":3,\"fret\":9},{\"stringName\":3,\"fret\":10},{\"stringName\":3,\"fret\":12},{\"stringName\":2,\"fret\":10},{\"stringName\":2,\"fret\":12},{\"stringName\":2,\"fret\":13},{\"stringName\":2,\"fret\":13},{\"stringName\":1,\"fret\":10},{\"stringName\":1,\"fret\":12},{\"stringName\":1,\"fret\":13},{\"stringName\":1,\"fret\":13},{\"stringName\":1,\"fret\":12},{\"stringName\":1,\"fret\":10},{\"stringName\":2,\"fret\":13},{\"stringName\":2,\"fret\":13},{\"stringName\":2,\"fret\":12},{\"stringName\":2,\"fret\":10},{\"stringName\":3,\"fret\":12},{\"stringName\":3,\"fret\":10},{\"stringName\":3,\"fret\":9},{\"stringName\":4,\"fret\":12},{\"stringName\":4,\"fret\":10},{\"stringName\":4,\"fret\":10},{\"stringName\":4,\"fret\":9},{\"stringName\":5,\"fret\":12},{\"stringName\":5,\"fret\":10},{\"stringName\":6,\"fret\":13},{\"stringName\":6,\"fret\":12},{\"stringName\":6,\"fret\":10},{\"stringName\":6,\"fret\":8}]");
const groupBreaks = [0,6,12,20,25,30,38,44,47,50,58,64,70,78,82,84,87,90,98,106,114,122,130,138,141,149,157,159,165,173,177,181,189];
const groupScrollLefts = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 68,
    9: 68,
    10: 68,
    11: 68,
    12: 68,
    13: 68,
    14: 5,
    15: 5,
    16: 180,
    17: 180,
    18: 180,
    19: 180,
    20: 180,
    21: 309,
    22: 309,
    23: 309,
    24: 309,
    25: 309,
    26: 309,
    27: 419,
    28: 419,
    29: 419,
    30: 419,
    31: 419,
    32: 419
};

console.log(JSON.stringify({ slotCount: slots.length, slots, groupBreaks, groupScrollLefts }, null, 2));
