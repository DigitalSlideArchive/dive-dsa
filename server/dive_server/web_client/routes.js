const router = girder.router;
const events = girder.events;
const { exposePluginConfig } = girder.utilities.PluginUtils;

exposePluginConfig('dive_server', 'plugins/dive_server/config');

import ConfigView from './views/ConfigView';
router.route('plugins/dive_server/config', 'DIVEConfig', function () {
    events.trigger('g:navigateTo', ConfigView);
});

