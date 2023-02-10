import $ from 'jquery';

import { wrap } from '@girder/core/utilities/PluginUtils';
import ItemListWidget from '@girder/core/views/widgets/ItemListWidget';
import { restRequest } from '@girder/core/rest';

import {
    convertToDIVEHandler,
    isVideoType,
} from '../utils/utils'

import '../stylesheets/views/itemList.styl';

const webrootPath = 'dive#/viewer/'
const webrootFolderPath = 'dive#/folder/'
wrap(ItemListWidget, 'render', function (render) {
    const root = this;

    render.call(this);
    if (this.collection.params.folderId) {
        restRequest({type: 'GET', url: 'folder/' + this.collection.params.folderId}).done((result) => {
            if (!result.meta.annotate) {    
                if (!this.$el.closest('.modal-dialog').length) {
                    for (let ix = 0; ix < this.collection.length; ix++) {
                        if (!this.$el.find('.g-item-list li.g-item-list-entry:eq(' + ix + ') .g-dive-convert-link').length && isVideoType(this.collection.models[ix].attributes.name)) {
                            this.$el.find('.g-item-list li.g-item-list-entry:eq(' + ix + ') a[class^=g-]:last').after(
                                `<div
                                    class="g-dive-convert-link btn btn-sm btn-primary"
                                    item-id=${this.collection.models[ix].id} 
                                    folder-id=${this.collection.params.folderId}
                                    role="button"
                                    title="Convert to DIVE"
                                    >
                                    Convert to DIVE
                                </div>`
                            );
                        }
                    }
                }
                this.$('.g-dive-convert-link').on('click', convertToDIVEHandler);
            }
        });
    }
});