import { Transport } from "./transport";
import { GenericTransport } from "./transport-generic";

export function newWebTransport(): Transport {
  return new GenericTransport({
    EventSource: (window as any).EventSource,
    getEventSourceOpts: () => null,
    fetch: fetch as any /* woooo */,
    getFetchOpts: () => null,
  });
}
