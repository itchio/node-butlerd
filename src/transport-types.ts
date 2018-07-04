//=========================
// EventSource
//=========================

export interface EventSourceImpl {
  new (url: string, opts?: EventSourceOpts): EventSourceInstance;
}

export interface EventSourceOpts {
  // node-only
  https?: {
    ca?: string;
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
  agent?: any;
}

export interface FetchImpl {
  (url: string, opts: FetchOpts): Promise<FetchResponse>;
}

export interface FetchResponse {
  status?: number;
  json(): Promise<any>;
}
