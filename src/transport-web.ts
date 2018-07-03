import { Transport } from "./transport";
import { GenericTransport } from "./transport-generic";

export function newWebTransport(): Transport {
  return new GenericTransport((window as any).EventSource, fetch);
}
