/* Commands own explicit targets. Registration alone grants no execution capability. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.commands = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    function createRouter(getContext) {
        var commands = new Map();
        return Object.freeze({
            register: function (command) {
                if (!command.id || typeof command.target !== 'function' || typeof command.canExecute !== 'function' || typeof command.execute !== 'function') throw new TypeError('Invalid command contract');
                if (commands.has(command.id)) throw new Error('Duplicate command: ' + command.id);
                var entry = Object.freeze(Object.assign({}, command));
                commands.set(entry.id, entry);
                return function () { if (commands.get(entry.id) === entry) commands.delete(entry.id); };
            },
            execute: function (id, event) {
                var command = commands.get(id);
                if (!command || (event && event.defaultPrevented)) return { consumed: false };
                var context = Object.freeze(Object.assign({}, getContext()));
                // Fix the target once before capability checks; focus does not infer it.
                context = Object.freeze(Object.assign({}, context, { target: command.target(context) }));
                if (context.target == null || !command.canExecute(context)) return { consumed: false };
                var result = command.execute(context, event);
                return { consumed: !!(result && result.consumed) };
            },
            clear: function () { commands.clear(); }
        });
    }
    return Object.freeze({ createRouter: createRouter });
});
