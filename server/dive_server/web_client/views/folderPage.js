import { wrap } from '@girder/core/utilities/PluginUtils';
import MetadataWidget from '@girder/core/views/widgets/MetadataWidget';


const webrootPath = 'dive#/viewer/'
const brandName = "DIVE"
wrap(MetadataWidget, 'render', function (render) {

    this.once('g:rendered', function () {
        if (!this.$el.find('.g-dive-open-item[role="button"]').length && this.parentView.parentModel.attributes.meta.annotate) {
            this.$el.find('.g-folder-header-buttons .btn-group').before(
                `<a class="g-dive-open-item btn btn-sm btn-primary" role="button" href="${webrootPath}${this.parentView.parentModel.i_d}" target="_blank">
                        <i class="icon-link-ext"></i>Open in ${brandName}
                </a>`
            );
        }
        this.delegateEvents();
    });
    render.call(this);
});