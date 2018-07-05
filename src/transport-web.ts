import { Transport } from "./transport";
import { GenericTransport } from "./transport-generic";
import { Endpoint } from "./support";

export function newWebTransport(endpoint: Endpoint): Transport {
  return new GenericTransport(endpoint, {
    EventSource: (window as any).EventSource,
    eventSourceOpts: null,
    fetch: window.fetch as any,
    fetchOpts: null,
  });
}
