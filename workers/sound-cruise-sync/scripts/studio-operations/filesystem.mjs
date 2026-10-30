// Scope-local I/O injection: never silently fall back while a pinned Host is active.
import fs from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
const context = new AsyncLocalStorage();
export const currentFilesystem = () => context.getStore();
export const withFilesystem = (io, fn) => context.run(io, fn);
export default new Proxy(
  {},
  {
    get(_t, k) {
      const io = context.getStore();
      if (!io) return fs[k];
      if (typeof io[k] !== "function")
        throw Error("unsupported-pinned-io:" + String(k));
      return io[k].bind(io);
    },
  },
);
