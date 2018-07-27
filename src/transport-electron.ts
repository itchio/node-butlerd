var debug = require("debug")("butlerd:transport-electron");
import {
  Transport,
  TransportMessageListener,
  TransportErrorListener,
  PostOptions,
  BaseTransport,
} from "./transport";
import {
  net,
  session,
  CertificateVerifyProcRequest,
  Session,
  Net,
} from "electron";
import { Endpoint } from "./support";
import {
  getRegisteredElectronSessions,
  onRegisterElectronSession,
} from "./electron-sessions";
import { EventSourceInstance } from "./transport-types";
import { EventSourceElectron } from "./eventsource-electron";
import { parse, resolve } from "url";

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

  async makeEventSource(
    cid: number,
    onMessage: TransportMessageListener,
    onError: TransportErrorListener,
  ): Promise<EventSourceInstance> {
    const p = new Promise<EventSourceInstance>((resolve, reject) => {
      const url = this.makeURL(
        `feed?secret=${this.endpoint.secret}&cid=${cid}`,
      );
      debug(`GET ${url}`);
      let source = new EventSourceElectron(url, { session: this.session });
      source.onmessage = ev => {
        debug(`SSE message: ${(ev as any).data}`);
        onMessage((ev as any).data);
      };

      source.onerror = ev => {
        const err = new Error(
          `EventSource error: ${JSON.stringify(ev, null, 2)}`,
        );
        reject(err);
        onError(err);
      };

      source.onopen = ev => {
        resolve(source);
      };
    });
    return await p;
  }

  async post(opts: PostOptions) {
    const url = this.makeURL(opts.path);
    debug(`POST ${url}`);
    let options = parse(url) as any;
    options.headers = {
      accept: "application/json",
      "content-type": "application/json",
      "cache-control": "no-cache",
      "x-secret": this.endpoint.secret,
      ...opts.headers,
    };
    options.method = "POST";
    options.session = this.session;

    const req = net.request(options);
    if (opts.registerAbort) {
      opts.registerAbort(() => req.abort());
    }

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
          // TODO: use Buffer instead
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
    return await p;
  }
}
