import $ from 'jquery';

import { wrap } from '@girder/core/utilities/PluginUtils';
import ItemListWidget from '@girder/core/views/widgets/ItemListWidget';

import '../stylesheets/views/itemList.styl';

const webrootPath = 'dive#/viewer/'
const brandName = "DIVE"
wrap(ItemListWidget, 'render', function (render) {
    const root = this;

    render.call(this);


    if (!this.$el.closest('.modal-dialog').length) {
        for (let ix = 0; ix < this.collection.length; ix++) {
            if (!this.$el.find('.g-item-list li.g-item-list-entry:eq(' + ix + ') .g-dive-open-link').length && this.collection.models[ix].attributes.meta.annotate) {
                this.$el.find('.g-item-list li.g-item-list-entry:eq(' + ix + ') a[class^=g-]:last').after(
                    `<a class="g-dive-open-link" title="Open in ${brandName}" href="${webrootPath}${this.collection.models[ix].id}" target="_blank"><i class="icon-video"></i></a>`
                );
            }
        }
    }
});