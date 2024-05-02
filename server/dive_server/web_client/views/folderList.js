import $ from 'jquery';

import { wrap } from '@girder/core/utilities/PluginUtils';
import FolderListWidget from '@girder/core/views/widgets/FolderListWidget';

import '../stylesheets/views/itemList.styl';
import { convertToDIVEHandler, webrootPath, metadataRootPath } from '../utils/utils';

const brandName = "DIVE"
wrap(FolderListWidget, 'render', function (render) {
    const root = this;

    render.call(this);


    if (!this.$el.closest('.modal-dialog').length) {
        for (let ix = 0; ix < this.collection.length; ix++) {
            if (!this.$el.find('.g-folder-list li.g-folder-list-entry:eq(' + ix + ') .g-dive-open-link').length && this.collection.models[ix].attributes.meta.annotate) {
                this.$el.find('.g-folder-list li.g-folder-list-entry:eq(' + ix + ') a[class^=g-]:last').after(
                    `<a class="g-dive-open-link" title="Open in ${brandName}" href="${webrootPath}${this.collection.models[ix].id}" target="_blank">
                        <div class="g-dive-convert-link btn btn-sm btn-primary">
                            <i class="icon-link-ext"></i>Open in DIVE
                        </div>
                    </a>`
                );
            }
            if (!this.$el.find('.g-folder-list li.g-folder-list-entry:eq(' + ix + ') .g-dive-open-metadata-link').length && this.collection.models[ix].attributes.meta.DIVEMetadata) {
                this.$el.find('.g-folder-list li.g-folder-list-entry:eq(' + ix + ') a[class^=g-]:last').after(
                    `<a class="g-dive-open-metadata-link" title="Open Metadata in ${brandName}" href="${metadataRootPath}${this.collection.models[ix].id}" target="_blank">
                        <div class="g-dive-convert-link btn btn-sm btn-primary">
                            <i class="icon-link-ext"></i>Open Metadata in DIVE
                        </div>
                    </a>`
                );
            }
            if (!this.$el.find('.g-folder-list li.g-folder-list-entry:eq(' + ix + ') .g-dive-open-metadata-filter-link').length && this.collection.models[ix].attributes.meta.DIVEMetadataClonedFilter && this.collection.models[ix].attributes.meta.DIVEMetadataClonedFilterBase) {
                const base = this.collection.models[ix].attributes.meta.DIVEMetadataClonedFilterBase;
                const params= encodeURI(this.collection.models[ix].attributes.meta.DIVEMetadataClonedFilter);    
                this.$el.find('.g-folder-list li.g-folder-list-entry:eq(' + ix + ') a[class^=g-]:last').after(
                    `<a class="g-dive-open-metadata-filter-link" title="Open Metadata Filter in ${brandName}" href="${metadataRootPath}${base}?filter=${params}" target="_blank">
                        <div class="g-dive-convert-link btn btn-sm btn-info">
                            <i class="icon-link-ext"></i>Open Metadata Filter in DIVE
                        </div>
                    </a>`
                );
            }

            if (!this.$el.find('.g-folder-list li.g-folder-list-entry:eq(' + ix + ') .g-dive-convert-link').length && this.collection.models[ix].attributes.meta.MarkForPostProcess === true) {
                this.$el.find('.g-folder-list li.g-folder-list-entry:eq(' + ix + ') a[class^=g-]:last').after(
                    `<div
                        id="g-dive-convert-link-${this.collection.models[ix].attributes._id}"
                        class="g-dive-convert-link btn btn-sm btn-primary"
                        item-id=${this.collection.models[ix].attributes._id}
                        mark-for-process="true"
                        folder-id=${this.collection.models[ix].attributes.parentId}
                        role="button"
                        title="Convert to DIVE"
                        >
                        Convert to DIVE
                    </div>`
                );
                this.$(`#g-dive-convert-link-${this.collection.models[ix].attributes._id}`).on('click', convertToDIVEHandler);
            }
        }
    }
});