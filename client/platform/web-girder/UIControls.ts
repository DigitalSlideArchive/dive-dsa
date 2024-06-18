import girderRest from 'platform/web-girder/plugins/girder';

export interface UINotification {
    text: string;
    selectedFrame?: number;
    selectedTrack?: number;
}

const initializeUINotificationService = () => {
  girderRest.$on('message:ui_notification', ({ data: notification }: { data: UINotification }) => {
    console.log(notification);
  });
};

export default initializeUINotificationService;
