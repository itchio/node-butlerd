import { Transport } from "./transport";
import { GenericTransport } from "./transport-generic";
import EventSource = require("eventsource");
import fetch = require("node-fetch");
import { Endpoint } from "./support";
import { Agent } from "https";
import { FetchOpts } from "./transport-types";

export function newNodeTransport(): Transport {
  const fetchOptsCache = new WeakMap<Endpoint, Partial<FetchOpts>>();
  const getFetchOpts = (endpoint: Endpoint): Partial<FetchOpts> => {
    const cached = fetchOptsCache.get(endpoint);
    if (cached) {
      return cached;
    }
    const agent = new Agent({
      ca: endpoint.cert,
    });
    const opts = { agent };
    fetchOptsCache.set(endpoint, opts);
    return opts;
  };

  return new GenericTransport({
    EventSource,
    getEventSourceOpts: (endpoint: Endpoint) => {
      return {
        https: {
          ca: endpoint.cert,
        },
      };
    },
    fetch: fetch as any /* woo */,
    getFetchOpts,
  });
}
