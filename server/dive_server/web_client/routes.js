import events from '@girder/core/events';
import router from '@girder/core/router';
import { exposePluginConfig } from '@girder/core/utilities/PluginUtils';

exposePluginConfig('ldap', 'plugins/DIVE/config');

import ConfigView from './views/ConfigView';
router.route('plugins/DIVE/config', 'DIVEConfig', function () {
    events.trigger('g:navigateTo', ConfigView);
});

