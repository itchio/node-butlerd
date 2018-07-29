export type MessageListener = (data: string) => void;

/**
 * text/event-stream parser adapted from webkit's
 * Source/WebCore/page/EventSource.cpp
 */
export class SSEParser {
  private buf = "";
  private discardTrailingNewline = false;
  private data = "";
  private onMessage: MessageListener;

  constructor(onMessage: MessageListener) {
    this.onMessage = onMessage;
  }

  public pushData(chunk: string) {
    this.buf += chunk;

    let pos = 0;
    let length = this.buf.length;

    while (pos < length) {
      if (this.discardTrailingNewline) {
        if (this.buf[pos] === "\n") {
          ++pos;
        }
        this.discardTrailingNewline = false;
      }

      let lineLength = -1;
      let fieldLength = -1;
      let c;

      for (let i = pos; lineLength < 0 && i < length; ++i) {
        c = this.buf[i];
        if (c === ":") {
          if (fieldLength < 0) {
            fieldLength = i - pos;
          }
        } else if (c === "\r") {
          this.discardTrailingNewline = true;
          lineLength = i - pos;
        } else if (c === "\n") {
          lineLength = i - pos;
        }
      }

      if (lineLength < 0) {
        break;
      }

      this.parseEventStreamLine(pos, fieldLength, lineLength);
      pos += lineLength + 1;
    }

    if (pos === length) {
      this.buf = "";
    } else if (pos > 0) {
      this.buf = this.buf.slice(pos);
    }
  }

  private parseEventStreamLine(
    pos: number,
    fieldLength: number,
    lineLength: number,
  ) {
    if (lineLength === 0) {
      if (this.data.length > 0) {
        let payload = this.data.slice(0, -1); // remove trailing newline
        this.onMessage(payload);
        this.data = "";
      }
    } else if (fieldLength > 0) {
      var noValue = fieldLength < 0;
      var step = 0;
      var field = this.buf.slice(
        pos,
        pos + (noValue ? lineLength : fieldLength),
      );

      if (noValue) {
        step = lineLength;
      } else if (this.buf[pos + fieldLength + 1] !== " ") {
        step = fieldLength + 1;
      } else {
        step = fieldLength + 2;
      }
      pos += step;

      var valueLength = lineLength - step;
      var value = this.buf.slice(pos, pos + valueLength);

      if (field === "data") {
        this.data += value + "\n";
      } else if (field === "event") {
        // ignore event names
      } else if (field === "id") {
        // ignore event IDs
      } else if (field === "retry") {
        // ignore retry interval
      }
    }
  }
}
