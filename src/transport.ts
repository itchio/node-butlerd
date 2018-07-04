import { Endpoint } from "./support";

export interface TransportMessageListener {
  (msg: any): void;
}

export interface TransportErrorListener {
  (err: Error): void;
}

export interface Transport {
  connect(endpoint: Endpoint, clientId: string): Promise<void>;
  setOnError(cb: TransportErrorListener);
  setOnMessage(cb: TransportMessageListener);
  post(path: string, payload: any): Promise<any>;
  close();
  isClosed(): boolean;
}
