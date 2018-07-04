import { Transport } from "./transport";
import { GenericTransport } from "./transport-generic";

export function newWebTransport(): Transport {
  return new GenericTransport({
    EventSource: (window as any).EventSource,
    getEventSourceOpts: () => null,
    // see https://github.com/orbitjs/orbit/issues/452
    fetch: window.fetch.bind(window) as any /* woooo */,
    getFetchOpts: () => null,
  });
}
