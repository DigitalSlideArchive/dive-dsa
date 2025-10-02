import type { GirderModel, GirderModelType } from '@girder/components/src';
import { inject } from 'vue';
import type { BrandData, DIVEGirderConfig } from 'platform/web-girder/api';
import type { GirderMetadata } from 'platform/web-girder/constants';
import { DiveConfiguration } from 'vue-media-annotator/ConfigurationManager';
import { Store } from 'vuex';

/**
 * Location can be either
 *  a proper girder model,
 *  a root virtual model,
 *  or a simplified id/type pair.
 * These types are mutually exclusive.
 */
export type RootlessLocationType = GirderModel | { _id: string; _modelType: GirderModelType, parentId?: string | null };
export type LocationType = RootlessLocationType | { type: 'collections' | 'users' | 'root' };
export interface LocationState {
  location: LocationType | null;
  selected: GirderModel[];
}

export interface DatasetState {
  meta: GirderMetadata | null;
  prevNext?: DiveConfiguration['prevNext'];
  hierarchy?: DiveConfiguration['hierarchy'];
}

export interface BrandState {
  brandData: BrandData;
}

export interface DIVEGirderState {
  girderState: DIVEGirderConfig;
}

export interface UserState {
  user: null | {
    admin: boolean;
    email: string;
    firstName: string;
    login: string;
    lastName: string;
    status: string;
  };
}

export interface JobState {
  jobIds: Record<string, number>;
  datasetStatus: Record<string, {status: number; jobId: string}>;
  completeJobsInfo: Record<string, {type: string; title: string; success: boolean}>;
}

export interface RootState {
  Location: LocationState;
  Dataset: DatasetState;
  Brand: BrandState;
  User: UserState;
  GirderConfig: DIVEGirderState;
}

export function useStore(): Store<RootState> {
  const store: Store<RootState> | undefined = inject('store');
  if (store === undefined) {
    throw new Error('Store was undefined');
  }
  return store;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isGirderModel(value: any): value is GirderModel {
  return value._id && value._modelType;
}
