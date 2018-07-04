import * as client from "./client";
import { Endpoint } from "./support";
import { newNodeTransport } from "./transport-node";

export class Client extends client.Client {
  constructor(endpoint: Endpoint) {
    super(endpoint, newNodeTransport());
  }
}
