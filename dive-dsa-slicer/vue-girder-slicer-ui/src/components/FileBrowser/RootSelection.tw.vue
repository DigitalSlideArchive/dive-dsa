<script lang="ts">
import { PropType, computed, defineComponent } from 'vue'
import { mdiAccount, mdiChevronDown, mdiHome, mdiSitemap } from '@mdi/js';
import SvgIcon from '@jamescoyle/vue-icon';
import { GirderModel, GirderModelType} from '../../girderTypes';
export default defineComponent({
  components: {
    SvgIcon,
  },
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
    // Icon for the kind of root currently selected (home, collection or user)
    const rootIcon = computed(() => {
      if (props.value === props.home) {
        return mdiHome;
      }
      if (props.collections?.some((item) => item._id === props.value)) {
        return mdiSitemap;
      }
      return mdiAccount;
    });
    return {
      filteredUsers,
      rootIcon,
      mdiChevronDown,
      update,
    }
  }
});
</script>
<template>
  <div class="gsu-root-select">
    <span class="gsu-root-select-label">Location</span>
    <div class="gsu-root-select-field">
      <svg-icon
        type="mdi"
        :path="rootIcon"
        :size="20"
        class="gsu-root-select-icon"
      />
      <select
        :value="value"
        class="root-select"
        aria-label="Location: home, collection or user"
        title="Switch between Home, Collections and Users"
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
      <svg-icon
        type="mdi"
        :path="mdiChevronDown"
        :size="24"
        class="gsu-root-select-arrow"
      />
    </div>
  </div>
</template>
<style scoped>
/*
 * Plain CSS (not Tailwind utilities) so the host app's reset cannot hide the
 * control: Vuetify sets `select { appearance: none; border-style: none }`,
 * which removes the native arrow, so the arrow is drawn here instead.
 */
.gsu-root-select {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.gsu-root-select-label {
  flex-shrink: 0;
  color: var(--gsu-color-muted-text);
  font-size: 0.875rem;
}
.gsu-root-select-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}
.root-select {
  display: block;
  width: 100%;
  height: 36px;
  padding: 0 2.25rem 0 2.25rem;
  border: 1px solid var(--gsu-color-border);
  border-radius: 4px;
  background-color: var(--gsu-background-muted);
  color: var(--gsu-color-text);
  cursor: pointer;
  text-overflow: ellipsis;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}
.root-select:hover,
.root-select:focus {
  border-color: var(--gsu-color-primary);
  outline: none;
}
.root-select option,
.root-select optgroup {
  background-color: var(--gsu-color-background);
  color: var(--gsu-color-text);
}
.gsu-root-select-icon,
.gsu-root-select-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--gsu-color-text);
}
.gsu-root-select-icon {
  left: 0.5rem;
}
.gsu-root-select-arrow {
  right: 0.5rem;
}
</style>
