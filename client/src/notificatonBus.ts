import { GirderModel, RestClient } from '@girder/components/src';
import NotificationBus from '@girder/components/src/utils/notifications';

// TODO remove after GWC types are fixed
interface AugmentedRestClient extends RestClient {
  user: GirderModel;
}

export interface GirderNotification {
  _id: string;
  type: string;
  updated: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Register Girder 5 WebSocket notifications on the RestClient.
 *
 * Uses NotificationBus from @girder/components (girder-5-websocket-upgrade branch)
 * and forwards events to the RestClient for existing dive-dsa listeners.
 *
 * @param rc Girder RestClient
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function registerNotifications(_rc: any) {
  const rc: AugmentedRestClient = _rc;
  // Package types still describe EventSource; runtime uses WebSocket on this branch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bus = new (NotificationBus as any)(rc, { listenToRestClient: true }) as NotificationBus;

  // Girder 5 exposes /notifications/me (plural); patch until GWC branch matches.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (bus as any)._getWebSocketUrl = function getWebSocketUrl(this: NotificationBus) {
    const token = this.$rest.token;
    if (!token) {
      throw new Error('No authentication token available');
    }
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPath = this.$rest.apiRoot.replace(/\/api\/v1$/, '') || '';
    return `${wsProtocol}//${window.location.host}${wsPath}/notifications/me?token=${token}`;
  };

  const originalEmit = bus._emitNotification.bind(bus);
  bus._emitNotification = (notification: GirderNotification) => {
    originalEmit(notification);
    const { type } = notification;
    for (let i = type.indexOf('.'); i !== -1; i = type.indexOf('.', i + 1)) {
      rc.$emit(`message:${type.substring(0, i)}`, notification);
    }
    rc.$emit(`message:${type}`, notification);
    rc.$emit('message', notification);
  };

  return { connect: () => bus.connect(), disconnect: () => bus.disconnect() };
}
