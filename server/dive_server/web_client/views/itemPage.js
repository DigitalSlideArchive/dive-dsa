import { wrap } from '@girder/core/utilities/PluginUtils';
import ItemView from '@girder/core/views/body/ItemView';


const webrootPath = 'dive#/viewer/'
const brandName = "DIVE"
import '../stylesheets/views/itemList.styl';

wrap(ItemView, 'render', function (render) {

    this.once('g:rendered', function () {
        if (!this.$el.find('.g-dive-open-item[role="button"]').length && this.model.attributes.meta.annotate) {
            this.$el.find('.g-item-header .btn-group').before(
                `<a class="g-dive-open-item btn btn-sm btn-primary" role="button" href="${webrootPath}${this.model.id}" target="_blank">
                        <i class="icon-link-ext"></i>Open in ${brandName}
                </a>`
            );
        }
        this.delegateEvents();
    });
    render.call(this);
});