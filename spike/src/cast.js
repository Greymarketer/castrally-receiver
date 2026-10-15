// @ts-check
// CAF receiver wiring. The namespace listener and options are set BEFORE start(),
// otherwise the platform never advertises the namespace and drops the phone's messages.

export const NS = 'urn:x-cast:com.castroom.rally';

/** The Cast SDK only works inside a Cast device (its user agent carries "CrKey"). */
export const isCastDevice = () => /CrKey/.test(navigator.userAgent) && !!(/** @type {any} */ (window).cast?.framework);

/**
 * @param {{ onMessage: (senderId: string, data: any) => void, onEvent: (type: string, detail: string) => void, debug: boolean }} handlers
 * @returns {{ send: (data: object) => void, senderCount: () => number } | null}
 */
export function startCast({ onMessage, onEvent, debug }) {
  const cast = /** @type {any} */ (window).cast;
  if (!cast?.framework) return null;
  const context = cast.framework.CastReceiverContext.getInstance();
  const E = cast.framework.system.EventType;

  context.addCustomMessageListener(NS, (event) => onMessage(event.senderId, event.data));
  for (const type of [E.READY, E.SENDER_CONNECTED, E.SENDER_DISCONNECTED, E.SHUTDOWN, E.VISIBILITY_CHANGED, E.STANDBY_CHANGED, E.ERROR]) {
    context.addEventListener(type, (event) => onEvent(type, describe(event)));
  }
  if (debug) {
    context.addEventListener(E.READY, () => {
      const logger = cast.debug.CastDebugLogger.getInstance();
      logger.setEnabled(true);
      logger.showDebugLogs(true);
    });
  }

  // Undocumented but exported: without it the framework calls window.close() when the last
  // sender disconnects on purpose, which would end the soak and wipe the results.
  if (typeof context.setLastSenderDisconnectedHandler === 'function') context.setLastSenderDisconnectedHandler(() => {});

  const options = new cast.framework.CastReceiverOptions();
  options.disableIdleTimeout = true; // no media plays, so the platform must not kill us as idle
  options.customNamespaces = { [NS]: cast.framework.system.MessageType.JSON };
  context.start(options);

  return {
    send: (data) => context.sendCustomMessage(NS, undefined, data), // undefined senderId = broadcast
    senderCount: () => context.getSenders().length,
  };
}

function describe(event) {
  const parts = [];
  if (event.senderId) parts.push(event.senderId);
  if (event.reason !== undefined) parts.push(`reason=${event.reason}`);
  if (event.isVisible !== undefined) parts.push(`visible=${event.isVisible}`);
  if (event.isStandby !== undefined) parts.push(`standby=${event.isStandby}`);
  if (event.data?.message) parts.push(event.data.message);
  return parts.join(' ');
}
