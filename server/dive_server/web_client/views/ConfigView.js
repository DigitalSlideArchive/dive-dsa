import $ from 'jquery';
import _ from 'underscore';

const PluginConfigBreadcrumbWidget = girder.views.widgets.PluginConfigBreadcrumbWidget;
const View  = girder.views.View;

import template from '../templates/configView.pug';


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
