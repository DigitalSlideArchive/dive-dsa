/**
 * Client UX for metadata ingest jobs: launch dialog with job link, poll until
 * complete, then status dialog with optional navigate-to-folder action.
 */
import type { PromptParams } from 'dive-common/vue-utilities/prompt-service';
import type { DiveMetadataIngestJob } from 'platform/web-girder/api/divemetadata.service';
import { waitForMetadataIngestJob } from 'platform/web-girder/api/divemetadata.service';

type PromptFn = (params: PromptParams) => Promise<boolean>;

export function metadataJobUrl(jobId: string): string {
  return `/girder/#job/${jobId}`;
}

export function metadataJobAbsoluteUrl(jobId: string): string {
  if (typeof window === 'undefined') {
    return metadataJobUrl(jobId);
  }
  return `${window.location.origin}${metadataJobUrl(jobId)}`;
}

export function summarizeIngestResult(result: Record<string, unknown>): string[] {
  const lines: string[] = [];
  if (typeof result.results === 'string' && result.results) {
    lines.push(result.results);
  }
  // Bulk update compact summary from worker
  if (result.results && typeof result.results === 'object' && !Array.isArray(result.results)) {
    const bulk = result.results as { rowCount?: number; statusCounts?: Record<string, number> };
    if (bulk.rowCount != null) {
      lines.push(`Bulk rows: ${bulk.rowCount}`);
    }
    if (bulk.statusCounts) {
      Object.entries(bulk.statusCounts).forEach(([status, count]) => {
        lines.push(`  ${status}: ${count}`);
      });
    }
  }
  if (typeof result.added === 'number') {
    lines.push(`Added: ${result.added}`);
  }
  if (typeof result.existing === 'number') {
    lines.push(`Existing / skipped: ${result.existing}`);
  }
  if (typeof result.datasetCount === 'number') {
    lines.push(`Datasets scanned: ${result.datasetCount}`);
  }
  if (typeof result.rowCount === 'number') {
    lines.push(`Rows processed: ${result.rowCount}`);
  }
  if (typeof result.dataFileName === 'string' && result.dataFileName) {
    lines.push(`Source file: ${result.dataFileName}`);
  }
  if (Array.isArray(result.created)) {
    lines.push(`Metadata folders created/updated: ${result.created.length}`);
  }
  if (Array.isArray(result.existing)) {
    lines.push(`Existing metadata entries: ${result.existing.length}`);
  }
  const { errors } = result;
  if (Array.isArray(errors) && errors.length) {
    lines.push(`Errors: ${errors.length}`);
    errors.slice(0, 3).forEach((err) => {
      lines.push(`  - ${String(err)}`);
    });
    if (errors.length > 3) {
      lines.push(`  … and ${errors.length - 3} more`);
    }
  }
  if (!lines.length) {
    lines.push('Metadata processing completed successfully.');
  }
  return lines;
}

export function resolveMetadataFolderId(result: Record<string, unknown>): string | null {
  if (typeof result.folderId === 'string' && result.folderId) {
    return result.folderId;
  }
  if (typeof result.metadataFolderId === 'string' && result.metadataFolderId) {
    return result.metadataFolderId;
  }
  const { created } = result;
  if (Array.isArray(created)) {
    const hit = created.find(
      (entry) => entry && typeof entry === 'object'
        && typeof (entry as { metadataFolderId?: string }).metadataFolderId === 'string',
    ) as { metadataFolderId?: string } | undefined;
    if (hit?.metadataFolderId) {
      return hit.metadataFolderId;
    }
  }
  const { existing } = result;
  if (Array.isArray(existing)) {
    const hit = existing.find(
      (entry) => entry && typeof entry === 'object'
        && typeof (entry as { metadataFolderId?: string }).metadataFolderId === 'string',
    ) as { metadataFolderId?: string } | undefined;
    if (hit?.metadataFolderId) {
      return hit.metadataFolderId;
    }
  }
  return null;
}

export interface NotifyMetadataIngestJobOptions {
  job: DiveMetadataIngestJob;
  prompt: PromptFn;
  /** Vue router with a push method (optional; used for Open Metadata). */
  router?: { push: (location: { name: string; params: { id: string } }) => unknown };
  /** Used when the job result does not include a folder id (e.g. bulk import). */
  fallbackFolderId?: string;
  /** Called after a successful job (before or after the completion dialog). */
  onSuccess?: (result: Record<string, unknown>, folderId: string | null) => void;
}

/**
 * Show launch dialog with job link, watch until terminal status, then show
 * completion / failure dialog with optional navigation to the metadata folder.
 */
export async function notifyAndWatchMetadataIngestJob(
  options: NotifyMetadataIngestJobOptions,
): Promise<Record<string, unknown> | null> {
  const {
    job, prompt, router, fallbackFolderId, onSuccess,
  } = options;
  const jobUrl = metadataJobUrl(job._id);
  const jobAbs = metadataJobAbsoluteUrl(job._id);

  const resultPromise = waitForMetadataIngestJob(job._id);

  const openJob = await prompt({
    title: 'Metadata processing started',
    text: [
      'Metadata processing has been launched as a background job.',
      `Title: ${job.title || 'DIVE Metadata'}`,
      '',
      'Open the job page to follow progress and logs:',
      jobAbs,
    ],
    confirm: true,
    positiveButton: 'Open Job',
    negativeButton: 'Continue',
    maxWidth: '560px',
  });
  if (openJob) {
    window.open(jobUrl, '_blank');
  }

  try {
    const result = await resultPromise;
    const folderId = resolveMetadataFolderId(result) || fallbackFolderId || null;
    const text = [
      ...summarizeIngestResult(result),
    ];
    if (folderId) {
      text.push('', 'You can open the metadata folder to review the results.');
    }
    const goToFolder = await prompt({
      title: 'Metadata processing complete',
      text,
      confirm: !!folderId,
      positiveButton: folderId ? 'Open Metadata' : 'OK',
      negativeButton: folderId ? 'Dismiss' : 'Cancel',
      maxWidth: '560px',
    });
    onSuccess?.(result, folderId);
    if (goToFolder && folderId && router) {
      await router.push({ name: 'metadata', params: { id: folderId } });
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const openFailedJob = await prompt({
      title: 'Metadata processing failed',
      text: [
        message,
        '',
        'Open the job page for full logs:',
        jobAbs,
      ],
      confirm: true,
      positiveButton: 'Open Job',
      negativeButton: 'Dismiss',
      maxWidth: '560px',
    });
    if (openFailedJob) {
      window.open(jobUrl, '_blank');
    }
    return null;
  }
}
