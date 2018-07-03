import { Transport } from "./transport";
import { GenericTransport } from "./transport-generic";
import EventSource = require("eventsource");
import nodeFetch = require("node-fetch");

export function newNodeTransport(): Transport {
  return new GenericTransport(EventSource, (nodeFetch as any) as typeof fetch);
}
