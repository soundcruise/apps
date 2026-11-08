/* SOUND CRUISE proprietary materials. See root LICENSE, NOTICE, and SECURITY-AND-AI-POLICY.md.
 * Operator-authorized maintenance is permitted; third-party licenses remain applicable. */
(function (window) {
    'use strict';

    // Canonical entry paths and existing official icons. Order is shared by all Information pages.
    var apps = Object.freeze([
        Object.freeze({ id: 'port', name: 'Cruise Port', directory: 'cruise-port', standard: '', pro: 'pro_9a3943176561',
            icons: Object.freeze({ standard: 'assets/app-icons/standard/icon-192.png', pro: 'assets/app-icons/pro/icon-192.png' }) }),
        Object.freeze({ id: 'pitch', name: '音感クルーズ', directory: 'pitch-cruise', standard: 'standard', pro: 'pro_x9v7q2m8',
            icons: Object.freeze({ standard: 'icon_pwa_192.png', pro: 'pro_icon_192.png' }) }),
        Object.freeze({ id: 'fretboard', name: '指板クルーズ', directory: 'fretboard_cruise', standard: 'standard', pro: 'pro_a9f4k7q2m8z',
            icons: Object.freeze({ standard: 'generated-home-icons/standard-selected-icon/fretboard-cruise-standard-selection-192.png', pro: 'generated-home-icons/final-selected-icon/fretboard-cruise-final-selection-192.png' }) }),
        Object.freeze({ id: 'rhythm', name: 'リズムクルーズ', directory: 'rhythm-cruise', standard: 'standard', pro: 'pro_r4m8k7n2q9x',
            icons: Object.freeze({ standard: 'icon-192.png', pro: 'pro_r4m8k7n2q9x/icon-192.png' }) }),
        Object.freeze({ id: 'chord', name: 'コードクルーズ', directory: 'chord-cruise', standard: 'standard', pro: 'pro_k7m4q9v2x8',
            icons: Object.freeze({ standard: 'icons/chord-cruise-192.png', pro: 'icons/chord-cruise-pro-192.png' }) })
    ]);

    function linksFor(currentApp, edition) {
        // The caller supplies its existing resolved edition. Unknown contexts must not advertise a wrong edition.
        if (!apps.some(function (app) { return app.id === currentApp; }) ||
            (edition !== 'standard' && edition !== 'pro' && edition !== 'beta')) return [];
        var targetEdition = edition === 'pro' ? 'pro' : 'standard';
        return apps.filter(function (app) { return app.id !== currentApp; }).map(function (app) {
            return {
                id: app.id, name: app.name,
                href: '/apps/' + app.directory + '/' + (app[targetEdition] ? app[targetEdition] + '/' : ''),
                icon: '/apps/' + app.directory + '/' + app.icons[targetEdition]
            };
        });
    }

    function render(container, currentApp, edition) {
        if (!container) return;
        var links = linksFor(currentApp, edition);
        container.replaceChildren();
        container.hidden = links.length === 0;
        if (!links.length) return;
        var document = container.ownerDocument;
        var title = document.createElement('h2');
        title.className = 'cruise-series-title';
        title.textContent = 'クルーズapps';
        container.setAttribute('aria-label', title.textContent);
        container.appendChild(title);
        var list = document.createElement('ul');
        list.className = 'cruise-series-list';
        links.forEach(function (app) {
            var item = document.createElement('li');
            var link = document.createElement('a');
            link.className = 'cruise-series-link';
            link.href = app.href;
            link.setAttribute('data-series-app', app.id);
            // Native same-tab links preserve browser/OS handling of installed applications.
            var icon = document.createElement('img');
            icon.src = app.icon;
            icon.alt = '';
            icon.width = 40;
            icon.height = 40;
            var name = document.createElement('span');
            name.className = 'cruise-series-name';
            name.textContent = app.name;
            var arrow = document.createElement('span');
            arrow.className = 'cruise-series-arrow';
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = '›';
            link.append(icon, name, arrow);
            item.appendChild(link);
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    window.SoundCruiseInformationLinks = Object.freeze({ linksFor: linksFor, render: render });
}(window));
