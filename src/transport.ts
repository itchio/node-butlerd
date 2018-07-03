import { IEndpoint } from "./client";

export interface TransportMessageListener {
  (msg: any): void;
}

export interface TransportErrorListener {
  (err: Error): void;
}

export interface Transport {
  connect(endpoint: IEndpoint, clientId: string): Promise<void>;
  setOnError(cb: TransportErrorListener);
  setOnMessage(cb: TransportMessageListener);
  post(payload: any): Promise<any>;
  close();
  isClosed(): boolean;
}
