import girderRest from 'platform/web-girder/plugins/girder';
import { PromptParams } from 'dive-common/vue-utilities/prompt-service';

export interface UINotification {
    datasetId: string[];
    text: string;
    selectedFrame?: number;
    selectedTrack?: number;
    reloadAnnotations?: boolean;
}

const initializeUINotificationService = (prompt: (params: PromptParams) => Promise<boolean>) => {
  const processActions = (notification: UINotification) => {
    console.log(notification);
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
      text: [`${notification.text}`,
      ],
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
