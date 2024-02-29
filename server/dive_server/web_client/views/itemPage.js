import { wrap } from '@girder/core/utilities/PluginUtils';
import ItemView from '@girder/core/views/body/ItemView';


import '../stylesheets/views/itemList.styl';
import {
    convertToDIVEHandler,
    isVideoType,
    webrootPath,
} from '../utils/utils'


wrap(ItemView, 'render', function (render) {
    this.once('g:rendered', function () {
        if (isVideoType(this.model.attributes.name) && !this.$el.find('.g-dive-convert-item[role="button"]').length && !this.model.parent.attributes.meta.annotate && this.model.parent.attributes.meta.MarkForPostProcess !== false) {
            this.$el.find('.g-item-header .btn-group').before(
                `<div 
                    class="g-dive-convert-link btn btn-sm btn-primary"
                    item-id=${this.model.id}
                    folder-id=${this.model.parent.id}
                    role="button" 
                    title="Convert to DIVE"
                    >
                    Convert to DIVE
                </div>`
            );
            this.$('.g-dive-convert-link').on('click', convertToDIVEHandler);
            
        } else if (this.model.parent.attributes.meta.annotate) {
            if (!this.$el.find('.g-dive-open-item[role="button"]').length) {
                this.$el.find('.g-item-header .btn-group').before(
                    `<a class="g-dive-open-item btn btn-sm btn-primary" role="button" href="${webrootPath}${this.model.parent.id}" target="_blank">
                            <i class="icon-link-ext"></i>Open in DIVE
                    </a>`
                );
            }
        }
        this.delegateEvents();
    });
    render.call(this);
});
