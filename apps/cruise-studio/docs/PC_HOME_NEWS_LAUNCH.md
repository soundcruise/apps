# PC Home / NEWS / My Apps Launch v1

## Owner boundary

Studio owns the PC rendering and workspace lifecycle. Port owns NEWS configuration,
provider validation, publication filters, article records, external-link attribution
and My Apps platform precedence. No independent feed, Account identity, Port dataset,
Sync engine or persistent cache is introduced.

## Home

The Home grid opens existing Tuner, Metronome Dock, Practice, Gear, My Apps, NEWS,
Cruise Apps and theme controls. It describes the current readonly Port Host projection
using `getCachedStatus` and subscription only. Home does not read storage, create a DB,
acquire Sync, ensure/provision a dataset or infer authorization. The status entry opens
the existing Tools read button; actual inspection still needs that explicit button.

## NEWS

`loadNewsPresentation` is the sole production data source. Its existing provider
configuration and loopback-preview URL policy remain authoritative. No second proxy
or API is implemented. API requests use the owner's GET/omit credentials/no-store/
redirect-error/timeout contract plus a workspace AbortController. Deactivation,
pagehide and a newer refresh abort the old request and invalidate its generation.
Late results never replace the current view.

`prepareNews`, `groupNews`, official filter/category labels, source attribution and
original-article URL rules are reused. Owner publication, test-label, deduplication,
event/sale expiry and 90-day visibility rules are preserved. A single active timer
rechecks expiry, as do visibility/pageshow events; workspace exit removes timers and
listeners. Import and Home navigation do not start NEWS requests. Reentry reloads
the owner provider rather than restoring an external persistent cache.

An outage displays the owner's notice and independently bundled first-party content
only. Explicit disable clears all records including first-party fallback. Loading,
empty category, error and disabled states are distinct. The list and metadata detail
are PC renderers; official local articles use owner text, external articles expose a
safe `noopener noreferrer` source link without fetching article bodies or images.
The UI adds no invented summaries or API body HTML.

Buttons/selects use native keyboard semantics. Detail focuses its title; Back/Escape
restores the originating list item or refresh fallback. Modal ownership is respected.
The same Main scroll root, semantic theme tokens and narrow layout are retained.
NEWS is excluded from score printing.

## My Apps

The immutable library projection contains only owner-compatible URL fields needed by
the existing resolver. Raw values, ordering and IDs are preserved. Launch is a trusted,
explicit user action after checking the current readonly Host projection, stale/error
state and modal/IME gate. No CRUD, icon binary read or persistent write is connected.
Invalid selected platform URLs remain invalid; Studio does not substitute its own
recommendation or fall through to a different URL. The launcher reports a request,
because browsers may return null for a successful noopener window.

## Acceptance and remaining work

Focused Node tests cover provider lifecycle/generations, abort, kill/outage fallback,
owner URL precedence, malformed targets, immutability and isolated launch flags.
Browser tests use a separate loopback server, empty Chrome profile, fixture NEWS
transport and readonly Port fixture bytes. They cover navigation, state/detail/filter,
keyboard, stale launch refusal, four themes, 390/768/1440/1920px geometry, print,
console/404 and forbidden storage/network mutations.

This does not enable Shared Write, authenticate a real account, write Production,
start L3d, finish score/Pre-DTM, or claim Safari/native IME/printer acceptance.
Real provider outage/network behavior remains governed by Port's deployed API and
deployment policy; fixture success is not a claim that Production was contacted.
