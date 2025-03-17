import { GirderModel } from '../girderTypes'
import { XMLBaseValue, XMLSpecification } from "../parser/parserTypes";
import RestClient from "./girderRest"

export interface SlicerImage {
    _id: string;
    description: string;
    image: string;
    name: string;
    type: string;
}

export interface JobResponse {
    _id: string;
    _original_name: string;
    celeryTaskId: string;
    title: string;
    type: string;
}

export interface SlicerTask {
    _id: string;
    description: string;
    image: string;
    name: string;
    type: string;
}


const fileTypes = ['file', 'directory', 'image', 'item', 'multi', 'new-file'];
const fileImageItem = ['file', 'image', 'item', 'new-file'];
const useGirderSlicerApi = (girderRest: RestClient) => {
    const getSlicerList = async () => {
        return girderRest.get<SlicerImage[]>('slicer_cli_web/cli');
    }
    const getSlicerXML = async(id: string) => {
        return girderRest.get(`slicer_cli_web/cli/${id}/xml`);
    }
    const validateParams = (xml:XMLSpecification) => {
        // Go through each parameter
        let valid = true;
        xml.panels.forEach((panel) => {
            panel.groups.forEach((group) => {
                group.parameters.forEach((parameter) => {
                    // Check for a value for each item;
                    // TODO More checks for other types for validation
                    if (['girderApiUrl', 'girderToken'].includes(parameter.id)) {
                        return;
                    }
                    if (!fileTypes.includes(parameter.type) && parameter.required && (parameter.value === undefined || parameter.value === null)) {
                        parameter.error = 'Value is not set';
                        valid = false;
                    }else if (!fileTypes.includes(parameter.type) && parameter.fileValue === undefined && (parameter.value === undefined)) {
                        parameter.error = 'Value is not set';
                        valid = false;
                    }else if (parameter.error) {
                    parameter.error = '';
                }
            });
            });
        });
        console.log(`Valid: ${valid}`);
        return valid;
    }
    const convertToParams = (xml:XMLSpecification) => {
        // Go through and convert the new values to parameters for the /slicer_cli_web/cli endpoint
        const params:Record<string, XMLBaseValue> = {}
        xml.panels.forEach((panel) => {
            panel.groups.forEach((group) => {
                group.parameters.forEach((parameter) => {
                    if (fileTypes.includes(parameter.type) && parameter.fileValue) {
                        if (parameter.type === 'new-file' || parameter.type === 'multi' || parameter.multiple) {
                            params[parameter.id] = parameter.fileValue.name;
                        } else {
                            // Need an actual folder Id
                            if (parameter.fileValue.fileId) {
                                params[parameter.id] = parameter.fileValue.fileId;
                            }
                            if (parameter.type === 'directory') {
                                params[parameter.id] = parameter.fileValue.girderId;
                            }
                        }
                        if ((parameter.type === 'new-file' || parameter.type === 'multi' || parameter.multiple) || (parameter.channel === 'output' && fileImageItem.includes(parameter.type))) {
                            params[`${parameter.id}_folder`] = parameter.fileValue.parentId;
                        }
                    } else if (parameter.value !== undefined) {
                        params[parameter.id] = parameter.value;
                    }
                });
            });
        });
        return params;
    }

    const processInput = async (xml:XMLSpecification, name: string) => {
        // Checks for output names that aren't set and sets them automatically to 
        // {Input Name} - {Task Name} - {OutputName} - {Date.Time}.{extension}

        //First lets get a default folder to place the system.
        let defaultFolder = '';
        const me = (await girderRest.get('user/me')).data;
        if (me && me['_id']) { 
            const results =  await girderRest.get(`/folder`, {params: {
                parentId: me['_id'],
                parentType: 'user',
            }});
            results.data.forEach((folder: GirderModel) => {
                if (folder.public === false) {
                    defaultFolder = folder['_id']
                }
            })
        }
        
        const title = xml.title;
        const baseName = name.replace(/\.[^/.]+$/, "")
        xml.panels.forEach((panel) => {
            panel.groups.forEach((group) => {
                group.parameters.forEach((param) => {
                    if (param.channel === 'output' && !param.value && !param.fileValue && fileImageItem.includes(param.type)) {
                        // Set the new name output based 
                        param.fileValue = {
                            name: `${baseName}-${title}-${param.title}-${new Date().toISOString()}.${param.extensions}`,
                            girderId: defaultFolder,
                            parentId: defaultFolder,
                            
                        }
                        
                    }
                })
            })
        })

    }
    const runTask = async (xml:XMLSpecification, taskid: string) => {
        if (validateParams(xml)) {
            const params = convertToParams(xml);
            const url = `slicer_cli_web/cli/${taskid}/run`
            return (await girderRest.post<JobResponse>(url, null , { params })).data;
        }
        return false;

    }

    return {
        getSlicerList,
        getSlicerXML,
        validateParams,
        convertToParams,
        runTask,
        processInput,
    }
}

export {
    useGirderSlicerApi
}
