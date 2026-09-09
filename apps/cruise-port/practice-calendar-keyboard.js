// One correction per focused control, after the keyboard viewport settles.
// VisualViewport.scroll is deliberately not observed: our own scroll can emit it.
export function createPracticeCalendarKeyboard({ windowObject, form, getInputBounds }) {
    let target = null;
    let frame = null;
    let done = false;
    let deadline = 0;
    let stableSince = 0;
    let lastGeometry = [];
    const viewport = windowObject.visualViewport;

    function detach() {
        windowObject.cancelAnimationFrame(frame);
        frame = null;
        windowObject.removeEventListener('touchmove', cancel);
        windowObject.removeEventListener('wheel', cancel);
        windowObject.removeEventListener('pointerdown', cancel);
    }

    function cancel() {
        done = true;
        detach();
    }

    function adjust() {
        frame = null;
        if (done) return;
        cancel(); // Mark consumed BEFORE scrolling, including synchronous viewport events.
        if (form.hidden || !form.contains(windowObject.document.activeElement)
            || !viewport || viewport.scale !== 1
            || windowObject.innerHeight - viewport.height < 80) return;
        const { top, bottom } = getInputBounds();
        // Match getBoundingClientRect's coordinate origin. On the measured iPhone
        // pageTop === scrollY even while offsetTop is nonzero; adding offsetTop
        // again hid the form. On layout-relative browsers this difference retains
        // the visual viewport offset. Do not infer the origin from the user agent.
        const origin = Number.isFinite(viewport.pageTop) && Number.isFinite(windowObject.scrollY)
            ? viewport.pageTop - windowObject.scrollY : viewport.offsetTop;
        const visibleTop = origin + 24;
        const visibleBottom = origin + viewport.height - 12;
        if (bottom <= visibleBottom && top >= visibleTop) return;
        const delta = top - visibleTop;
        if (Math.abs(delta) >= 8) windowObject.scrollBy({ top: delta, left: 0, behavior: 'instant' });
    }

    function geometry() {
        return [viewport.height, viewport.offsetTop, windowObject.scrollY || 0];
    }

    function settle() {
        frame = null;
        if (done) return;
        const now = windowObject.performance.now();
        const current = geometry();
        if (current.some((value, index) => Math.abs(value - lastGeometry[index]) >= 2)) {
            lastGeometry = current;
            stableSince = now;
        }
        // Observe only during this finite focus session, never after our scroll.
        if (now >= deadline) {
            cancel(); // No settled viewport: don't force a speculative correction.
        } else if (now - stableSince >= 180 && windowObject.innerHeight - viewport.height >= 80) {
            adjust();
        } else {
            frame = windowObject.requestAnimationFrame(settle);
        }
    }

    return {
        start(focusedTarget) {
            if (!viewport || !focusedTarget || focusedTarget === target) return;
            detach();
            target = focusedTarget;
            done = false;
            deadline = windowObject.performance.now() + 900;
            stableSince = windowObject.performance.now();
            lastGeometry = geometry();
            windowObject.addEventListener('touchmove', cancel, { passive: true });
            windowObject.addEventListener('wheel', cancel, { passive: true });
            windowObject.addEventListener('pointerdown', cancel, { passive: true });
            frame = windowObject.requestAnimationFrame(settle);
        },
        stop() {
            cancel();
            target = null;
        }
    };
}
