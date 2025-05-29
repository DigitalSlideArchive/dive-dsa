import { reactive, Component } from 'vue';
/* Components */
import TypeThreshold from 'dive-common/components/TypeThreshold.vue';
import ImageEnhancements from 'vue-media-annotator/components/ImageEnhancements.vue';
import GroupSidebar from 'dive-common/components/GroupSidebar.vue';
import AttributesSideBar from 'dive-common/components/Attributes/AttributesSideBar.vue';
import AtributeUserReview from 'dive-common/components/Attributes/AttributeUserReview.vue';
import MultiCamTools from 'dive-common/components/MultiCamTools.vue';
import DatasetInfo from 'dive-common/components/DatasetInfo.vue';
import CustomUIBase from 'dive-common/components/CustomUI/CustomUIBase.vue';

interface ContextState {
  last: string;
  active: string | null;
  subCategory: string | null;
  width?: number;
}

interface ComponentMapItem {
  description: string;
  component: Component;
  width?: number;
}

const state: ContextState = reactive({
  last: 'TypeThreshold',
  active: null,
  subCategory: null,
  width: 300,
});

const componentMap: Record<string, ComponentMapItem> = {
  [DatasetInfo.name]: {
    description: 'Dataset Info',
    component: DatasetInfo,
    width: 300,
  },
  [TypeThreshold.name]: {
    description: 'Threshold Controls',
    component: TypeThreshold,
    width: 300,
  },
  [ImageEnhancements.name]: {
    description: 'Image Enhancements',
    component: ImageEnhancements,
    width: 300,
  },
  [GroupSidebar.name]: {
    description: 'Group Manager',
    component: GroupSidebar,
    width: 300,
  },
  [MultiCamTools.name]: {
    description: 'Multi Camera Tools',
    component: MultiCamTools,
    width: 300,
  },
  [AttributesSideBar.name]: {
    description: 'Attribute Details',
    component: AttributesSideBar,
    width: 300,
  },
  [AtributeUserReview.name]: {
    description: 'Attribute User Review',
    component: AtributeUserReview,
    width: 300,
  },
  [CustomUIBase.name]: {
    description: 'Custom UI',
    component: CustomUIBase,
    width: 300,
  },

};

function register(item: ComponentMapItem) {
  componentMap[item.component.name || 'default'] = item;
}

function unregister(item: ComponentMapItem) {
  if (componentMap[item.component.name || 'default']) {
    delete componentMap[item.component.name || 'default'];
  }
}

function resetActive() {
  if (Object.values(componentMap).length) {
    state.last = Object.values(componentMap)[0].component.name || 'default';
    state.active = null;
  }
}

function getComponents() {
  const components: Record<string, Component> = {};
  Object.values(componentMap).forEach((v) => {
    if (v.component.name) {
      components[v.component.name] = v.component;
    }
  });
  return components;
}

function toggle(active?: string | null) {
  if (active === undefined) {
    if (state.active) {
      state.active = null;
    } else {
      state.active = state.last;
    }
  } else if (active && state.active === active) {
    state.active = null;
  } else if (active === null || active in componentMap) {
    if (active !== null && active in componentMap && componentMap[active].width) {
      state.width = componentMap[active].width;
    }
    state.active = active;
    if (active) {
      state.last = active;
    }
  } else {
    throw new Error(`${active} is not a valid context component`);
  }
  window.dispatchEvent(new Event('resize'));
}

function openClose(active: string, action: boolean, subCategory?: string) {
  if (action) {
    if (state.active) {
      state.last = state.active;
    }
    state.active = active;
  } else {
    if (state.active) {
      state.last = state.active;
      state.subCategory = null;
    }
    state.active = null;
  }
  if (subCategory) {
    state.subCategory = subCategory;
  }
  window.dispatchEvent(new Event('resize'));
}

function nudgeWidth(width: number) {
  state.width = width;
  window.dispatchEvent(new Event('resize'));
}

export default {
  toggle,
  openClose,
  register,
  unregister,
  getComponents,
  resetActive,
  nudgeWidth,
  componentMap,
  state,
};
