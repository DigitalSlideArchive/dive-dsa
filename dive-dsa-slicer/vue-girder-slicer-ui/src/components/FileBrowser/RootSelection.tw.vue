<script lang="ts">
import { PropType, computed, defineComponent } from 'vue'
import { GirderModel, GirderModelType} from '../../girderTypes';
export default defineComponent({
  props: {
    value: {
      type: String,
      required: true,
    },
    home: {
      type: String,
      required: true,
    },
    users: {
      type: Array as PropType<GirderModel[]>,
      required: true,
    },
    collections: {
      type: Array as PropType<GirderModel[]>,
      required: true,
    }
  },
  setup(props, { emit }) {
    const filteredUsers = computed(() => props.users?.filter((item) => item._id !== props.home));
    const update = (e: Event) => {
        let type: GirderModelType = 'user';
        const val = (e.target as HTMLSelectElement).value;
        let name = '';
        if (props.collections && props.users) {
            const findType = props.collections.concat(props.users)
            const found = findType.find((item) => item._id === val);
            if (found) {
                type = found._modelType;
                if (type === 'user') {
                    name = `${found.firstName} ${found.lastName}`
                } else {
                    name = found.name;
                }
            }
        }
        emit('change', {val, type, name});
    }
    return {
      filteredUsers,
      update,
    }
  }
});
</script>
<template>
  <select
    :value="value"
    class="root-select bg-backgroundColor border-solid border-2 border-bgMutedColor"
    @change="update($event)"
  >
    <option :value="home">
      Home
    </option>
    <optgroup label="Collections">
      <option
        v-for="item in collections"
        :key="item._id"
        :value="item._id"
      >
        {{ item.name }}
      </option>
    </optgroup>
    <optgroup label="Users">
      <option
        v-for="item in filteredUsers"
        :key="item._id"
        :value="item._id"
      >
        {{ item.login }}
      </option>
    </optgroup>
  </select>
</template>
<style scoped>
.root-select {
  height: 34px;
}
</style>
