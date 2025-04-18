const  { wrap } = girder.utilities.PluginUtils;
const HierarchyWidget = girder.views.widgets.HierarchyWidget;

import { convertToDIVEHandler, webrootPath, metadataRootPath } from '../utils/utils';
wrap(HierarchyWidget, 'render', function (render) {
    render.call(this);
    if (this.parentModel.attributes._modelType === 'folder'){
        if (!this.$el.find('.g-dive-open-item[role="button"]').length && this.parentModel.attributes.meta.annotate) {
            this.$el.find('.g-folder-header-buttons').prepend(
                `<a class="g-dive-open-item btn btn-sm btn-primary" style="margin-left: 10px" role="button" href="${webrootPath}${this.parentModel.id}" target="_blank">
                        <i class="icon-link-ext"></i>Open in DIVE
                </a>`
            );
        }
        if (!this.$el.find('.g-dive-open-metadata-item[role="button"]').length && this.parentModel.attributes.meta.DIVEMetadata) {
            this.$el.find('.g-folder-header-buttons').prepend(
                `<a class="g-dive-open-metadata-item btn btn-sm btn-primary" style="margin-left: 10px" role="button" href="${metadataRootPath}${this.parentModel.id}" target="_blank">
                        <i class="icon-link-ext"></i>Open Metadata in DIVE
                </a>`
            );
        }
        if (!this.$el.find('.g-dive-open-metadata-filter-item[role="button"]').length && this.parentModel.attributes.meta.DIVEMetadataClonedFilter && this.parentModel.attributes.meta.DIVEMetadataClonedFilterBase) {
            const base = this.parentModel.attributes.meta.DIVEMetadataClonedFilterBase;
            const params= encodeURI(this.parentModel.attributes.meta.DIVEMetadataClonedFilter);
            this.$el.find('.g-folder-header-buttons').prepend(
                `<a class="g-dive-open-metadata-filter-item btn btn-sm btn-info" style="margin-left: 10px" role="button" href="${metadataRootPath}${base}?filter=${params}" target="_blank">
                        <i class="icon-link-ext"></i>Open Metadata Filter in DIVE
                </a>`
            );
        }
        if ( !this.$el.find('.g-dive-convert-item[role="button"]').length && !this.parentModel.attributes.meta.annotate && this.parentModel.attributes.meta.MarkForPostProcess === true) {
            this.$el.find('.g-folder-header-buttons').prepend(
                `<div 
                    class="g-dive-convert-link btn btn-sm btn-primary"
                    item-id=${this.parentModel.id}
                    mark-for-process="true"
                    folder-id=${this.parentModel.attributes.parentId}
                    role="button" 
                    title="Convert to DIVE"
                    >
                    Convert to DIVE
                </div>`
            );
            this.$('.g-dive-convert-link').on('click', convertToDIVEHandler);
            
        }    
    }
    this.delegateEvents();
});
