import { wrap } from '@girder/core/utilities/PluginUtils';
import HierarchyWidget from '@girder/core/views/widgets/HierarchyWidget';


const webrootPath = 'dive#/viewer/'
const brandName = "DIVE"
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
    }
    this.delegateEvents();
});