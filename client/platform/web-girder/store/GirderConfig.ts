import { merge } from 'lodash';
import { Module } from 'vuex';

import { getDIVEGirderConfig, DIVEGirderConfig } from 'platform/web-girder/api';
import type { DIVEGirderState, RootState } from './types';

const girderModule: Module<DIVEGirderState, RootState> = {
  namespaced: true,
  state: {
    girderState: {
    },
  },
  mutations: {
    setDIVEGirderConfig(state, data: DIVEGirderConfig) {
      state.girderState = merge(state.girderState, data);
    },
  },
  actions: {
    async loadDIVEGirderConfig({ commit }) {
      commit('setDIVEGirderConfig', (await getDIVEGirderConfig()).data);
    },
  },
};

export default girderModule;
