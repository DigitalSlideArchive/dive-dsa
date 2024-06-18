import girderRest from 'platform/web-girder/plugins/girder';
import { PromptParams } from 'dive-common/vue-utilities/prompt-service';
import { AggregateMediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref } from 'vue';
import { useModeManager } from 'dive-common/use';

type ModeManagerType = ReturnType<typeof useModeManager>;

export interface UINotification {
    datasetId: string[];
    text: string;
    selectedFrame?: number;
    selectedTrack?: number;
    reloadAnnotations?: boolean;
}

export interface UINotificationParams {
  prompt: (params: PromptParams) => Promise<boolean>;
  aggregateController: Ref<AggregateMediaController>;
  handler : ModeManagerType['handler'];
  reloadAnnotations : () => Promise<void>;
}

const initializeUINotificationService = (params: UINotificationParams) => {
  const {
    prompt, handler, aggregateController, reloadAnnotations,
  } = params;
  const processActions = (notification: UINotification) => {
    if (notification.reloadAnnotations) {
      reloadAnnotations();
      return;
    }
    if (typeof (notification.selectedTrack) === 'number') {
      handler.trackSelect(notification.selectedTrack, false);
    }
    if (typeof (notification.selectedFrame) === 'number') {
      aggregateController.value.seek(notification.selectedFrame);
    }
  };
  girderRest.$on('message:ui_notification', async ({ data: notification }: { data: UINotification }) => {
    const text = [notification.text];
    if (notification.reloadAnnotations) {
      text.push('Reload the Annotations.  Most likely a task has created new annotations to load');
    } else {
      if (typeof (notification.selectedTrack) === 'number') {
        text.push(`Set the Selected TrackId to: ${notification.selectedTrack}`);
      }
      if (typeof (notification.selectedFrame) === 'number') {
        text.push(`Set the Selected Frame to: ${notification.selectedFrame}`);
      }
    }
    text.push('Hit accept to process these actions');
    const result = await prompt({
      title: 'User Notification',
      text,
      confirm: true,
      positiveButton: 'Accept',
      negativeButton: 'Cancel',
    });
    if (!result) {
      return;
    }
    // Process Actions
    processActions(notification);
  });
};

export default initializeUINotificationService;
