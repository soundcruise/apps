export function preparePracticeFileWindow(windowObject = window) {
    try {
        return windowObject.open('about:blank', '_blank');
    } catch (_) {
        return null;
    }
}

export function navigatePreparedPracticeFileWindow(preparedWindow, objectUrl) {
    if (!preparedWindow || typeof objectUrl !== 'string' || !objectUrl.startsWith('blob:')) return false;
    try {
        preparedWindow.opener = null;
        preparedWindow.location.replace(objectUrl);
        return true;
    } catch (_) {
        return false;
    }
}
