import { MAX_MANIFEST } from "./core/adapter.mjs";
import { fail } from "./contracts.mjs";
// Reuse the existing bounded/encrypted core. Reserve space for its manifest/checkpoint
// metadata before yielding a page to the core; partial ciphertext remains preserved on failure.
export const ARCHIVE_METADATA_RESERVE = 3 * MAX_MANIFEST;
export async function* boundedArchivePages(pages, maxArchiveBytes) {
  if (maxArchiveBytes === undefined) { yield* pages; return; } // prior signed grants retain their existing bounds
  if (!Number.isSafeInteger(maxArchiveBytes) || maxArchiveBytes <= ARCHIVE_METADATA_RESERVE) fail("archive-budget-grant");
  let cipherBytes = 0;
  for await (const page of pages) {
    cipherBytes += Buffer.byteLength(JSON.stringify(page)) + 28;
    if (cipherBytes + ARCHIVE_METADATA_RESERVE > maxArchiveBytes) fail("archive-total-budget");
    yield page;
  }
}
