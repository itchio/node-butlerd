export interface FeedOpts {
  onMessage: (payloadJSON: string) => void;
  onError: (err: Error) => void;
}

/**
 * Think 'EventSource', but only the stuff we need.
 * So: no custom event types, no auto reconnect, just
 * messages.
 */
export interface Feed {
  /**
   * Waits for the feed connection to be established,
   * (ie. for the server to reply with headers, not
   * for the complete response) rejects if timeout.
   */
  connect(opts: FeedOpts): Promise<void>;

  /**
   * Closes the feed connection no matter the state.
   */
  close();
}

/**
 * An HTTP request, already in-flight by the time
 * the constructor returns.
 */
export interface Request {
  /**
   * Waits for full HTTP response.
   * 
   * Returns null if 204
   * Returns a JSON object if 200
   * Rejects if anything else
   */
  do(): Promise<any>;

  /**
   * Aborts the HTTP request at any stage.
   */
  close();
}
