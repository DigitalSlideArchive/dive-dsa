import $ from 'jquery';

const { restRequest } = girder.rest;

/* Utility items for HistomicUI views
  In the future more utility classes/functions can be added for export
*/
class DIVESettings {
    constructor() {
        DIVESettings._dive_settings = null;
    }

    static getSettings() {
        if (DIVESettings._dive_settings) {
            if (DIVESettings._dive_settings_result) {
                return DIVESettings._dive_settings_result;
            }
            return DIVESettings._dive_settings;
        } else {
            DIVESettings._dive_settings = restRequest({
                type: 'GET',
                url: 'histomicsui/settings'
            }).then((resp) => {
                DIVESettings._dive_settings = $.Deferred().resolve(resp);
                return resp;
            });
        }
        return DIVESettings._dive_settings;
    }

    static clearSettingsCache() {
        delete DIVESettings._dive_settings;
    }
}

export { DIVESettings };