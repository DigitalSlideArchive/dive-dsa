import $ from 'jquery';

import { wrap } from '@girder/core/utilities/PluginUtils';
import FolderListWidget from '@girder/core/views/widgets/FolderListWidget';

import '../stylesheets/views/itemList.styl';

const webrootPath = 'dive#/viewer/'
const brandName = "DIVE"
wrap(FolderListWidget, 'render', function (render) {
    const root = this;

    render.call(this);


    if (!this.$el.closest('.modal-dialog').length) {
        for (let ix = 0; ix < this.collection.length; ix++) {
            if (!this.$el.find('.g-folder-list li.g-folder-list-entry:eq(' + ix + ') .g-dive-open-link').length && this.collection.models[ix].attributes.meta.annotate) {
                this.$el.find('.g-folder-list li.g-folder-list-entry:eq(' + ix + ') a[class^=g-]:last').after(
                    `<a class="g-dive-open-link" title="Open in ${brandName}" href="${webrootPath}${this.collection.models[ix].id}" target="_blank"><i class="icon-video"></i></a>`
                );
            }
        }
    }
});