// One correction per focused control, after the keyboard viewport settles.
// VisualViewport.scroll is deliberately not observed: our own scroll can emit it.
export function createPracticeCalendarKeyboard({ windowObject, form, getInputBounds }) {
    let target = null;
    let timer = null;
    let frame = null;
    let done = false;
    let deadline = 0;
    let lastHeight = 0;
    const viewport = windowObject.visualViewport;

    function detach() {
        windowObject.clearTimeout(timer);
        windowObject.cancelAnimationFrame(frame);
        timer = frame = null;
        viewport?.removeEventListener('resize', onResize);
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
        const visibleTop = viewport.offsetTop + 12;
        const visibleBottom = viewport.offsetTop + viewport.height - 12;
        if (bottom <= visibleBottom && top >= visibleTop) return;
        const delta = bottom - top <= visibleBottom - visibleTop && top >= visibleTop
            ? bottom - visibleBottom : top - visibleTop;
        if (Math.abs(delta) >= 8) windowObject.scrollBy({ top: delta, left: 0, behavior: 'instant' });
    }

    function schedule() {
        if (done) return;
        windowObject.clearTimeout(timer);
        windowObject.cancelAnimationFrame(frame);
        timer = windowObject.setTimeout(() => {
            timer = null;
            frame = windowObject.requestAnimationFrame(adjust);
        }, Math.max(0, Math.min(180, deadline - windowObject.performance.now())));
    }

    function onResize() {
        if (done || Math.abs(viewport.height - lastHeight) < 8) return;
        lastHeight = viewport.height;
        schedule();
    }

    return {
        start(focusedTarget) {
            if (!viewport || !focusedTarget || focusedTarget === target) return;
            detach();
            target = focusedTarget;
            done = false;
            deadline = windowObject.performance.now() + 900;
            lastHeight = viewport.height;
            viewport.addEventListener('resize', onResize);
            windowObject.addEventListener('touchmove', cancel, { passive: true });
            windowObject.addEventListener('wheel', cancel, { passive: true });
            windowObject.addEventListener('pointerdown', cancel, { passive: true });
            schedule();
        },
        stop() {
            cancel();
            target = null;
        }
    };
}
