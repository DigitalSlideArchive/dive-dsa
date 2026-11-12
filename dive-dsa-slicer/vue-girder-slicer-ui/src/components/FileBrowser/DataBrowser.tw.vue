<script lang="ts">
import { PropType, Ref, computed, defineComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import RestClient from '../../api/girderRest';
import { GirderModel, GirderModelType } from '../../girderTypes';
import { mdiAccount, mdiArrowUpRightBold, mdiChevronDoubleLeft, mdiChevronDoubleRight, mdiChevronDown, mdiChevronLeft, mdiChevronRight, mdiChevronUp,
mdiClose, mdiEarth, mdiFile, mdiFolder, mdiLock, mdiSitemap } from '@mdi/js';
import SvgIcon from '@jamescoyle/vue-icon';
import { convertInputNumber, convertInputString, countFormatter, isValidRegex, sizeFormatter } from './utils'
import RootSelection from './RootSelection.tw.vue';
import { useMountToBody } from '../../useMountToBody';
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
    useMountToBody();
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
    const breadcrumbPathEl: Ref<HTMLElement | null> = ref(null);
    const breadcrumbTruncated = ref(false);
    const breadcrumbTooltipVisible = ref(false);
    const breadcrumbTooltipStyle: Ref<Record<string, string>> = ref({});
    const breadcrumbFullPath = computed(() =>
      breadCrumb.value.path.map((item) => item.name).join(' / ')
    );
    const updateBreadcrumbTruncation = () => {
      const el = breadcrumbPathEl.value;
      if (!el) {
        breadcrumbTruncated.value = false;
        return;
      }
      breadcrumbTruncated.value = el.scrollWidth > el.clientWidth;
    };
    const showBreadcrumbTooltip = () => {
      updateBreadcrumbTruncation();
      const el = breadcrumbPathEl.value;
      if (!breadcrumbTruncated.value || !el) {
        breadcrumbTooltipVisible.value = false;
        return;
      }
      const rect = el.getBoundingClientRect();
      const maxWidth = Math.min(Math.max(rect.width, 24 * 16), window.innerWidth - 16);
      let left = rect.left;
      if (left + maxWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - maxWidth - 8);
      }
      breadcrumbTooltipStyle.value = {
        left: `${left}px`,
        top: `${rect.bottom + 4}px`,
        maxWidth: `${maxWidth}px`,
      };
      breadcrumbTooltipVisible.value = true;
    };
    const hideBreadcrumbTooltip = () => {
      breadcrumbTooltipVisible.value = false;
    };
    let breadcrumbResizeObserver: ResizeObserver | null = null;
    const currentParentId = ref('');
    const currentParentType = ref('user');
    const selected: Ref<null | {name: string, girderId: string, parentId?: string, fileId?: string}> = ref(null);
    const selectedModel: Ref<null | GirderModel> = ref(null);
    onMounted(async () => {
      await getData();
      await nextTick();
      updateBreadcrumbTruncation();
      if (typeof ResizeObserver !== 'undefined' && breadcrumbPathEl.value) {
        breadcrumbResizeObserver = new ResizeObserver(() => updateBreadcrumbTruncation());
        breadcrumbResizeObserver.observe(breadcrumbPathEl.value);
      }
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
    onUnmounted(() => {
      breadcrumbResizeObserver?.disconnect();
      breadcrumbResizeObserver = null;
    });
    watch(breadCrumb, async () => {
      await nextTick();
      updateBreadcrumbTruncation();
    }, { deep: true });
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
      breadcrumbPathEl,
      breadcrumbTruncated,
      breadcrumbTooltipVisible,
      breadcrumbTooltipStyle,
      breadcrumbFullPath,
      showBreadcrumbTooltip,
      hideBreadcrumbTooltip,
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
    <div class="gsu-modal-layer fixed inset-0 flex justify-center items-center p-4">
      <div class="gsu-modal-panel gsu-file-browser flex flex-col rounded-lg shadow-lg bg-backgroundColor text-textColor">
        <!-- Header -->
        <div class="gsu-fb-header shrink-0">
          <span class="gsu-fb-title">
            File Browser
          </span>
          <span class="gsu-fb-close" @click="$emit('close')">
            <svg-icon
              type="mdi"
              :path="mdiClose"
              :size="24"
              class="gsu-icon gsu-clickable"
              data-dismiss="modal"
              aria-label="Close"
            >
              <span aria-hidden="true">&times;</span>
            </svg-icon>
          </span>
        </div>
        
        <!-- Body -->
        <div class="gsu-fb-body flex flex-col min-h-0 flex-1 overflow-hidden">
          <div class="modal-body flex flex-col min-h-0 flex-1 overflow-hidden">
          <div class="mx-auto flex flex-col min-h-0 flex-1 overflow-hidden w-full">
            <div
              class="gsu-fb-toolbar flex flex-nowrap shrink-0"
            >
              <root-selection
                v-if="home && user && collections && users"
                :home="user._id"
                :value="home"
                :collections="collections"
                :users="users"
                @change="setRoot($event)"
                class="grow"
              />
            </div>
            <div class="gsu-breadcrumb mb-0 shrink-0">
              <div
                class="gsu-breadcrumb-path-wrap relative"
                @mouseenter="showBreadcrumbTooltip"
                @mouseleave="hideBreadcrumbTooltip"
                @focusin="showBreadcrumbTooltip"
                @focusout="hideBreadcrumbTooltip"
              >
                <div
                  ref="breadcrumbPathEl"
                  class="gsu-breadcrumb-path"
                >
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
                        :size="20"
                        class="gsu-icon gsu-clickable"
                        style="display:inline"
                      />
                      <span
                        class="gsu-clickable"
                      >
                        {{ item.name }}
                      </span>
                    </span>
                    <span
                      v-else-if="index !== breadCrumb.path.length - 1"
                      class="gsu-clickable"
                      @click="updateMainView(item.id, 'folder', item.name, true)"
                    >
                      {{ item.name }}
                    </span>
                    <span v-else>
                      {{ item.name }}
                    </span>
                    <span class="gsu-breadcrumb-sep">/</span>
                  </span>
                </div>
              </div>
              <div class="gsu-breadcrumb-counts">
                <div class="gsu-breadcrumb-count" title="Folders">
                  <svg-icon
                    type="mdi"
                    :path="iconMap['folder']"
                    :size="16"
                  />
                  <span
                    class="number-badge"
                  >{{ countFormatter(folderCount) }}</span>
                </div>
                <div class="gsu-breadcrumb-count" title="Items">
                  <svg-icon
                    type="mdi"
                    :path="iconMap['item']"
                    :size="16"
                  />
                  <span
                    class="number-badge"
                  >{{ countFormatter(itemCount) }}</span>
                </div>
                <div class="gsu-breadcrumb-up" title="Up one level">
                  <svg-icon
                    type="mdi"
                    :path="mdiArrowUpRightBold"
                    :size="20"
                    class="gsu-icon gsu-clickable"
                    @click="upLevel()"
                  />
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
                    :size="24"
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
                        :size="24"
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
                        :size="24"
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
                        :size="24"
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
                        :size="24"
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
                class="gsu-item-row gsu-row"
                @click="selecting(item, 'folder'); updateMainView(item._id, item._modelType, item.name)"
              >
                <div class="gsu-row-main">
                  <svg-icon
                    type="mdi"
                    :path="iconMap[item._modelType]"
                    :size="20"
                    class="gsu-row-icon"
                  />
                  <span class="gsu-row-name">{{ item.name }}</span>
                </div>
                <div class="gsu-row-meta">
                  <svg-icon
                    type="mdi"
                    :path="item.public ? mdiEarth : mdiLock"
                    :size="16"
                  />
                  <span>{{ item.public ? 'Public' : 'Private' }}</span>
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
                    :size="24"
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
                        :size="24"
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
                        :size="24"
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
                        :size="24"
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
                        :size="24"
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
                class="gsu-item-row gsu-row"
                :class="{'gsu-selected-items' :selectedItems[item.name] || (selected && selected.girderId === item._id)}"
                @click="selecting(item, 'file')"
              >
                <div class="gsu-row-main">
                  <svg-icon
                    type="mdi"
                    :path="iconMap[item._modelType]"
                    :size="20"
                    class="gsu-row-icon"
                  />
                  <span class="gsu-row-name">{{ item.name }}</span>
                </div>
                <div class="gsu-row-size">{{ sizeFormatter(item.size) }}</div>
                <div class="gsu-row-meta">
                  <svg-icon
                    type="mdi"
                    :path="item.public ? mdiEarth : mdiLock"
                    :size="16"
                  />
                  <span>{{ item.public ? 'Public' : 'Private' }}</span>
                </div>
              </div>
            </span>
          </div>
        </div>
        <div
          v-if="['directory', 'file'].includes(type)"
          class="gsu-selection shrink-0"
        >
          <div v-if="!multi">
            <span class="gsu-selection-label">Selected {{ type === 'directory' ? 'folder' : 'file' }}</span>
            <input
              v-if="type === 'directory'"
              :value="selected ? selected.name : 'Select a folder'"
              class="gsu-input block appearance-none w-full text-base leading-normal"
              type="text"
              placeholder="Select a folder…"
              readonly
            >
            <input
              v-if="type === 'file'"
              :value="selected && selected.name"
              class="gsu-input block appearance-none w-full text-base leading-normal"
              type="text"
              :placeholder="!output ? 'Select an item' : 'Output name:'"
              :disabled="!output || currentParentType !== 'folder'"
              @input="setSelectedName(convertInputString($event))"
            >        
          </div>
          <div v-else>
            <span class="gsu-selection-label">{{ type === 'directory' ? 'Folder' : 'Item' }} filter (regular expression)</span>
            <input
              :value="selected && selected.name"
              class="gsu-input block appearance-none w-full text-base leading-normal"
              type="text"
              placeholder="Regular Expression"
              @input="setRegularExpression(convertInputString($event))"
            >        
          </div>
        </div>
        <div
          v-if="errorMsg"
          class="error-msg shrink-0"
        >
          {{ errorMsg }}
        </div>
        </div>
        </div>
        
        <!-- Footer -->
        <div class="gsu-fb-footer flex justify-end items-center shrink-0">
          <button
            type="button"
            class="gsu-btn inline-block align-middle text-center select-none border font-normal whitespace-no-wrap py-2 px-4 rounded-sm text-base leading-normal no-underline"
            @click="$emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="gsu-btn-accept inline-block align-middle text-center select-none border font-normal whitespace-no-wrap py-2 px-4 rounded-sm text-base leading-normal no-underline"
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
    <div class="gsu-modal-backdrop opacity-25 fixed inset-0 bg-black"></div>
    <teleport to="body">
      <div
        v-if="breadcrumbTooltipVisible"
        class="gsu-breadcrumb-tooltip pointer-events-none fixed z-10001 whitespace-normal break-all rounded-sm border border-borderColor bg-backgroundColor px-2 py-1 text-sm text-textColor shadow-lg"
        role="tooltip"
        :style="breadcrumbTooltipStyle"
      >
        {{ breadcrumbFullPath }}
      </div>
    </teleport>
  </div>
</template>
<style>
/* Keep breadcrumb layout unscoped + unlayered so DIVE host CSS cannot win via cascade layers. */
.gsu-breadcrumb {
  position: relative !important;
  display: block !important;
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  overflow: hidden !important;
}
.gsu-breadcrumb-path-wrap,
.gsu-breadcrumb-path {
  display: block !important;
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  overflow: hidden !important;
}
.gsu-breadcrumb-path {
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
.gsu-breadcrumb-path svg {
  display: inline !important;
  vertical-align: middle;
}
.gsu-breadcrumb-counts {
  position: absolute !important;
  top: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  z-index: 1;
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  justify-content: flex-end !important;
  white-space: nowrap !important;
}
.gsu-breadcrumb-count,
.gsu-breadcrumb-up {
  display: inline-flex !important;
  align-items: center !important;
  flex-shrink: 0 !important;
}

/*
 * File browser look. Plain, unlayered CSS under .gsu-file-browser so it wins
 * over Tailwind's layered utilities and is not undone by host resets.
 */
.gsu-file-browser {
  /* Size limits repeated here (also in the gsu-modal-panel utility): Tailwind
     v4 utilities are layered and lose to unlayered host resets such as Vuetify's. */
  width: 100%;
  max-width: min(64rem, calc(100vw - 2rem));
  max-height: 90vh;
  overflow: hidden;
  border: 1px solid var(--gsu-color-border);
  font-size: 0.9375rem;
}
.gsu-file-browser .gsu-fb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--gsu-color-border);
}
.gsu-file-browser .gsu-fb-title {
  font-size: 1.125rem;
  font-weight: 500;
}
.gsu-file-browser .gsu-fb-close {
  display: inline-flex;
  padding: 0.25rem;
  border-radius: 4px;
  cursor: pointer;
}
.gsu-file-browser .gsu-fb-close svg {
  color: var(--gsu-color-muted-text);
}
.gsu-file-browser .gsu-fb-close:hover {
  background-color: var(--gsu-color-highlight);
}
.gsu-file-browser .gsu-fb-body {
  padding: 1rem 1.25rem 0.75rem;
}
.gsu-file-browser .gsu-fb-toolbar {
  margin-bottom: 0.5rem;
}
.gsu-file-browser .gsu-fb-footer {
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--gsu-color-border);
}
.gsu-file-browser .gsu-fb-footer button {
  min-width: 5.5rem;
  padding: 0.375rem 1rem;
  border: 1px solid var(--gsu-color-border);
  border-radius: 4px;
  font-size: 0.875rem;
}
.gsu-file-browser .gsu-fb-footer .gsu-btn-accept:not(.gsu-btn-disabled) {
  border-color: var(--gsu-color-primary);
  background-color: var(--gsu-color-primary);
  color: var(--gsu-background-muted);
  font-weight: 500;
}
.gsu-file-browser .gsu-fb-footer .gsu-btn-accept:not(.gsu-btn-disabled):hover {
  filter: brightness(1.1);
}
.gsu-file-browser .gsu-fb-footer .gsu-btn-disabled {
  background-color: transparent;
  opacity: 0.5;
}

/* Breadcrumb bar: one quiet row above the list */
.gsu-file-browser .gsu-breadcrumb {
  min-height: 2.25rem;
  padding: 0.375rem 7.5rem 0.375rem 0.75rem !important;
  border: 1px solid var(--gsu-color-border);
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
  background-color: var(--gsu-background-muted);
  line-height: 1.5rem;
}
.gsu-file-browser .gsu-breadcrumb-path .gsu-clickable {
  color: var(--gsu-color-primary);
}
.gsu-file-browser .gsu-breadcrumb-path .gsu-clickable:hover {
  text-decoration: underline;
}
.gsu-file-browser .gsu-breadcrumb-path svg {
  margin-right: 0.25rem;
  color: var(--gsu-color-muted-text);
}
.gsu-file-browser .gsu-breadcrumb-path > span:last-child {
  color: var(--gsu-color-text);
}
.gsu-file-browser .gsu-breadcrumb-sep {
  padding: 0 0.375rem;
  color: var(--gsu-color-muted-text);
}
.gsu-file-browser .gsu-breadcrumb-counts {
  gap: 0.75rem;
  padding-right: 0.5rem;
  color: var(--gsu-color-muted-text);
  font-size: 0.8125rem;
}
.gsu-file-browser .gsu-breadcrumb-count {
  gap: 0.25rem;
}
.gsu-file-browser .gsu-breadcrumb-count .number-badge {
  position: static;
  font-size: inherit;
}
.gsu-file-browser .gsu-breadcrumb-up {
  padding: 0.125rem;
  border-radius: 4px;
}
.gsu-file-browser .gsu-breadcrumb-up svg {
  color: var(--gsu-color-primary);
}
.gsu-file-browser .gsu-breadcrumb-up:hover {
  background-color: var(--gsu-color-highlight);
}

/* List: one outer border, thin dividers between rows */
.gsu-file-browser .data-list {
  border: 1px solid var(--gsu-color-border);
  border-radius: 0 0 4px 4px;
}
.gsu-file-browser .gsu-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.25rem;
  padding: 0.25rem 0.75rem;
  border: 0;
  border-bottom: 1px solid var(--gsu-color-border);
}
.gsu-file-browser .data-list > span:last-child > .gsu-row:last-child {
  border-bottom: 0;
}
.gsu-file-browser .gsu-row-main {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.gsu-file-browser .gsu-row svg {
  flex-shrink: 0;
}
.gsu-file-browser .gsu-row-icon {
  color: var(--gsu-color-primary);
}
.gsu-file-browser .gsu-row-name {
  overflow: hidden;
  color: var(--gsu-color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gsu-file-browser .gsu-row-meta,
.gsu-file-browser .gsu-row-size {
  flex-shrink: 0;
  color: var(--gsu-color-muted-text);
  font-size: 0.8125rem;
}
.gsu-file-browser .gsu-row-meta {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  width: 4.75rem;
}
.gsu-file-browser .gsu-row-size {
  width: 6rem;
  text-align: right;
}
.gsu-file-browser .gsu-row.gsu-selected-items {
  background-color: var(--gsu-color-highlight);
  box-shadow: inset 3px 0 0 var(--gsu-color-primary);
}

/* Folders / Items section headers with paging */
.gsu-file-browser .folder-header,
.gsu-file-browser .item-header {
  padding: 0.125rem 0.5rem;
  border: 0;
  border-bottom: 1px solid var(--gsu-color-border);
  background-color: var(--gsu-background-muted);
  color: var(--gsu-color-muted-text);
  font-size: 0.8125rem;
}
.gsu-file-browser .folder-header > .flex,
.gsu-file-browser .item-header > .flex,
.gsu-file-browser .folder-header .flex > div,
.gsu-file-browser .item-header .flex > div {
  align-items: center;
}
.gsu-file-browser .folder-header svg,
.gsu-file-browser .item-header svg {
  display: inline;
  color: var(--gsu-color-primary);
  vertical-align: middle;
}
.gsu-file-browser .folder-header .header,
.gsu-file-browser .item-header .header {
  color: inherit;
}
.gsu-file-browser .gsu-disabled-icon {
  color: var(--gsu-color-muted-text);
  opacity: 0.35;
}
.gsu-file-browser .number-input {
  margin: 0 0.25rem;
  padding: 0 0.25rem;
  border: 1px solid var(--gsu-color-border);
  border-radius: 4px;
  background-color: transparent;
  color: var(--gsu-color-text);
  text-align: center;
}

/* Selection field under the list, aligned with it */
.gsu-file-browser .gsu-selection {
  margin-top: 0.75rem;
  border: 0;
  background-color: transparent;
}
.gsu-file-browser .gsu-selection-label {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--gsu-color-muted-text);
  font-size: 0.8125rem;
}
.gsu-file-browser .gsu-selection .gsu-input {
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--gsu-color-border);
  border-radius: 4px;
  background-color: var(--gsu-background-muted);
  color: var(--gsu-color-text);
}
.gsu-file-browser .gsu-selection .gsu-input:focus {
  border-color: var(--gsu-color-primary);
  outline: none;
}
.gsu-file-browser .error-msg {
  margin-top: 0.5rem;
  font-size: 0.875rem;
}
</style>
