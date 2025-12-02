# butlerd for node.js

![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)
[![Test](https://github.com/itchio/node-butlerd/actions/workflows/test.yml/badge.svg)](https://github.com/itchio/node-butlerd/actions/workflows/test.yml)
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Available on npm](https://img.shields.io/npm/v/butlerd.svg)](https://www.npmjs.com/package/butlerd)

The butlerd package handles:

  * launching [butler](https://itch.io/docs/butler) in daemon mode
  * connecting to it
  * sending requests and notifications to it
  * receiving results and notifications from it
  * terminating it

It implements the [JSON-RPC 2.0 Specification](http://www.jsonrpc.org/specification)
over TCP, excluding batch requests (section 6), allowing requests and replies in both
directions.

## Usage

```typescript
import { Instance, Client } from "butlerd";
import * as messages from "./butlerd/messages"; // generated with generous

// Start butler daemon
const instance = new Instance({
  butlerExecutable: "/path/to/butler",
});

// Connect a client
const client = new Client(await instance.getEndpoint());

// Make a request
const result = await client.call(messages.VersionGet, {});
console.log(result.version);

// Shut down
instance.cancel();
await instance.promise();
```

For more complete examples including handling notifications and requests, see the [tests](https://github.com/itchio/node-butlerd/tree/master/src/tests).

## Generating TypeScript Definitions

This repository does not include request or notification definitions for butler's API. You can generate typed message definitions using the `generous` tool included in the butler repository:

```bash
git clone https://github.com/itchio/butler
cd butler
go run ./butlerd/generous ts butlerd/messages.ts
```

This generates TypeScript files with typed request and notification creators that work with this package's `Client.call()` method.

## License

node-butlerd is released under the MIT license, see the LICENSE file.
