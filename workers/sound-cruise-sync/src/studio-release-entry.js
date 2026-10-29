// No wrangler/router changes. Alternate default-OFF build candidate.
import legacy from './studio-legacy-v137.mjs';
import {createStudioReleaseWorker} from './studio-release-worker.js';
export default createStudioReleaseWorker({legacy});
