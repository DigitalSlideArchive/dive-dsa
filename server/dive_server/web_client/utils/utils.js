
import { restRequest } from '@girder/core/rest';
import events from '@girder/core/events';


const webrootPath = 'dive#/viewer/'
const metadataRootPath = `dive#/metadata/`
const webrootFolderPath = 'dive#/folder/'
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
function convertToDIVEHandler(e) {
    var itemId = $(e.currentTarget).attr('item-id');
    var folderId = $(e.currentTarget).attr('folder-id');
    var markforProcess = $(e.currentTarget).attr('mark-for-process');
    var processId = itemId;
    if (markforProcess) { // Need to get the item in the folder
        restRequest({
            type: 'POST',
            url: 'dive_rpc/postprocess/' + itemId + '?skipTranscoding=true',
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
            if (result) {
                window.location.href = `${webrootFolderPath}${folderId}`;
            }
        });
    
    } else {
        restRequest({
            type: 'POST',
            url: 'dive_rpc/convert_dive/' + processId + '?skipTranscoding=true',
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
            if (result) {
                window.location.href = `${webrootFolderPath}${folderId}`;
            }
        });
    }
}

function  isVideoType(name) {
    const extensions = name.match(fileSuffixRegex);
    let extension = '';
    if (extensions.length){
        extension = extensions[0];
    }
    return fileVideoTypes.includes(extension)
}

export {
    webrootFolderPath,
    webrootPath,
    metadataRootPath,
    fileVideoTypes,
    fileSuffixRegex,
    convertToDIVEHandler,
    isVideoType,
}