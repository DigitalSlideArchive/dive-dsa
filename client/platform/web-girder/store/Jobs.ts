import { Store, Module } from 'vuex';
import { GirderJob } from '@girder/components/src';
import { all } from '@girder/components/src/components/Job/status';
import Vue from 'vue';

import eventBus from 'platform/web-girder/eventBus';
import girderRest from 'platform/web-girder/plugins/girder';
import { RootState, JobState } from './types';

const JobStatus = all();
const NonRunningStates = [
  JobStatus.CANCELED.value,
  JobStatus.ERROR.value,
  JobStatus.SUCCESS.value,
];

type DiveGirderJob = GirderJob & { type?: string; title?: string; dataset_id?: string };

function datasetIdOf(job: DiveGirderJob): string | null {
  if (job.dataset_id == null || job.dataset_id === '') {
    return null;
  }
  return String(job.dataset_id);
}

function applyJobUpdate(
  commit: (type: string, payload?: unknown) => void,
  job: DiveGirderJob,
) {
  commit('setJobState', { jobId: job._id, value: job.status });
  const datasetId = datasetIdOf(job);
  if (datasetId) {
    commit('setDatasetStatus', { datasetId, status: job.status, jobId: job._id });
    if (NonRunningStates.includes(job.status)) {
      commit('setCompleteJobsInfo', {
        datasetId,
        type: job.type,
        title: job.title,
        success: job.status === JobStatus.SUCCESS.value,
      });
    }
  }
}

const jobModule: Module<JobState, RootState> = {
  namespaced: true,
  state: {
    jobIds: {},
    datasetStatus: {},
    completeJobsInfo: {},
  },
  getters: {
    runningJobIds(state) {
      return Object.values(state.jobIds).filter((v) => !NonRunningStates.includes(v)).length >= 1;
    },
    datasetRunningState: (state) => (datasetId: string) => {
      if (datasetId in state.datasetStatus
        && !NonRunningStates.includes(state.datasetStatus[datasetId].status)) {
        return `/girder/#job/${state.datasetStatus[datasetId].jobId}`;
      }
      return false;
    },
    datasetCompleteJobs: (state) => (datasetId: string) => {
      if (datasetId in state.completeJobsInfo) {
        return (state.completeJobsInfo[datasetId]);
      }
      return false;
    },
  },
  mutations: {
    setJobState(state, { jobId, value }: { jobId: string; value: number }) {
      Vue.set(state.jobIds, jobId, value);
    },
    setDatasetStatus(state, { datasetId, status, jobId }:
      { datasetId: string; status: number; jobId: string }) {
      Vue.set(state.datasetStatus, datasetId, { status, jobId });
    },
    setCompleteJobsInfo(state, {
      datasetId, type, title, success,
    }:
      { datasetId: string; type: string; title: string; success: boolean }) {
      Vue.set(state.completeJobsInfo, datasetId, { type, title, success });
    },
    removeCompleteJobsInfo(state, { datasetId }: { datasetId: string }) {
      if (datasetId in state.completeJobsInfo) {
        Vue.delete(state.completeJobsInfo, datasetId);
      }
    },
  },
  actions: {
    removeCompleteJob({ commit }, { datasetId }: {datasetId: string}) {
      commit('removeCompleteJobsInfo', { datasetId });
    },
    /**
     * Optimistically mark jobs as running so Jobs tab / folder spinners update
     * immediately after postprocess. Live status still comes from websockets
     * (same as ../dive useJobs), not from polling.
     */
    trackJobs({ commit }, {
      jobIds, datasetId, status = JobStatus.QUEUED.value,
    }: { jobIds: string[]; datasetId?: string; status?: number }) {
      jobIds.forEach((jobId) => {
        const id = String(jobId);
        commit('setJobState', { jobId: id, value: status });
        if (datasetId) {
          commit('setDatasetStatus', { datasetId: String(datasetId), status, jobId: id });
        }
      });
    },
    updateJobs({ commit }) {
      const getJobs = async () => {
        const { data: runningJobs } = await girderRest.get<DiveGirderJob[]>('/job', {
          params: {
            statuses: `[${JobStatus.RUNNING.value}, ${JobStatus.QUEUED.value}, ${JobStatus.INACTIVE.value}]`,
          },
        });
        runningJobs.forEach((job) => applyJobUpdate(commit, job));
      };
      return getJobs();
    },
  },
};

/**
 * Match ../dive useJobs.initJobs: seed from GET /job, then rely on
 * girderRest `message:job_status` websocket events (no polling).
 * Every status event refreshes the data browser so Launch Annotator appears
 * when convert sets meta.annotate.
 */
export async function init(store: Store<RootState>) {
  function updateJob(job: DiveGirderJob) {
    store.commit('Jobs/setJobState', { jobId: job._id, value: job.status });
    const datasetId = datasetIdOf(job);
    if (datasetId) {
      store.commit('Jobs/setDatasetStatus', { datasetId, status: job.status, jobId: job._id });
      if (job.type !== undefined && NonRunningStates.includes(job.status)) {
        store.commit('Jobs/setCompleteJobsInfo', {
          datasetId,
          type: job.type,
          title: job.title,
          success: job.status === JobStatus.SUCCESS.value,
        });
      }
    }
  }

  girderRest.$on('message:job_status', ({ data: job }: { data: DiveGirderJob }) => {
    updateJob(job);
    eventBus.$emit('refresh-data-browser');
  });

  try {
    const { data: runningJobs } = await girderRest.get<DiveGirderJob[]>('/job', {
      params: {
        statuses: `[${JobStatus.RUNNING.value}, ${JobStatus.QUEUED.value}, ${JobStatus.INACTIVE.value}]`,
      },
    });
    runningJobs.forEach(updateJob);
  } catch {
    // Token may not be ready yet; login / main bootstrap will refetch.
  }
}

export default jobModule;
