import * as client from "./client";
import { Endpoint } from "./support";
import { newWebTransport } from "./transport-web";

export class Client extends client.Client {
  constructor(endpoint: Endpoint) {
    super(endpoint, newWebTransport(endpoint));
  }
}
