import { Transport, BaseTransport, PostOptions } from "./transport";
import { Endpoint } from "./support";
import { Feed, FeedOpts, Request } from "./transport-types";
import { SSEParser } from "./eventsource-utils";
import * as http from "http";
import { parse } from "url";

const debug = require("debug")("butlerd:transport-node");

/**
 * A transport for nodeJS.
 * 
 * Uses the 'http' module to implement both Feed and Request.
 */
class NodeTransport extends BaseTransport {
  constructor(endpoint: Endpoint) {
    super(endpoint);
  }

  makeFeed(cid: number): Feed {
    const url = this.makeFeedURL(cid);

    let options = parse(url) as any;
    options.headers = this.feedHeaders();
    options.method = "GET";
    const req = http.request(options);

    let callbacks: FeedOpts;
    let closed = false;

    let close = (err?: Error) => {
      if (!closed) {
        if (err) {
          callbacks.onError(err);
        }
        closed = true;
        req.abort();
      }
    };

    const p = new Promise((resolve, reject) => {
      req.on("error", err => {
        close(err);
        reject(err);
      });
      req.on("abort", () => {
        const err = new Error("Feed aborted");
        close(err);
        reject(err);
      });
      req.on("response", res => {
        if (res.statusCode !== 200) {
          const err = new Error(`Got HTTP ${res.statusCode} for feed`);
          close(err);
          reject(err);
          return;
        }

        resolve();

        const parser = new SSEParser(callbacks.onMessage);
        res.on("aborted", () => {
          const err = new Error("Feed aborted");
          close(err);
        });
        res.on("error", err => {
          reject(err);
        });
        res.on("data", (chunk: Buffer) => {
          parser.pushData(String(chunk));
        });
        res.on("end", () => {
          const err = new Error("Feed closed by server");
          close(err);
        });
      });
    });

    return {
      connect: async (opts: FeedOpts) => {
        if (!opts.onMessage) {
          throw new Error(`Missing 'onMessage' in Feed.connect()`);
        }
        if (!opts.onError) {
          throw new Error(`Missing 'onError' in Feed.connect()`);
        }
        callbacks = opts;
        req.end();
        await p;
      },
      close: () => {
        close();
      },
    };
  }

  post(opts: PostOptions): Request {
    const url = this.makeURL(opts.path);
    let options = parse(url) as any;
    options.headers = this.postHeaders(opts);
    options.method = "POST";

    const req = http.request(options);

    const p = new Promise<any>((resolve, reject) => {
      req.on("error", err => {
        reject(err);
      });
      req.on("abort", () => {
        reject(new Error(`Request aborted`));
      });
      req.on("response", res => {
        let text = "";
        res.on("data", data => {
          text += String(data);
        });
        res.on("aborted", () => {
          reject(new Error(`Request aborted`));
        });
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const object = JSON.parse(text);
              resolve(object);
            } catch (err) {
              reject(err);
            }
          } else if (res.statusCode === 204) {
            resolve(null);
          } else {
            reject(new Error(`Got HTTP ${res.statusCode}: ${text}`));
          }
        });
      });
    });
    req.end(JSON.stringify(opts.payload));

    return {
      do: async () => {
        return await p;
      },
      close: () => {
        req.abort();
      },
    };
  }
}

export function newNodeTransport(endpoint: Endpoint): Transport {
  debug(`New transport for endpoint ${endpoint.http.address}`);
  return new NodeTransport(endpoint);
}
