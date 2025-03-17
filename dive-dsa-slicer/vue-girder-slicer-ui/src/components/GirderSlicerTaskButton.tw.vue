<script lang="ts">
import { Ref, computed, defineComponent, onMounted, ref } from "vue";
import { extractImageInfo } from "../utils";
import RestClient from "../api/girderRest";
import { useGirderSlicerApi } from "../api/girderSlicerApi";
import { mdiAlert, mdiChevronDown, mdiChevronRight } from "@mdi/js";
import SvgIcon from "@jamescoyle/vue-icon";
import { OnClickOutside } from '@vueuse/components'

type TaskHierarchy = Record<
  string,
  {
    tag: string;
    tasks: {
      imageBase: string;
      imageTag: string;
      _id: string;
      name: string;
      description: string;
    }[];
  }[]
>;
export default defineComponent({
  components: {
    SvgIcon,
    OnClickOutside,
  },
  props: {
    apiUrl: {
      type: String,
      default: "api/v1",
    },
    filter: {
      type: String,
      default: "",
    },
  },
  setup(props, { emit }) {
    const girderRest = new RestClient({ apiRoot: props.apiUrl });
    const loggedIn = computed(() => girderRest?.token);
    const slicerApi = useGirderSlicerApi(girderRest);
    const results: Ref<TaskHierarchy> = ref({});
    const clicked = ref(false);
    const getData = async () => {
      try {
        const response = await slicerApi.getSlicerList();
        // ground items by their image
        const taskHierarchy: TaskHierarchy = {};
        response.data.forEach((task) => {
          // Lets get the base image name
          const imageInfo = extractImageInfo(task.image);
          if (imageInfo) {
            // We create a root for it
            if (taskHierarchy[imageInfo.baseName] === undefined) {
              taskHierarchy[imageInfo.baseName] = [
                { tag: imageInfo.tag, tasks: [] },
              ];
            }
            const foundIndex = taskHierarchy[imageInfo.baseName].findIndex(
              (item) => item.tag === imageInfo.tag
            );
            if (foundIndex !== -1) {
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
    const select = (id: string) => {
      emit("selected", id);
    };
    onMounted(() => {
      getData();
    });
    return {
      results,
      mdiAlert,
      mdiChevronDown,
      mdiChevronRight,
      loggedIn,
      select,
      clicked,
    };
  },
});
</script>
<template>
  <div>
    <on-click-outside @trigger="clicked = false">
    <div v-if="loggedIn" class="dropdown inline-block relative w-56">
      <button
        class="bg-backgroundColor text-textColor font-semibold py-2 px-4 rounded inline-flex items-center
        rounded-sm flex items-center min-w-32"
        @click="clicked = true"
      >
        <span class="pr-1 font-semibold flex-1">Tasks</span>
        <span>
          <svg-icon type="mdi" :path="mdiChevronDown" :size="30" class="pb-1" />

        </span>
      </button>
      <ul
        v-if="clicked"
        class="absolute text-textColor"
      >
        <li
          class="dropdown w-56"
          v-for="(item, key) in results"
          :key="key"
        >
        <a class="rounded-t bg-backgroundColor hover:bg-bgMutedColor py-2 px-4 block whitespace-no-wrap" href="#">
            <span class="pr-1 flex-1"
              >{{ item.length === 1 ? `${key}:${item[0].tag}` : key }}
            </span>
            <span class="mr-auto">
            </span>
          </a>
          <ul
            v-if="item.length === 1"
            class="dropdown-content absolute hidden text-textColor left-44 top-0"
          >
            <li
              v-for="task in item[0].tasks"
              :key="task._id"
              class="bg-backgroundColor hover:bg-bgMutedColor py-2 px-4 block whitespace-no-wrap"
              @click="select(task._id)"
            >
              {{ task.name }}
            </li>
          </ul>
          <ul
            v-else
            class="dropdown-content absolute hidden text-textColor left-44 top-0"
          >
            <li
              v-for="tag in item"
              :key="tag.tag"
              class="dropdown w-56"
            >
            <a class="bg-backgroundColor hover:bg-bgMutedColor py-2 px-4 block whitespace-no-wrap" href="#">
                <span class="pr-1">{{ tag.tag }}</span>
                <span class="mr-auto">
                  <svg-icon type="mdi" :path="mdiChevronRight" :size="30" class="pb-1" style="display:inline" />

                </span>
              </a>
              <ul
                class="dropdown-content absolute hidden text-textColor left-44 top-0"
              >
                <li
                  v-for="task in tag.tasks"
                  :key="task._id"
                  @click="select(task._id)"
                  class="bg-backgroundColor hover:bg-bgMutedColor py-2 px-4 block whitespace-no-wrap"
                >
                  <a class="bg-backgroundColor hover:bg-bgMutedColor py-2 px-4 block whitespace-no-wrap" href="#">
                  {{ task.name }}
                  </a>
                </li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    </div>
    <div v-else>
      <button
        type="button"
        class="inline-block align-middle text-center select-none border font-normal whitespace-no-wrap py-2 px-4 rounded text-base leading-normal no-underline text-yellow-dark border-yellow bg-white hover:bg-yellow-light hover:text-yellow-darker"
        data-toggle=""
        data-placement="top"
        title="Not Logged In"
      >
        Error
        <svg-icon type="mdi" :path="mdiAlert" :size="30" class="pb-1" />
      </button>
    </div>
    </on-click-outside>
  </div>
</template>
<style scoped lang="scss">
.dropdown:hover > .dropdown-content {
	display: block;
}

</style>
