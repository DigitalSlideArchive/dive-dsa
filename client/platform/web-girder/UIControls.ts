import girderRest from 'platform/web-girder/plugins/girder';
import { PromptParams } from 'dive-common/vue-utilities/prompt-service';
import { AggregateMediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref } from 'vue';
import { useModeManager } from 'dive-common/use';
import { GoToFrameAction, TrackSelectAction, UIDIVEAction } from 'dive-common/use/useActions';

type ModeManagerType = ReturnType<typeof useModeManager>;

export interface UINotification {
    datasetId: string[];
    text: string;
    selectedFrame?: number;
    selectedTrack?: number;
    reloadAnnotations?: boolean;
    diveActions?: UIDIVEAction[];
}

export interface UINotificationParams {
  prompt: (params: PromptParams) => Promise<boolean>;
  aggregateController: Ref<AggregateMediaController>;
  handler : ModeManagerType['handler'];
  reloadAnnotations : () => Promise<void>;
  datasetId: Ref<string>;
}

const getActionText = (diveAction: UIDIVEAction) => {
  const text: string[] = [];
  if (diveAction.description) {
    text.push(diveAction.description);
  }

  if (diveAction.actions.length) {
    if (diveAction.shortcut) {
      let textShortcut = diveAction.shortcut.key;
      if (diveAction.shortcut.modifiers) {
        textShortcut = `${textShortcut}+${diveAction.shortcut.modifiers.join('+')}`;
      }
      text.push(`- Add shortcut Key: ${textShortcut} with Action(s)`);
    }
    for (let i = 0; i < diveAction.actions.length; i += 1) {
      const { action } = diveAction.actions[i];
      if (action.type === 'GoToFrame') {
        const goToFrame = action as GoToFrameAction;
        if (goToFrame.frame !== undefined && goToFrame.frame > 0) {
          text.push(`- Go To Frame: ${goToFrame.frame}`);
        } else {
          const trackSelection = action.track as TrackSelectAction;
          const direction = trackSelection.direction ? trackSelection.direction : 'next';
          text.push(`- Select the ${direction} track  where`);
          if (trackSelection.typeFilter) {
            text.push(`- Track Type includes: ${trackSelection.typeFilter.join(',')}`);
          }
          if (trackSelection.confidenceFilter) {
            text.push(`- Confidence Filter is greater than: ${trackSelection.confidenceFilter}`);
          }
          if (trackSelection.startFrame !== undefined) {
            if (trackSelection.startFrame === -1) {
              text.push('- Frame is greather than currently selected frame');
            } else {
              text.push(`- Frame is greather than: ${trackSelection.startFrame}`);
            }
          }
          if (trackSelection.startTrack !== undefined) {
            if (trackSelection.startFrame === -1) {
              text.push('- TrackId is greather than currently selected track');
            } else {
              text.push(`- TrackId is greather than: ${trackSelection.startTrack}`);
            }
          }
          if (trackSelection.attributes?.track) {
            const trackAttr = trackSelection.attributes.track;
            Object.entries(trackAttr).forEach(([key, val]) => {
              text.push(`- Find Track Attribute: ${key} with value ${val.op}  ${val.val}`);
            });
          }
          if (trackSelection.attributes?.detection) {
            const detectAttr = trackSelection.attributes.detection;
            Object.entries(detectAttr).forEach(([key, val]) => {
              text.push(`- Find Detection Attribute: ${key} with value ${val.op}  ${val.val}`);
            });
          }
        }
      }
    }
  }
  return text;
};

const initializeUINotificationService = (params: UINotificationParams) => {
  const {
    prompt, handler, aggregateController, reloadAnnotations, datasetId,
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
    if (notification.diveActions && notification.diveActions.length) {
      // We need to process these actions.
      for (let i = 0; i < notification.diveActions.length; i += 1) {
        for (let k = 0; k < notification.diveActions[i].actions.length; k += 1) {
          handler.processAction(notification.diveActions[i].actions[k], true, { frame: aggregateController.value.frame.value });
        }
      }
    }
  };

  girderRest.$on('message:ui_notification', async ({ data: notification }: { data: UINotification }) => {
    if (!notification.datasetId.includes(datasetId.value)) {
      return;
    }
    let text = [notification.text];
    if (notification.reloadAnnotations) {
      text.push('Reload the Annotations.  Most likely a task has created new annotations to load');
    } else {
      if (typeof (notification.selectedTrack) === 'number') {
        text.push(`Set the Selected TrackId to: ${notification.selectedTrack}`);
      }
      if (typeof (notification.selectedFrame) === 'number') {
        text.push(`Seeking Frame to: ${notification.selectedFrame}`);
      }
      if (notification.diveActions && notification.diveActions.length) {
        for (let i = 0; i < notification.diveActions.length; i += 1) {
          const actionText = getActionText(notification.diveActions[i]);
          text = text.concat(actionText);
        }
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
