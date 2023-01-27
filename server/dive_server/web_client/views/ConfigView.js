import $ from 'jquery';
import _ from 'underscore';

import PluginConfigBreadcrumbWidget from '@girder/core/views/widgets/PluginConfigBreadcrumbWidget';
import View from '@girder/core/views/View';

import template from '../templates/configView.pug';
import '@girder/core/utilities/jquery/girderEnable';

const FIELDS = ['uri', 'bindName', 'baseDn', 'password', 'searchField', 'queryFilter'];

const SETTING_FIELDS = ['timeout', 'fallback']

var ConfigView = View.extend({

    initialize: function () {
        
        this.breadcrumb = new PluginConfigBreadcrumbWidget({
            pluginName: 'DIVE Settings',
            parentView: this
        });
    },

    render: function () {
        this.$el.html(template({
            servers: this.servers,
            settings: this.settings
        }));

        this.breadcrumb.setElement(this.$('.g-config-breadcrumb-container')).render();
        return this;
    },

});

export default ConfigView;
