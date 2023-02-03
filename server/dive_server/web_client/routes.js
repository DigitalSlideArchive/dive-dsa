import events from '@girder/core/events';
import router from '@girder/core/router';
import { exposePluginConfig } from '@girder/core/utilities/PluginUtils';

exposePluginConfig('dive_server', 'plugins/dive_server/config');

import ConfigView from './views/ConfigView';
router.route('plugins/dive_server/config', 'DIVEConfig', function () {
    events.trigger('g:navigateTo', ConfigView);
});

