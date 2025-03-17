<script lang="ts">
import { PropType, Ref, defineComponent, onMounted, ref, watch } from 'vue'
import RestClient from '../../api/girderRest';
import { GirderModel, GirderModelType } from '../../girderTypes';
import { mdiAccount, mdiArrowUpRightBold, mdiChevronDoubleLeft, mdiChevronDoubleRight, mdiChevronDown, mdiChevronLeft, mdiChevronRight, mdiChevronUp,
mdiClose, mdiEarth, mdiFile, mdiFolder, mdiLock, mdiSitemap } from '@mdi/js';
import SvgIcon from '@jamescoyle/vue-icon';
import { convertInputNumber, convertInputString, countFormatter, isValidRegex, sizeFormatter } from './utils'
import RootSelection from './RootSelection.tw.vue';
export default defineComponent({
  components: {
    SvgIcon,
    RootSelection
  },
  props: {
    apiUrl: {
      type: String,
      default: 'api/v1'
    },
    multi: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      default: 'file',
    },
    limit: {
      type: Number,
      default: 100,
    },
    output: {
      type: Boolean,
      required: false,
    },
    validation: {
      type: Function as PropType<(id: GirderModel) => ({ valid: boolean, msg?: string})>,
      default: () => ({valid: true})
    },
    parentId: {
      type: String,
      required: false,
      default: undefined
    },
    girderId: {
      type: String,
      required: false,
      default: undefined,
    },
    name: {
      type: String,
      required: false,
      default: undefined,
    },
  },
  setup(props, { emit }) {
    const errorMsg = ref('');
    const submit = async () => {
      if (selectedModel.value === null) {
        selectedModel.value = await girderRest.get(`folder/${currentParentId.value}`);
      }
      if (selected.value !== null && selectedModel.value !== null) 
      {
        errorMsg.value = '';
        const result = props.validation(selectedModel.value);
        if (result.valid) {
          const data = {
              girderId: selected.value.girderId,
              name: selected.value.name,
              parentId: currentParentId.value,
              regExp: props.multi,
              fileId: selected.value.fileId,
            }
          emit('submit', data);
        } else if (result.msg) {
          errorMsg.value = result.msg;
        }
      }
    }
    const girderRest = new RestClient({apiRoot: props.apiUrl, authenticateWithCredentials: true});
    const iconMap: Ref<{user: string, collection:string, folder:string, item: string, file:string}> = ref({
        'user': mdiAccount,
        'collection' : mdiSitemap,
        'folder': mdiFolder,
        'item': mdiFile,
        'file': mdiFile,
    })
    const home: Ref<string | null>  = ref(null);
    const users: Ref<GirderModel[] | null> =  ref(null);
    const collections: Ref<GirderModel[] | null> =  ref(null);
    const user: Ref<GirderModel | null> =  ref(null);
    const rootFolders: Ref<GirderModel[] | null>  = ref(null);
    const folderCount: Ref<number> = ref(0);
    const folderShow: Ref<boolean> = ref(true);
    const itemShow: Ref<boolean> = ref(true);
    const itemCount: Ref<number> = ref(0);
    const rootItems: Ref<GirderModel[] | null>  = ref(null);
    const folderOffset: Ref<number> = ref(0);
    const itemOffset: Ref<number> = ref(0);
    const breadCrumb: Ref<{type: GirderModelType, path: {name:string, id: string}[]}> = ref({type: 'user' as GirderModelType, path:[]})
    const currentParentId = ref('');
    const currentParentType = ref('user');
    const selected: Ref<null | {name: string, girderId: string, parentId?: string, fileId?: string}> = ref(null);
    const selectedModel: Ref<null | GirderModel> = ref(null);
    onMounted(async () => {
      await getData();
      if (props.parentId && props.girderId && props.name) {
        currentParentId.value = props.parentId;
        currentParentType.value = 'user';
        const hierarchy = (await (girderRest.get(`folder/${props.parentId}/rootpath`))).data;
        breadCrumb.value.type = hierarchy[0]['type'];
        breadCrumb.value.path = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hierarchy.forEach((folder: any) => {
          let name = folder['object']['name'];
          if (!name && breadCrumb.value.type === 'user') {
            name = `${folder['object']['firstName']} ${folder['object']['lastName']}`
          } 
          breadCrumb.value.path.push({ name, id: folder['object']['_id'] });
        });
        const baseFolder = (await (girderRest.get(`folder/${props.parentId}`))).data;
        breadCrumb.value.path.push({name: baseFolder['name'], id: baseFolder['_id']});
        updateMainView(props.parentId, 'folder', '', true);
        selected.value = {
          name: props.name,
          girderId: props.girderId,
          parentId: props.parentId,
        }
        recalculatedSelected();
      }
    })
    const updateFolders = async (parentId: string, parentType: string) => {
      const responseFolders = await girderRest.get(`folder`, {
                params: {
                    limit: props.limit,
                    offset: folderOffset.value * props.limit,
                    sort: 'name',
                    sortdir: 1,
                    parentType,
                    parentId,
                },
            }
        );
        folderCount.value = parseInt(responseFolders.headers['girder-total-count']);
        rootFolders.value = responseFolders.data;
        return responseFolders.data;
    };
    const updateItems = async (parentId: string) => {
      const responseItems = await girderRest.get(`item`, {
                    params: {
                        limit: props.limit,
                        offset: itemOffset.value * props.limit,
                        sort: 'name',
                        sortdir: 1,
                        folderId: parentId,
                    },
                }
            );
            itemCount.value = parseInt(responseItems.headers['girder-total-count']);
            rootItems.value = responseItems.data;
        return responseItems.data;
    }
    const updateMainView = async (parentId: string, parentType: string, name = '', resetShow=false) => {
      if (props.type === 'directory' && parentType === 'folder') {
        selected.value = {
          name,
          girderId: parentId,
        };
      } else if (parentType !== 'folder') {
        selected.value = null;
      }
      currentParentId.value = parentId;
      currentParentType.value = parentType;
      if (resetShow) {
        itemShow.value = false;
        folderShow.value = false;
      }
        await updateFolders(parentId, parentType);
        if (parentType  === 'folder') {
          await updateItems(parentId)
        } else {
            rootItems.value = [];
        }
        const foundBreadCrumbIndex = breadCrumb.value.path.findIndex((item) => item.id === parentId);
        if (foundBreadCrumbIndex !== -1) {
            breadCrumb.value = {
                type: breadCrumb.value.type,
                path: breadCrumb.value.path.slice(0, foundBreadCrumbIndex + 1)
            }
        } else {
            breadCrumb.value = {
                type: breadCrumb.value.type,
                path: [ ...breadCrumb.value.path , { name,  id: parentId }],
            };
        }
    }
    const setRoot = async ({ val, type, name}: {val: string,  type: GirderModelType, name: string}) => {
        home.value = val;
        breadCrumb.value = { type, path: []};
        updateMainView(val, type, name, true);
    }
    const upLevel = () => {
      if (breadCrumb.value.path.length > 1) { // we can't go up if add root
        const newPath = breadCrumb.value.path[breadCrumb.value.path.length - 2]
        let newPathType = 'folder';
        if( breadCrumb.value.path.length === 2) {
          newPathType = breadCrumb.value.type;
        }
        updateMainView(newPath.id, newPathType, newPath.name, true)
      }
    }
    // This gets the main data for the Root Hierarchy Tool
    const getData = async () => {
        const userResponse = (await girderRest.get('user/me')).data;
        user.value = userResponse;
        // REPLACE WITH A PROMISE ALL
        const collectionsResponse = await girderRest.get('collection', {
            params: {
                limit: 1001,
                offset: 0,
                sort: 'name',
                sortdir: 1,
            },
        });
        const usersResponse = await girderRest.get('user', {
            params: {
                limit: 1001,
                offset: 0,
                sort: 'name',
                sortdir: 1,
                parentType: 'user',
            },
        });
        const rootResponse =  await girderRest.get('folder', {
            params: {
                limit: 1001,
                offset: 0,
                sort: 'name',
                sortdir: 1,
                parentType: 'user',
                parentId: userResponse._id,
            },
        });
        users.value = usersResponse.data;
        collections.value = collectionsResponse.data;
        rootFolders.value = rootResponse.data
        home.value = userResponse._id;
        breadCrumb.value = {
            type: 'user',
            path: [{
                name:`${userResponse.firstName} ${userResponse.lastName}`,
                id: userResponse._id
            }]
        }
    }
    watch(folderOffset, () => updateFolders(currentParentId.value, currentParentType.value));
    watch(itemOffset, () => updateItems(currentParentId.value));
    const updateOffset = (type: 'folder' | 'item', value: number) => {
      if (value < 0 || Number.isNaN(value)) {
        folderOffset.value = 0;
        return;
      }
      if (type === 'folder' && value >= Math.ceil(folderCount.value/ props.limit)) {
        folderOffset.value = Math.ceil(folderCount.value/ props.limit)-1;
        return;
      }
      if (type === 'item' && value >= Math.ceil(itemCount.value/ props.limit)) {
        itemOffset.value = Math.ceil(itemCount.value/ props.limit)-1;
        return;
      }
      if (type ==='folder') {
        folderOffset.value = value;
      }
      if (type === 'item') {
        itemOffset.value = value;
      }
    }
    const selecting = async (item: GirderModel, type: 'folder' | 'file') => {
      if (type === props.type) {
        selected.value = {
          name: item.name,
          girderId: item._id,
          parentId: type === 'file' ? item.parentId || undefined : undefined, 
        };
        selectedModel.value = item;
      }
      if (type === 'file' && selected.value) {
        const files = (await (girderRest.get(`item/${item._id}/files`))).data
        if (files.length) {
          selected.value.fileId = files[0]['_id'];
        }
      }
    }
    const selectedItems: Ref<Record<string, boolean>> = ref({});
    const setSelectedName = async (data: string) => {
      selected.value = {
        name: data,
        girderId: currentParentId.value,
        parentId: currentParentId.value
      };
      recalculatedSelected();
    }
    const setRegularExpression = (data: string) => {
      if (isValidRegex(data)) {
        selected.value = {
          name: data,
          girderId: data,
          parentId: currentParentId.value,
        };
        recalculatedSelected();
        errorMsg.value = '';
      } else {
        errorMsg.value = 'Specify a valid Regular Expression';
      }
    }
    const recalculatedSelected = () => {
      selectedItems.value = {};
      let reg: RegExp;
      if (selected.value?.name) {
        reg = new RegExp(selected.value.name);
      } else {
        return;
      }
        if (props.type !== 'directory' && rootItems.value) {
          rootItems.value.forEach((item) => {
            if (!props.multi && item.name === selected.value?.name) {
              selectedItems.value[item.name] = true;
            } else if (reg && reg.test(item.name)) {
              selectedItems.value[item.name] = true;
            }
          })
        }
        if (props.type === 'directory' && rootFolders.value) {
          rootFolders.value.forEach((item) => {
            if (!props.multi && item.name === selected.value?.name) {
              selectedItems.value[item.name] = true;
            } else if (reg && reg.test(item.name)) {
              selectedItems.value[item.name] = true;
            }
          })
        }
    }
    return {
      home,
      collections,
      user,
      rootFolders,
      folderCount,
      folderShow,
      folderOffset,
      rootItems,
      itemCount,
      itemShow,
      itemOffset,
      iconMap,
      breadCrumb,
      selected,
      selectedItems,
      selectedModel,
      errorMsg,
      users,
      currentParentType,
      // icons
      mdiAccount,
      mdiArrowUpRightBold,
      mdiChevronDoubleLeft,
      mdiChevronDoubleRight,
      mdiChevronDown, mdiChevronLeft,
      mdiChevronRight,
      mdiChevronUp,
      mdiClose,
      mdiEarth,
      mdiFile,
      mdiFolder,
      mdiLock,
      mdiSitemap,
      updateOffset,
      setRegularExpression,
      setSelectedName,
      updateMainView,
      upLevel,
      countFormatter,
      setRoot,
      convertInputString,
      convertInputNumber,
      selecting,
      submit,
      sizeFormatter,
    }
  },
});
</script>
<template>
  <div>
    <div class="fixed inset-0 z-50 flex justify-center items-center">
      <div class="flex flex-col max-w-5xl rounded-lg shadow-lg bg-backgroundColor text-textColor">
        <!-- Header -->
        <div class="grid grid-cols-12">
          <span class="col-span-10 text-xl my-2 ml-5">
            File Browser
          </span>
          <span class="col-start-12 col-span-1 justify-self-end mr-5 my-2	" @click="$emit('close')">
            <svg-icon
              type="mdi"
              :path="mdiClose"
              :size="30"
              class="gsu-icon gsu-clickable"
              data-dismiss="modal"
              aria-label="Close"
            >
              <span aria-hidden="true">&times;</span>
            </svg-icon>
          </span>
        </div>
        
        <!-- Body -->
        <div class="py-2 px-6">
          <div class="modal-body">
          <div class="mx-auto mx-auto">
            <div
              class="flex flex-nowrap"
            >
              <root-selection
                v-if="home && user && collections && users"
                :home="user._id"
                :value="home"
                :collections="collections"
                :users="users"
                @change="setRoot($event)"
                class="grow my-1"
              />
            </div>
            <div class="gsu-breadcrumb mb-0">
              <div class="grid grid-cols-7 rounded mb-0 ">
                <div class="col-start-1 col-span-4 flex flex-row">
                  <div class="grow">
                  <span
                    v-for="(item, index) in breadCrumb.path"
                    :key="`breadCrumb_${item.id}`"
                  >
                    <span
                      v-if="index === 0"
                      @click="updateMainView(item.id, breadCrumb.type, item.name, true);"
                    >
                      <svg-icon
                        type="mdi"
                        :path="iconMap[breadCrumb.type]"
                        color="lightblue"
                        :size="30"
                        class="pb-2 gsu-icon gsu-clickable"
                        style="display:inline"
                      />
                      <span
                        class="gsu-clickable"
                      > 
                        {{ item.name }}
                      </span>
                    </span>
                    <span
                      v-else-if="index !== breadCrumb.path. length - 1"
                      class="gsu-clickable"
                      @click="updateMainView(item.id, 'folder', item.name, true)"
                    > 
                      {{ item.name }}
                    </span>
                    <span v-else> 
                      {{ item.name }}
                    </span>
                    <span class="px-2">
                      /
                    </span>
                  </span>
                  </div>
                </div>
                <div class="col-start-7 col-span-3">
                <div class="flex flex-row">
                  <div class="flex flex-row">
                    <svg-icon
                      type="mdi"
                      :path="iconMap['folder']"
                      color="gray"
                      :size="30"
                      class="pb-2 gsu-icon"
                    />
                    <span
                      class="number-badge"
                    >{{ countFormatter(folderCount) }}</span>
                  </div>
                  <div class="flex flex-row">
                    <svg-icon
                      type="mdi"
                      :path="iconMap['item']"
                      color="gray"
                      :size="30"
                      class="pb-2 gsu-icon"
                    />
                    <span
                      class="number-badge"
                    >{{ countFormatter(itemCount) }}</span>
                  </div>
                  <div class="px-2">
                    <svg-icon
                      type="mdi"
                      :path="mdiArrowUpRightBold"
                      color="blue"
                      :size="25"
                      class="pb-2 gsu-icon gsu-clickable"
                      @click="upLevel()"
                    />
                  </div>
                </div>
                </div>
              </div>
            </div>
          </div>
          <div class="data-list">
            <div
              v-if="(folderCount > limit || itemCount > limit) && folderCount"
              class="folder-header"
            >
              <div class="flex flex-wrap">
                <div
                  class="w-1/5"
                  @click="folderShow = !folderShow"
                >
                  <svg-icon
                    type="mdi"
                    :path="folderShow ? mdiChevronDown : mdiChevronUp"
                    :size="30"
                    class="gsu-icon gsu-clickable header"
                  />
                  <span class="header">
                    Folders
                  </span>
                </div>
                <div class="w-2/3">
                  <div
                    v-if="folderCount > limit"
                    class="flex flex-wrap justify-content-center"
                  >
                    <div
                      class=""
                      @click="updateOffset('folder', 0)"
                    >
                      <svg-icon
                        type="mdi"
                        :path="mdiChevronDoubleLeft"
                        :size="30"
                        class="gsu-icon gsu-clickable"
                        :class="{'gsu-disabled-icon': folderOffset === 0}"
                      />
                    </div>
                    <div
                      class=""
                      @click="updateOffset('folder', folderOffset - 1)"
                    >
                      <svg-icon
                        type="mdi"
                        :path="mdiChevronLeft"
                        :size="30"
                        class="gsu-icon gsu-clickable"
                        :class="{'gsu-disabled-icon': folderOffset === 0}"
                      />
                    </div>
                    <div
                      class=""
                    >
                      <span class="header"> Page
                        <input
                          type="number"
                          :value="folderOffset + 1"
                          min="1"
                          Lmax=""
                          inputmode="numeric"
                          style="width:40px"
                          class="number-input"
                          @change="updateOffset('folder', convertInputNumber($event))"
                        >
                        of {{ Math.ceil(folderCount / limit) }}</span>
                    </div>
                    <div
                      class=""
                      @click="updateOffset('folder', folderOffset + 1)"
                    >
                      <svg-icon
                        type="mdi"
                        :path="mdiChevronRight"
                        :size="30"
                        class="gsu-icon gsu-clickable"
                        :class="{'gsu-disabled-icon': folderOffset >= Math.ceil(folderCount/limit)-1}"
                      />
                    </div>
                    <div
                      class=""
                      @click="updateOffset('folder', Math.ceil(folderCount/limit)-1)"
                    >
                      <svg-icon
                        type="mdi"
                        :path="mdiChevronDoubleRight"
                        :size="30"
                        :class="{'gsu-disabled-icon': folderOffset === Math.ceil(folderCount/limit)-1}"
                        class="gsu-icon gsu-clickable"
                      />
                    </div>
                  </div>
                </div>
                <div class="w-1/5" />
              </div>
            </div>
            <span v-if="((itemCount > limit || folderCount > limit) && folderShow) || (itemCount <= limit && folderCount <= limit)">
              <div
                v-for="item in rootFolders"
                :key="item._id"
                :class="{'gsu-selected-items' :selectedItems[item.name] || (selected && selected.girderId === item.girderId)}"
                class="grid grid-cols-8 justify-content-left g-0 gsu-item-row"
                @click="selecting(item, 'folder'); updateMainView(item._id, item._modelType, item.name)"
              >
                <div class="col-start-1 col-span-7 flex-grow text-left">
                  <svg-icon
                    type="mdi"
                    :path="iconMap[item._modelType]"
                    color="lightblue"
                    :size="30"
                    class="pb-2 gsu-icon"
                  />
                  <span
                    class=" gsu-clickable"
                  >
                    {{ item.name }}
                  </span>
                </div>
                <div class="">
                  <svg-icon
                    type="mdi"
                    :path="item.public ? mdiEarth : mdiLock"
                    color="gray"
                    :size="30"
                    class="pb-2 gsu-icon"
                  />
                  <span class="gsu-row-info"> {{ item.public ? 'Public' : 'Private' }}</span>
                </div>
              </div>
            </span>
            <div
              v-if="(itemCount > limit || folderCount > limit) && itemCount"
              class="item-header"
            >
              <div
                class="flex flex-wrap"
                @click="itemShow = !itemShow"
              >
                <div class="w-1/5">
                  <svg-icon
                    type="mdi"
                    :path="itemShow ? mdiChevronDown : mdiChevronUp"
                    :size="30"
                    class="gsu-icon gsu-clickable"
                  />
                  <span class="header">
                    Items
                  </span>
                </div>
                <div class="w-2/3">
                  <div
                    v-if="itemCount > limit"
                    class="flex flex-wrap justify-content-center"
                  >
                    <div
                      class=""
                      @click="updateOffset('item', 0)"
                    >
                      <svg-icon
                        type="mdi"
                        :path="mdiChevronDoubleLeft"
                        :size="30"
                        class="icon gsu-clickable"
                        :class="{'gsu-disabled-icon': itemOffset === 0}"
                      />
                    </div>
                    <div
                      class=""
                      @click="updateOffset('item', itemOffset - 1)"
                    >
                      <svg-icon
                        type="mdi"
                        :path="mdiChevronLeft"
                        :size="30"
                        class="gsu-icon gsu-clickable"
                        :class="{'gsu-disabled-icon': itemOffset === 0}"
                      />
                    </div>
                    <div class="">
                      <span class="header"> Page
                        <input
                          type="number"
                          :value="itemOffset + 1"
                          min="1"
                          Lmax=""
                          inputmode="numeric"
                          style="width:40px"
                          class="number-input"
                          @change="updateOffset('item', convertInputNumber($event))"
                        >
                        of {{ Math.ceil(itemCount / limit) }}</span>
                    </div>
                    <div
                      class=""
                      @click="updateOffset('item', itemOffset + 1)"
                    >
                      <svg-icon
                        type="mdi"
                        :path="mdiChevronRight"
                        :size="30"
                        class="gsu-icon gsu-clickable"
                        :class="{'gsu-disabled-icon': itemOffset >= Math.ceil(itemCount/limit)-1}"
                      />
                    </div>
                    <div
                      class=""
                      @click="updateOffset('item', Math.ceil(folderCount/limit)-1)"
                    >
                      <svg-icon
                        type="mdi"
                        :path="mdiChevronDoubleRight"
                        :size="30"
                        :class="{'gsu-disabled-icon': itemOffset === Math.ceil(itemCount/limit)-1}"
                        class="gsu-icon gsu-clickable"
                      />
                    </div>
                  </div>
                </div>
                <div class="w-1/5" />
              </div>
            </div>
            <span v-if="((itemCount > limit || folderCount > limit) && itemShow) || (itemCount <= limit && folderCount <= limit)">
              <div
                v-for="item in rootItems"
                :key="item._id"
                class="grid grid-cols-8 justify-content-left g-0  gsu-item-row"
                :class="{'gsu-' :selectedItems[item.name] || (selected && selected.girderId === item._id)}"
                @click="selecting(item, 'file')"
              >
                <div class="col-start-1 col-span-6 flex-grow text-left">
                  <svg-icon
                    type="mdi"
                    :path="iconMap[item._modelType]"
                    color="lightblue"
                    :size="30"
                    class="pb-2 gsu-icon"
                  />
                  <span>
                    {{ item.name }}
                  </span>
                </div>
                  <div class="col-span-1">
                    <span class="gsu-row-info">{{ sizeFormatter(item.size) }}</span>
                  </div>
                  <div class="col-span-1">
                    <svg-icon
                      type="mdi"
                      :path="item.public ? mdiEarth : mdiLock"
                      color="gray"
                      :size="30"
                      class="pb-2 gsu-icon"
                    />
                    <span class="gsu-row-info"> {{ item.public ? 'Public' : 'Private' }}</span>
                  </div>
              </div>
            </span>
          </div>
        </div>
        <div
          v-if="['directory', 'file'].includes(type)"
          class="mx-5 gsu-selection mb-2"
        >
          <div v-if="!multi">
            <span> Selected {{ type === 'directory' ? 'folder' : 'file' }}:</span>
            <input
              v-if="type === 'directory'"
              :value="selected ? selected.name : 'Select a folder'"
              class="gsu-input block appearance-none w-full py-1 px-2 mb-1 text-base leading-normal rounded"
              type="text"
              placeholder="Select a folder…"
              readonly
            >
            <input
              v-if="type === 'file'"
              :value="selected && selected.name"
              class="gsu-input block appearance-none w-full py-1 px-2 mb-1 text-base leading-normal rounded"
              type="text"
              :placeholder="!output ? 'Select an item' : 'Output name:'"
              :disabled="!output || currentParentType !== 'folder'"
              @input="setSelectedName(convertInputString($event))"
            >        
          </div>
          <div v-else>
            <span> {{ type === 'directory' ? 'Folder' : 'Item' }} Filter (Regular Expression)</span>
            <input
              :value="selected && selected.name"
              class="gsu-input block appearance-none w-full py-1 px-2 mb-1 text-base leading-normal rounded"
              type="text"
              placeholder="Regular Expression"
              @input="setRegularExpression(convertInputString($event))"
            >        
          </div>
        </div>
        <div
          v-if="errorMsg"
          class="mx-5 error-msg"
        >
          {{ errorMsg }}
        </div>
        </div>
        
        <!-- Footer -->
        <div class="p-6 flex justify-end items-center">
          <button
            type="button"
            class="gsu-btn inline-block align-middle text-center select-none border font-normal whitespace-no-wrap py-2 px-4 rounded text-base leading-normal no-underline mx-3"
            @click="$emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="gsu-btn-accept inline-block align-middle text-center select-none border font-normal whitespace-no-wrap py-2 px-4 rounded text-base leading-normal no-underline"
            data-dismiss="modal"
            :class="{'gsu-btn-disabled': selected === null || !!errorMsg || (multi && Object.values(selectedItems).length === 0)}"
            :disabled="selected === null || !!errorMsg || (multi && Object.values(selectedItems).length === 0)"
            @click="submit()"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
    <div class="opacity-25 fixed inset-0 z-40 bg-black"></div>
  </div>
</template>
<style scoped>

</style>
