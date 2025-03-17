<script lang="ts">
import { PropType, Ref, computed, defineComponent, ref, watch } from 'vue';
import parse from '../parser/parse';
import GirderControlsPanel from './GirderControlsPanel.tw.vue';
import RestClient from '../api/girderRest';
import { JobResponse, useGirderSlicerApi } from '../api/girderSlicerApi';
import type { XMLParameters, XMLSpecification } from '../parser/parserTypes';
import SvgIcon from '@jamescoyle/vue-icon';
import { mdiClose } from '@mdi/js';
export default defineComponent({
  name:'GirderSlicerTaskCard',
  compatConfig: { mode: 2 },
  components: {
    GirderControlsPanel,
    SvgIcon
  },
  props: {
    apiUrl: {
      type: String,
      default: 'api/v1',
    },
    taskId: {
      type: String as PropType<string | null>,
      default: '64e8aff6072d5e5fbb8719aa'
    },
    defaults: {
        type: Function as PropType<(item: XMLParameters) => undefined | null | XMLParameters>,
        default: (_item: XMLParameters) => undefined,
    }
  },
  setup(props, { emit }) {
    const girderRest = new RestClient({apiRoot: props.apiUrl});
    girderRest
    const loggedIn = computed(() => girderRest?.token);
    const result: Ref<XMLSpecification | null> = ref(null);
    const jobData: Ref<null | JobResponse> = ref(null)
    const slicerApi = useGirderSlicerApi(girderRest);
    const getData = async () => {
      if (props.taskId) {
        const response = await slicerApi.getSlicerXML(props.taskId);
        const parseParams = parse(response.data);
        // We need to assign default values if they exists
        const updateParams: {panelIndex: number, groupIndex: number, parameterIndex: number, value: XMLParameters}[] = [];
        parseParams.panels.forEach((panel, panelIndex) => {
          panel.groups.forEach((group, groupIndex) => {
            group.parameters.forEach((parameter, parameterIndex) => {
              const paramResult = props.defaults(parameter);
              if (paramResult && parseParams) {
                // Reset the parameter
                updateParams.push({
                  panelIndex,
                  groupIndex,
                  parameterIndex,
                  value: paramResult,
                });
              }
            });
          });
        });
        updateParams.forEach((item) => {
          if (parseParams) {
            parseParams.panels[item.panelIndex].groups[item.groupIndex].parameters[item.parameterIndex] = item.value;
          }
        });
        result.value = parseParams;
      }
    }
    if (props.taskId) {
      getData();
    }
    watch(() => props.taskId, () => {
      getData();
    })
    const updateParameters = (e: XMLParameters[], index: number) => {
      if (result.value) {
        result.value.panels[index].groups[0].parameters = e;
      }
    }
    const runTask = async () => {
      // First we need to validate the task has all parameters required.
      if (result.value && props.taskId) {
        const resp = await slicerApi.runTask(result.value, props.taskId);
        if (resp) {
          console.log(resp);
          jobData.value = resp;
          emit('run-task', jobData.value);
        }
      }
    }
    const processInput = async (name: string) => {
      if (result.value) {
        await slicerApi.processInput(result.value, name);
      }
    }

    const cancel = () => {
      result.value = null;
      emit('cancel')
    }
    return {
      result,
      runTask,
      cancel,
      updateParameters,
      processInput,
      jobData,
      loggedIn,
      mdiClose,
    }
  }
});
</script>
<template>
  <div
    v-if="result"
    class="gsu-card relative flex flex-col min-w-0 rounded break-words border pa-2"
  >
    <div class="flex-auto p-6">
      <div class="grid grid-cols-12 gap-4 pb-2">
        <span class="col-span-12">
          <h5>
            {{ result.title }}
          </h5>
        </span>
      </div>
      <div
        v-if="jobData"
        class="mb-3 flex flex-wrap justify-content-left g-0"
      >
        <div
          class="relative px-3 py-3 mb-4 border rounded text-green-darker border-green-dark bg-green-lighter  opacity-0 opacity-100 block"
          role="alert"
        >
          <span>{{ jobData.title }} running</span>
          <svg-icon
            type="mdi"
            :path="mdiClose"
            :size="30"
            class="pb-2 gsu-icon gsu-clickable"
            data-dismiss="modal"
            aria-label="Close"
            style="float:right"
            @click="jobData = null"
          >
            <span aria-hidden="true">&times;</span>
          </svg-icon>
        </div>
      </div>
      <p class="mb-0">
        {{ result.description }}
      </p>
      <GirderControlsPanel
        v-for="(panel, index) in result.panels"
        :key="`panel_${index}`"
        :panel="panel"
        :collapse-override="!!jobData"
        @change="updateParameters($event, index)"
        @input-selected="processInput($event)"
      />
    </div>
    <div class="flex-auto p-6">
      <div class="grid gap-4 pb-2 justify-items-end">
        <span>
          <button
            type="button"
            class="bg-red-500 border-solid border-borderColor font-bold py-2 px-4 mx-2 rounded border-2"
            @click="cancel()"
          >
            Cancel
          </button>
          <button
            type="button"
            class="gsu-btn-accept font-bold py-2 px-4 mx-2 rounded border-2"
            @click="runTask()"
          >
            Run
          </button>
        </span>
      </div>
    </div>
  </div>
</template>
<style scoped>
</style>
