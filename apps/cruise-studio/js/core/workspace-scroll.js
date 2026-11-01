/* Existing workspace scroll owner, shared by release and development entries. */
(function(){var CS=window.CruiseStudio;
    var scrollRoots = Object.create(null);
    function getScrollRoot(workspace) {
        return scrollRoots[workspace] || window;
    }
    CS.scroll = {
        getRoot: getScrollRoot,
        setRoot: function (workspace, root) {
            if (root && (typeof root.scrollTo !== 'function' || typeof root.scrollBy !== 'function')) {
                throw new TypeError('scroll rootにはscrollTo / scrollByが必要です');
            }
            if (root) scrollRoots[workspace] = root;
            else delete scrollRoots[workspace];
        },
        scrollToTop: function (workspace) { getScrollRoot(workspace).scrollTo(0, 0); },
        scrollBy: function (workspace, options) { getScrollRoot(workspace).scrollBy(options); },
        getPosition: function (workspace) {
            var root = getScrollRoot(workspace);
            return root === window ? { x: window.scrollX, y: window.scrollY } :
                { x: root.scrollLeft, y: root.scrollTop };
        },
        restorePosition: function (workspace, position) {
            getScrollRoot(workspace).scrollTo(position.x, position.y);
        },
        getViewportTop: function (workspace) {
            var root = getScrollRoot(workspace);
            return root === window ? 0 : root.getBoundingClientRect().top + root.clientTop;
        }
    };

})();
