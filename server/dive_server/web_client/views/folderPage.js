import { wrap } from '@girder/core/utilities/PluginUtils';
import HierarchyWidget from '@girder/core/views/widgets/HierarchyWidget';

import { convertToDIVEHandler, webrootPath } from '../utils/utils';
wrap(HierarchyWidget, 'render', function (render) {
    render.call(this);
    if (this.parentModel.attributes._modelType === 'folder'){
        if (!this.$el.find('.g-dive-open-item[role="button"]').length && this.parentModel.attributes.meta.annotate) {
            this.$el.find('.g-folder-header-buttons .btn-group').before(
                `<a class="g-dive-open-item btn btn-sm btn-primary" role="button" href="${webrootPath}${this.parentModel.id}" target="_blank">
                        <i class="icon-link-ext"></i>Open in DIVE
                </a>`
            );
        }
        if ( !this.$el.find('.g-dive-convert-item[role="button"]').length && !this.parentModel.attributes.meta.annotate && this.parentModel.attributes.meta.MarkForPostProcess !== false) {
            this.$el.find('.g-folder-header-buttons .btn-group').before(
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