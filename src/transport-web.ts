import { Transport, BaseTransport, PostOptions } from "./transport";
import { Endpoint } from "./support";
import { FeedOpts, Feed, Request } from "./transport-types";

const debug = require("debug")("butlerd:transport-web");

/**
 * A transport for the browser.
 * 
 * Uses EventSource to implement Feed, and XMLHTTPRequest
 * to implement Request.
 */
class WebTransport extends BaseTransport {
  constructor(endpoint: Endpoint) {
    super(endpoint);
  }

  makeFeed(cid: number): Feed {
    const url = this.makeFeedURL(cid);
    const es = new (window as any).EventSource(url) as EventSource;

    let callbacks: FeedOpts;
    let closed = false;

    let close = (err?: Error) => {
      if (!closed) {
        if (err) {
          callbacks.onError(err);
        }
        closed = true;
        es.close();
      }
    };

    const p = new Promise((resolve, reject) => {
      es.onopen = resolve;
      es.onerror = reject;
      es.onmessage = ev => {
        callbacks.onMessage((ev as any).data);
      };
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
        await p;
      },
      close: () => {
        close();
      },
    };
  }

  post(opts: PostOptions): Request {
    const url = this.makeURL(opts.path);
    const req = new XMLHttpRequest();

    const p = new Promise<any>((resolve, reject) => {
      req.onerror = (ev: ErrorEvent) => {
        reject(new Error(`POST error: ${ev}`));
      };
      req.onabort = () => {
        reject(new Error("POST aborted"));
      };
      req.onload = () => {
        if (req.status === 200) {
          try {
            const object = JSON.parse(req.responseText);
            resolve(object);
          } catch (err) {
            reject(err);
          }
        } else if (req.status === 204) {
          resolve(null);
        } else {
          reject(new Error(`Got HTTP ${req.status}: ${req.responseText}`));
        }
      };
    });

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

export function newWebTransport(endpoint: Endpoint): Transport {
  debug(`New transport for endpoint ${endpoint.http.address}`);
  return new WebTransport(endpoint);
}
