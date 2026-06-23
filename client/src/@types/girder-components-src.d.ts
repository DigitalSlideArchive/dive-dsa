// import * as gwc from '@girder/components';

declare module '@girder/components/src' {
  export * from '@girder/components';
  // eslint-disable-next-line no-restricted-exports
  export { default } from '@girder/components';
}

declare module '@girder/components/src/utils/notifications' {
  import Vue from 'vue';
  import { RestClient } from '@girder/components/src';

  export default class NotificationBus extends Vue {
    constructor(
      $rest: RestClient,
      opts?: {
        WebSocket?: typeof WebSocket;
        listenToRestClient?: boolean;
        reconnectInterval?: number;
        maxReconnectAttempts?: number;
      },
    );
    $rest: RestClient;
    connect(): void;
    disconnect(): void;
    _emitNotification(notification: Record<string, unknown>): void;
  }
}
