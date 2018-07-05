var debug = require("debug")("butlerd:transport-electron");
import { Transport } from "./transport";
import { GenericTransport } from "./transport-generic";
import fetch = require("electron-fetch");
import { session, CertificateVerifyProcRequest } from "electron";
import { Endpoint } from "./support";
import { EventSourceElectron } from "./eventsource-electron";

const partition = "__node-butlerd__";

export function newElectronTransport(endpoint: Endpoint): Transport {
  debug(`New transport for endpoint ${endpoint.https.address}`);
  const ca = Buffer.from(endpoint.https.ca, "base64");
  const customSession = session.fromPartition(partition);
  customSession.setCertificateVerifyProc(
    (
      req: CertificateVerifyProcRequest,
      cb: (verificationResult: number) => void,
    ) => {
      if (req.certificate.data == ca.toString("utf8")) {
        debug(
          `Trusting certificate '${JSON.stringify(req.certificate, null, 2)}'`,
        );
        cb(0);
        return;
      }

      cb(-3);
      return;
    },
  );

  return new GenericTransport(endpoint, {
    EventSource: EventSourceElectron,
    eventSourceOpts: { session: customSession },
    fetch: fetch as any /* woo */,
    fetchOpts: { session: customSession },
  });
}
