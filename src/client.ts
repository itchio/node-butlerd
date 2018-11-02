import {
  ErrorHandler,
  WarningHandler,
  Endpoint,
  RequestCreator,
  RequestError,
} from "./support";
import { Conversation } from "./conversation";
var debug = require("debug")("butlerd:client");

export type SetupFunc = (c: Conversation) => void;

export class Client {
  errorHandler: ErrorHandler = null;
  warningHandler: WarningHandler = null;
  endpoint: Endpoint;
  port: number;
  host: string;
  clientId: string;

  idSeed = 1;

  constructor(endpoint: Endpoint) {
    this.endpoint = endpoint;
    const [host, port] = endpoint.tcp.address.split(":");
    [this.host, this.port] = [host, parseInt(port, 10)];

    this.clientId = `client-${(Math.random() * 1024 * 1024).toFixed(0)}`;
    debug(`Now speaking to ${host}:${port}`);
  }

  generateID(): number {
    return this.idSeed++;
  }

  warn(msg: string) {
    if (this.warningHandler) {
      try {
        this.warningHandler(msg);
        return;
      } catch (e) {}
    }
    console.warn(msg);
  }

  onError(handler: ErrorHandler) {
    this.errorHandler = handler;
  }

  onWarning(handler: WarningHandler) {
    this.warningHandler = handler;
  }

  async call<T, U>(
    rc: RequestCreator<T, U>,
    params: T,
    setup?: SetupFunc,
  ): Promise<U> {
    let conversation: Conversation;

    try {
      conversation = new Conversation(this);
      if (setup) {
        setup(conversation);
      }
      await conversation.connect();
      return await conversation.call(rc, params);
    } finally {
      conversation.close();
    }
  }
}
