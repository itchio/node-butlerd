import { Transport } from "./transport";
import { GenericTransport } from "./transport-generic";
import EventSource = require("eventsource");
import fetch = require("node-fetch");
import { Endpoint } from "./support";
import { Agent } from "https";

export function newNodeTransport(endpoint: Endpoint): Transport {
  const ca = Buffer.from(endpoint.https.ca, "base64");

  const agent = new Agent({ ca });

  return new GenericTransport(endpoint, {
    EventSource,
    eventSourceOpts: {
      https: { ca },
    },
    fetch: fetch as any /* woo */,
    fetchOpts: { agent },
  });
}
