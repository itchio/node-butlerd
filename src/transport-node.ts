import { Transport, BaseTransport } from "./transport";
import { GenericTransport } from "./transport-generic";
import EventSource = require("eventsource");
import fetch = require("node-fetch");
import { Endpoint } from "./support";

export function newNodeTransport(endpoint: Endpoint): Transport {
  const ca = Buffer.from(endpoint.https.ca, "base64");

  return new GenericTransport(endpoint, {
    EventSource,
    eventSourceOpts: {},
    fetch: fetch as any,
    fetchOpts: {},
  });
}

class NodeTransport extends BaseTransport {
  constructor(endpoint: Endpoint) {
    super(endpoint);
  }
}
