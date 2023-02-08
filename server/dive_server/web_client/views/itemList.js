import $ from 'jquery';

import { wrap } from '@girder/core/utilities/PluginUtils';
import ItemListWidget from '@girder/core/views/widgets/ItemListWidget';
import { restRequest } from '@girder/core/rest';

import '../stylesheets/views/itemList.styl';

const webrootPath = 'dive#/viewer/'
const webrootFolderPath = 'dive#/folder/'
const brandName = "DIVE"
const fileVideoTypes = [
    '.mp4',
    '.webm',
    '.avi',
    '.mov',
    '.wmv',
    '.mpg',
    '.mpeg',
    '.mp2',
    '.ogg',
    '.flv',
  ];
const fileSuffixRegex = /\.[^.]*$/;
wrap(ItemListWidget, 'render', function (render) {
    const root = this;

    render.call(this);
    if (this.collection.params.folderId) {
        restRequest({type: 'GET', url: 'folder/' + this.collection.params.folderId}).done((result) => {
            if (!result.meta.annotate) {    
                if (!this.$el.closest('.modal-dialog').length) {
                    for (let ix = 0; ix < this.collection.length; ix++) {
                        const extensions = this.collection.models[ix].attributes.name.match(fileSuffixRegex);
                        let extension = '';
                        if (extensions.length){
                            extension = extensions[0];
                        }
                        if (!this.$el.find('.g-item-list li.g-item-list-entry:eq(' + ix + ') .g-dive-convert-link').length && fileVideoTypes.includes(extension) ) {
                            this.$el.find('.g-item-list li.g-item-list-entry:eq(' + ix + ') a[class^=g-]:last').after(
                                `<div class="g-dive-convert-link btn btn-sm btn-primary" item-id=${this.collection.models[ix].id} role="button" title="Convert to DIVE">Convert to DIVE</div>`
                            );
                        }
                    }
                }
            }
            this.$('.g-dive-convert-link').on('click', (e) => {
                var itemId = $(e.currentTarget).attr('item-id');
                console.log(itemId)
                restRequest({
                    type: 'POST',
                    url: 'dive_rpc/convert_dive/' + itemId,
                    error: function (error) {
                        if (error.status !== 0) {
                            events.trigger('g:alert', {
                                text: error.responseJSON.message,
                                type: 'info',
                                timeout: 5000,
                                icon: 'info'
                            });
                        }
                    }
                }).done((result) => {
                    console.log(result);
                    if (result) {
                        window.location.href = `${webrootFolderPath}${this.collection.params.folderId}`;
                    }
                });
            });
        
        });
    }
});