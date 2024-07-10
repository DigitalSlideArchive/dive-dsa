import girderRest from 'platform/web-girder/plugins/girder';
import { PromptParams } from 'dive-common/vue-utilities/prompt-service';
import { AggregateMediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref, ref } from 'vue';
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
      if (diveAction.applyConfig) {
        text.push('- This shortcut will be added to the configuration');
      }
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

export interface UseUINotificationType {
  diveActionShortcuts: Ref<UIDIVEAction[]>;
}

const getDiveActionShortcutString = (diveActionShortcut: UIDIVEAction) => {
  let bind: string = '';
  if (diveActionShortcut.shortcut) {
    bind = diveActionShortcut.shortcut.key.toLocaleLowerCase();
    if (diveActionShortcut.shortcut.modifiers) {
      bind = `${diveActionShortcut.shortcut.modifiers?.join('+')}+${bind}`;
    }
  }
  return bind;
};

const findExistingShortcut = (existing: UIDIVEAction[], newAction: UIDIVEAction) => existing.findIndex((item) => {
  const newActionKey = getDiveActionShortcutString(newAction);
  if (getDiveActionShortcutString(item) === newActionKey) {
    return true;
  }
  return false;
});

const useUINotifications = (params: UINotificationParams): UseUINotificationType => {
  const diveUIActionShortcuts: Ref<UIDIVEAction[]> = ref([]);
  const initializeUINotificationService = (params: UINotificationParams) => {
    const {
      prompt, handler, aggregateController, reloadAnnotations, datasetId,
    } = params;

    const processedShortcuts: UIDIVEAction[] = [];
    const processActions = (notification: UINotification): UIDIVEAction[] => {
      if (notification.reloadAnnotations) {
        reloadAnnotations();
        return [];
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
            if (!notification.diveActions[i].shortcut) {
              handler.processAction(notification.diveActions[i].actions[k], true, { frame: aggregateController.value.frame.value });
            } else {
              processedShortcuts.push(notification.diveActions[i]);
            }
          }
        }
      }
      return processedShortcuts;
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
      const shortcuts = processActions(notification);
      for (let i = 0; i < shortcuts.length; i += 1) {
        const newIndex = findExistingShortcut(diveUIActionShortcuts.value, shortcuts[i]);
        if (newIndex !== -1) {
          diveUIActionShortcuts.value.splice(newIndex, 1, shortcuts[i]);
        } else {
          diveUIActionShortcuts.value.push(shortcuts[i]);
        }
      }
    });
  };

  initializeUINotificationService(params);
  return { diveActionShortcuts: diveUIActionShortcuts };
};

export default useUINotifications;
