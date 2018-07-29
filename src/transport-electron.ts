var debug = require("debug")("butlerd:transport-electron");
import { Transport, PostOptions, BaseTransport } from "./transport";
import { net, session, CertificateVerifyProcRequest, Session } from "electron";
import { Endpoint } from "./support";
import {
  getRegisteredElectronSessions,
  onRegisterElectronSession,
} from "./electron-sessions";
import { Feed, FeedOpts, Request } from "./transport-types";
import { parse } from "url";
import { SSEParser } from "./eventsource-utils";

const partition = "__node-butlerd__";

export function newElectronTransport(endpoint: Endpoint): Transport {
  debug(`New transport for endpoint ${endpoint.https.address}`);
  const ca = Buffer.from(endpoint.https.ca, "base64");
  const customSession = session.fromPartition(partition);
  const verifyProc = (
    req: CertificateVerifyProcRequest,
    cb: (verificationResult: number) => void,
  ) => {
    if (req.certificate.data == ca.toString("utf8")) {
      debug(`Trusting self-signed certificate for ${req.hostname}`);
      cb(0);
      return;
    }

    cb(-3);
    return;
  };
  customSession.setCertificateVerifyProc(verifyProc);
  for (const registeredSession of getRegisteredElectronSessions()) {
    registeredSession.setCertificateVerifyProc(verifyProc);
  }
  onRegisterElectronSession(registeredSession => {
    registeredSession.setCertificateVerifyProc(verifyProc);
  });

  return new ElectronTransport(endpoint, customSession);
}

class ElectronTransport extends BaseTransport {
  private session: Session;

  constructor(endpoint: Endpoint, session: Session) {
    super(endpoint);
    this.session = session;
  }

  makeFeed(cid: number): Feed {
    const url = this.makeFeedURL(cid);

    let options = parse(url) as any;
    options.headers = this.feedHeaders();
    options.method = "GET";
    options.session = this.session;
    const req = net.request(options);

    let callbacks: FeedOpts;
    let closed = false;

    let close = (err?: Error) => {
      if (!closed) {
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
        res.on("data", (chunk: Buffer) => {
          parser.pushData(String(chunk));
        });
        res.on("end", () => {
          const err = new Error("Feed ended");
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
        if (!closed) {
          req.abort();
        }
      },
    };
  }

  post(opts: PostOptions): Request {
    const url = this.makeURL(opts.path);
    let options = parse(url) as any;
    options.headers = this.postHeaders(opts);
    options.method = "POST";
    options.session = this.session;

    const req = net.request(options);

    const p = new Promise<any>((resolve, reject) => {
      req.on("error", err => {
        reject(err);
      });
      req.on("abort", err => {
        reject(err);
      });
      req.on("response", res => {
        let text = "";
        res.on("data", data => {
          text += String(data);
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
