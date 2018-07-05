var debug = require("debug")("butlerd:eventsource-electron");
import { EventSourceInstance, EventSourceOpts } from "./transport-types";
import { net, ClientRequest } from "electron";
import { parse } from "url";
import { EventEmitter } from "events";
const original = require("original");

class Event {
  type: string;
  constructor(type: string, optionalProps?: any) {
    this.type = type;
    if (optionalProps) {
      for (const k of Object.keys(optionalProps)) {
        (this as any)[k] = optionalProps[k];
      }
    }
  }
}

export class EventSourceElectron implements EventSourceInstance {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  private reconnectInterval = 1000; // 1 second
  readyState = EventSourceElectron.CONNECTING;
  url: string;
  req: ClientRequest;
  lastEventId: string;

  private emitter: EventEmitter;
  private opts: EventSourceOpts;

  constructor(url: string, opts?: EventSourceOpts) {
    this.url = url;
    this.opts = opts;
    this.emitter = new EventEmitter();
    this.connect();
  }

  private connect() {
    let options = parse(this.url) as any;
    options.headers = {
      "cache-control": "no-cache",
      accept: "text/event-stream",
    };

    if (!this.opts.session) {
      throw new Error(
        `Refusing to create electron EventSource without a session`,
      );
    }
    options.session = this.opts.session;
    this.req = net.request(options);
    this.req.on("response", res => {
      if (res.statusCode !== 200) {
        this.emit(
          "error",
          new Event("error", { status: res.statusCode } as any),
        );
        this.close();
        return;
      }

      this.readyState = EventSourceElectron.OPEN;

      // text/event-stream parser adapted from webkit's
      // Source/WebCore/page/EventSource.cpp
      let buf = "";
      let discardTrailingNewline = false;
      let data = "";
      let eventName = "";

      let parseEventStreamLine = (
        buf: string,
        pos: number,
        fieldLength: number,
        lineLength: number,
      ) => {
        if (lineLength === 0) {
          if (data.length > 0) {
            let type = eventName || "message";
            this.emit(
              type,
              new Event(type, {
                data: data.slice(0, -1), // remove trailing newline
                lastEventId: this.lastEventId,
                origin: original(this.url),
              }),
            );
            data = "";
          }
          eventName = void 0;
        } else if (fieldLength > 0) {
          var noValue = fieldLength < 0;
          var step = 0;
          var field = buf.slice(
            pos,
            pos + (noValue ? lineLength : fieldLength),
          );

          if (noValue) {
            step = lineLength;
          } else if (buf[pos + fieldLength + 1] !== " ") {
            step = fieldLength + 1;
          } else {
            step = fieldLength + 2;
          }
          pos += step;

          var valueLength = lineLength - step;
          var value = buf.slice(pos, pos + valueLength);

          if (field === "data") {
            data += value + "\n";
          } else if (field === "event") {
            eventName = value;
          } else if (field === "id") {
            this.lastEventId = value;
          } else if (field === "retry") {
            var retry = parseInt(value, 10);
            if (!Number.isNaN(retry)) {
              this.reconnectInterval = retry;
            }
          }
        }
      };

      res.on("data", chunk => {
        buf += chunk;

        let pos = 0;
        let length = buf.length;

        while (pos < length) {
          if (discardTrailingNewline) {
            if (buf[pos] === "\n") {
              ++pos;
            }
            discardTrailingNewline = false;
          }

          let lineLength = -1;
          let fieldLength = -1;
          let c;

          for (let i = pos; lineLength < 0 && i < length; ++i) {
            c = buf[i];
            if (c === ":") {
              if (fieldLength < 0) {
                fieldLength = i - pos;
              }
            } else if (c === "\r") {
              discardTrailingNewline = true;
              lineLength = i - pos;
            } else if (c === "\n") {
              lineLength = i - pos;
            }
          }

          if (lineLength < 0) {
            break;
          }

          parseEventStreamLine(buf, pos, fieldLength, lineLength);
          pos += lineLength + 1;
        }

        if (pos === length) {
          buf = "";
        } else if (pos > 0) {
          buf = buf.slice(pos);
        }
      });

      res.on("end", () => {
        res.removeAllListeners("end");
        this.onConnectionClosed();
      });

      res.on("error", err => {
        this.onConnectionClosed();
      });

      this.emit("open", new Event("open"));
    });
    this.req.on("error", () => {
      this.onConnectionClosed();
    });
    this.req.on("abort", () => {
      this.onConnectionClosed();
    });
    this.req.end();
  }

  private emit(ev: string, event: Event) {
    this.emitter.emit(ev, event);
  }

  private getListener(ev: string): EventListener {
    let listener = this.emitter.listeners["message"];
    return listener
      ? listener._listener ? listener._listener : listener
      : undefined;
  }

  private setListener(ev: string, l: EventListener) {
    this.emitter.removeAllListeners(ev);
    this.emitter.addListener(ev, l);
  }

  get onmessage(): EventListener {
    return this.getListener("message");
  }
  set onmessage(l: EventListener) {
    this.setListener("message", l);
  }

  get onerror(): EventListener {
    return this.getListener("error");
  }
  set onerror(l: EventListener) {
    this.setListener("error", l);
  }

  get onopen(): EventListener {
    return this.getListener("open");
  }
  set onopen(l: EventListener) {
    this.setListener("open", l);
  }

  private onConnectionClosed() {
    if (this.readyState === EventSourceElectron.CLOSED) {
      return;
    }
    this.readyState = EventSourceElectron.CONNECTING;
    this.emit("error", new Event("connection closed"));

    setTimeout(function() {
      if (this.readyState !== EventSourceElectron.CONNECTING) {
        return;
      }
      this.connect();
    }, this.reconnectInterval);
  }

  close() {
    this.readyState = EventSourceElectron.CLOSED;
    if (this.req) {
      this.req.abort();
    }
  }
}
