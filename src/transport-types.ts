//=========================
// EventSource
//=========================

export interface EventSourceImpl {
  new (url: string, opts?: EventSourceOpts): EventSourceInstance;
}

export interface EventSourceOpts {
  // node-only
  https?: {
    ca?: any;
  };
}

export interface EventSourceInstance {
  onmessage: EventListener;
  onerror: EventListener;
  onopen: EventListener;
  close(): void;
}

//=========================
// fetch
//=========================

export interface FetchOpts {
  method: "POST";
  headers?: {
    [key: string]: string;
  };
  body?: string;

  // node-only
  agent?: any; // of type require("https").Agent

  // electron-only
  session?: any; // of type require("electron").session.Session
}

export interface FetchImpl {
  (url: string, opts: FetchOpts): Promise<FetchResponse>;
}

export interface FetchResponse {
  status?: number;
  json(): Promise<any>;
  text(): Promise<any>;
}
