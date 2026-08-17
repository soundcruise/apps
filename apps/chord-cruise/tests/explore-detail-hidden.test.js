const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');

assert(!exploreSource.includes('id="cc-chord-detail"'), 'Explore no longer creates the lower detail card');
assert(exploreSource.includes("if (!detail) {"), 'detail rendering safely no-ops when the card is absent');
assert(exploreSource.includes("buildDetailRow('構成音'"), 'legacy detail builders remain available for intentional future use');
assert(exploreSource.includes("buildDetailRow('度数'"), 'legacy degree detail builder remains available for intentional future use');
assert(exploreSource.includes("buildDetailTextRow('雰囲気'"), 'legacy mood detail builder remains available for intentional future use');

console.log('explore-detail-hidden: lower detail card is not generated and render path is guarded');
