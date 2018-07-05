import * as client from "./client";
import { Endpoint } from "./support";
import { newElectronTransport } from "./transport-electron";

export class Client extends client.Client {
  constructor(endpoint: Endpoint) {
    super(endpoint, newElectronTransport(endpoint));
  }
}
