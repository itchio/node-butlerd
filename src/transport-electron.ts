var debug = require("debug")("butlerd:transport-electron");
import { Transport } from "./transport";
import { GenericTransport } from "./transport-generic";
import fetch from "electron-fetch";
import { session, CertificateVerifyProcRequest } from "electron";
import { Endpoint } from "./support";
import { EventSourceElectron } from "./eventsource-electron";
import {
  getRegisteredElectronSessions,
  onRegisterElectronSession,
} from "./electron-sessions";

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

  return new GenericTransport(endpoint, {
    EventSource: EventSourceElectron,
    eventSourceOpts: { session: customSession },
    fetch: fetch as any /* woo */,
    fetchOpts: { session: customSession },
  });
}
