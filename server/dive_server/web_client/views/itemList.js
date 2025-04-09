import $ from 'jquery';

const  { wrap } = girder.utilities.PluginUtils;
const ItemListWidget = girder.views.widgets.ItemListWidget;
const { restRequest } = girder.rest;

import {
    convertToDIVEHandler,
    isVideoType,
} from '../utils/utils'

import '../stylesheets/views/itemList.styl';

wrap(ItemListWidget, 'render', function (render) {
    render.call(this);
    if (this.collection.params.folderId) {
        restRequest({type: 'GET', url: 'folder/' + this.collection.params.folderId}).done((result) => {
            if (!result.meta.annotate && result.meta.MarkForPostProcess === undefined) {
                if (!this.$el.closest('.modal-dialog').length) {
                    for (let ix = 0; ix < this.collection.length; ix++) {
                        if (!this.$el.find('.g-item-list .g-item-list-entry:eq(' + ix + ') .g-dive-convert-link').length && isVideoType(this.collection.models[ix].attributes.name)) {
                            this.$el.find('.g-item-list .g-item-list-entry:eq(' + ix + ') a[class^=g-]:last').after(
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
