<script lang="ts">
import { Ref, computed, defineComponent, onMounted, ref } from "vue";
import { extractImageInfo } from "../utils";
import RestClient from "../api/girderRest";
import { SlicerImage, useGirderSlicerApi } from "../api/girderSlicerApi";
import { mdiAlert, mdiChevronDown, mdiChevronRight } from "@mdi/js";
import SvgIcon from "@jamescoyle/vue-icon";
import { cloneDeep } from 'lodash';
import { PropType } from "vue/types/v3-component-props";

interface TaskInfo {
    tag: string;
    tasks: {
      imageBase: string;
      imageTag: string;
      _id: string;
      name: string;
      description: string;
    }[];
}

type TaskHierarchy = Record<
  string,
  [TaskInfo]
>;
export default defineComponent({
  components: {
    SvgIcon,
  },
  props: {
    apiUrl: {
      type: String,
      default: "api/v1",
    },
    filter: {
      type: Function as PropType<(task: SlicerImage) => boolean>,
      default: (_task: SlicerImage) => true,
    },
  },
  setup(props, { emit }) {
    const girderRest = new RestClient({ apiRoot: props.apiUrl });
    const loggedIn = computed(() => girderRest?.token);
    const slicerApi = useGirderSlicerApi(girderRest);
    const results: Ref<TaskHierarchy> = ref({});
    const clicked: Ref<Record<string, boolean>> = ref({})
    const selected: Ref<null | string> = ref(null);
    const getData = async () => {
      try {
        const response = await slicerApi.getSlicerList();
        const filtered = response.data.filter((task) => props.filter(task));
        // ground items by their image
        const taskHierarchy: TaskHierarchy = {};
        filtered.forEach((task) => {
          // Lets get the base image name
          const imageInfo = extractImageInfo(task.image);
          if (imageInfo) {
            // We create a root for it
            if (taskHierarchy[imageInfo.baseName] === undefined) {
              clicked.value[imageInfo.baseName] = false;
              taskHierarchy[imageInfo.baseName] = [
                { tag: imageInfo.tag, tasks: [] },
              ];
            }
            const foundIndex = taskHierarchy[imageInfo.baseName].findIndex(
              (item) => item.tag === imageInfo.tag
            );
            if (foundIndex !== -1) {
              clicked.value[`${imageInfo.baseName}.${imageInfo.tag}`] = false;
              taskHierarchy[imageInfo.baseName][foundIndex].tasks.push({
                imageBase: imageInfo.baseName,
                imageTag: imageInfo.tag,
                _id: task._id,
                name: task.name,
                description: task.description,
              });
            } else if (foundIndex === -1) {
              taskHierarchy[imageInfo.baseName].push({
                tag: imageInfo.tag,
                tasks: [
                  {
                    imageBase: imageInfo.baseName,
                    imageTag: imageInfo.tag,
                    _id: task._id,
                    name: task.name,
                    description: task.description,
                  },
                ],
              });
            }
          }
        });
        results.value = taskHierarchy;
      } catch (err) {
        console.error("Cannot communicate with server");
      }
    };
    const select = (id: string, name: string) => {
      emit("selected", {id, name});
      selected.value = id;
    };
    onMounted(() => {
      getData();
    });
    const selectItem = (item: string) => {
        const tempClicked = cloneDeep(clicked.value);
        if (tempClicked[item]) {
            //Then we toggle it off and all children
            tempClicked[item] = false;
        } else {
            Object.keys(tempClicked).forEach((key) => tempClicked[key] = false );
            const splits = item.split('.');
            const builtString: string[] = [];
            splits.forEach((key) => {
                builtString.push(key);
                const testString = builtString.join('.');
                if (tempClicked[testString] !== undefined) {
                    tempClicked[testString] = true;
                }
            });
        }
        clicked.value = tempClicked;

    }
    return {
      results,
      mdiAlert,
      mdiChevronDown,
      mdiChevronRight,
      loggedIn,
      select,
      clicked,
      selectItem,
      selected,
    };
  },
});
</script>
<template>
  <div>
    <div v-if="loggedIn">
      <ul
        class="text-textColor"
      >
        <li
          v-for="(item, key) in results"
          :key="key"
        >
        <span class="gsu-menu-item rounded-t py-2 px-4 block whitespace-no-wrap" @click="selectItem(item.length === 1 ? `${key}.${item[0].tag}` : key )" >
            <span class="pr-1 flex-1"
              >{{ item.length === 1 ? `${key}:${item[0].tag}` : key }}
            </span>
            <span class="mr-auto">
                <svg-icon type="mdi" :path="clicked[item.length === 1 ? `${key}.${item[0].tag}` : key] ? mdiChevronDown : mdiChevronRight" :size="30" class="pb-1" style="display:inline" />
            </span>
        </span>
          <ul
            v-if="item.length === 1 && clicked[`${key}.${item[0].tag}`]"
            class="text-textColor"
          >
            <li
              v-for="task in item[0].tasks"
              :key="task._id"
              class="gsu-menu-item py-2 px-4 block whitespace-no-wrap pl-8"
              @click="select(task._id, `${key}:${item[0].tag} -> ${task.name}`)"
              :class="`${task._id === selected ? 'bg-highlightedColor': ''}`"
            >
              {{ task.name }}
            </li>
          </ul>
          <ul
            v-else-if="clicked[key] && item.length > 1"
            class="text-textColor"
          >
            <li
              v-for="tag in item"
              :key="tag.tag"
            >
            <span class="py-2 px-4 block whitespace-no-wrap pl-8" @click="selectItem(`${key}.${tag.tag}`)">
                <span class="pr-1">{{ tag.tag }}</span>
                <span class="mr-auto">
                  <svg-icon type="mdi" :path="clicked[`${key}.${tag.tag}`] ? mdiChevronDown : mdiChevronRight" :size="30" class="pb-1" style="display:inline" />

                </span>
            </span>
              <ul
                v-if="clicked[`${key}.${tag.tag}`]"
                class="text-textColor"
              >
                <li
                  v-for="task in tag.tasks"
                  :key="task._id"
                  @click="select(task._id,`${key}:${tag.tag} -> ${task.name}` )"
                  class="py-2 px-4 block whitespace-no-wrap pl-12"
                  :class="`${task._id === selected ? 'bg-bgMutedColor': ''}`"
                >
                  <span class=" py-2 px-4 block whitespace-no-wrap" href="#">
                  {{ task.name }}
                  </span>
                </li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    </div>
    <div v-else class="mx-6">
        <span>
            Error
            <svg-icon style="display:inline" type="mdi" color="orange" :path="mdiAlert" :size="30" class="pb-1" />
        </span>
        <div>The User is not logged in.</div>
    </div>
  </div>
</template>
<style scoped lang="scss">

</style>
