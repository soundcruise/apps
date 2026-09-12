import { handleRequest, handleScheduled } from './app.js';

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
  scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env));
  }
};
