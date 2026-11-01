// No wrangler/router changes. Alternate default-OFF build candidate.
import legacy from './index.js';
import {createStudioReleaseWorker} from './studio-release-worker.js';
export default createStudioReleaseWorker({legacy});
