import JobStatus from '@girder/jobs/JobStatus';

const jobPluginIsCancelable = JobStatus.isCancelable;
JobStatus.isCancelable = function (job) {
    if (job.get('type').startsWith('Dive Metadata Slicer CLI Batch')) {
        return ![JobStatus.CANCELED, JobStatus.WORKER_CANCELING || 824,
            JobStatus.SUCCESS, JobStatus.ERROR].includes(job.get('status'));
    }
    return jobPluginIsCancelable(job);
};