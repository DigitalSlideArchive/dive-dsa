import type { Module } from 'vuex';
import type { GirderMetadata } from 'platform/web-girder/constants';
import {
  getDataset, getDatasetMedia, getFolder, getDiveConfiguration,
} from 'platform/web-girder/api';
import { MultiType } from 'dive-common/constants';
import { DatasetMetaMutable } from 'dive-common/apispec';
import { DiveConfiguration } from 'vue-media-annotator/ConfigurationManager';
import type { DatasetState, RootState } from './types';


const datasetModule: Module<DatasetState, RootState> = {
  namespaced: true,
  state: {
    meta: null,
  },
  mutations: {
    set(state, { dataset, prevNext, hierarchy }:
      {
        dataset: GirderMetadata;
        prevNext?: DiveConfiguration['prevNext'];
        hierarchy?: DiveConfiguration['hierarchy'];
    }) {
      state.meta = dataset;
      if (prevNext) {
        state.prevNext = prevNext;
      }
      if (hierarchy) {
        state.hierarchy = hierarchy;
      }
    },
  },
  actions: {
    async load({ commit, dispatch }, datasetId: string): Promise<{
      metadata: GirderMetadata & DatasetMetaMutable;
      diveConfig: DiveConfiguration;
    }> {
      const [folder, metaStatic, diveConfig, media] = await Promise.all([
        getFolder(datasetId),
        getDataset(datasetId),
        getDiveConfiguration(datasetId),
        getDatasetMedia(datasetId),
      ]);
      const dsMeta = {
        ...metaStatic.data,
        ...media.data,
        videoUrl: media.data.video?.url,
        overlays: media.data.overlays,
      };
      // TODO remove when multi is supported in web
      if (dsMeta.type === MultiType) {
        throw new Error('multi is not supported on web yet');
      }
      commit('set', { dataset: dsMeta, prevNext: diveConfig.data.prevNext, hierarchy: diveConfig.data.hierarchy });
      const { parentId, parentCollection } = folder.data;
      if (parentId && parentCollection) {
        dispatch('Location/hydrate', {
          _id: parentId,
          _modelType: parentCollection,
        }, { root: true });
      } else {
        throw new Error(`dataset ${datasetId} was not a valid girder folder`);
      }
      return { metadata: dsMeta, diveConfig: diveConfig.data };
    },
  },
};

export default datasetModule;
