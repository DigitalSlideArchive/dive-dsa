<script lang='ts'>
  import {defineComponent} from 'vue';
  import { mdiClose } from '@mdi/js';
  import SvgIcon from '@jamescoyle/vue-icon';

export default defineComponent({
    components: {
      SvgIcon
    },
    props: {
        isVisible: {
            type: Boolean,
            default: false,
        },
        disabledConfirm: {
          type: Boolean,
          default: true,
        }
    },
    setup(_, { emit}) {
        const cancel = () => {
            emit('cancel')
        }
        const confirm = () => {
            emit('confirm')
        }
        return {
            cancel,
            confirm,
            mdiClose,

        }
    }
})
</script>

<template>
<div v-if="isVisible">
    <div class="fixed inset-0 z-50 flex justify-center items-center ">
      <div class="gsu-card flex flex-col max-w-5xl rounded-lg shadow-lg">
        <!-- Header -->
        <div class="p-5">
          <div class="grid grid-cols-12">
            <span class="col-span-10 text-xl my-2 ml-5">
              <slot name="header">
              <h3 class="text-2xl font-semibold">Modal Header</h3>
            </slot>
            </span>
            <span class="col-start-12 col-span-1 justify-self-end mr-5 my-2	" @click="$emit('cancel')">
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
        </div>
        
        <slot name="body">
          <div class="p-6">
            <p>This is a modal body content. Let's make this line a bit longer to see the width.</p>
          </div>
        </slot>
        
        <div class="p-6 flex justify-end items-center">
          <button class="bg-red-500 border-solid border-2 border-borderColor font-bold py-2 px-4 rounded" @click="cancel">Cancel</button>
          <button 
            class=" btn ml-2 font-bold py-2 px-4 rounded"
            :class="{ 'gsu-disabled-button': disabledConfirm, 'gsu-btn-accept': !disabledConfirm }"
            @click="!disabledConfirm && confirm()"
          >Confirm</button>
        </div>
      </div>
    </div>
    <div class="opacity-25 fixed inset-0 z-40 bg-black"></div>
  </div>
</template>