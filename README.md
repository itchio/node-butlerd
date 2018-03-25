# butlerd for node.js

![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)
[![Build Status](https://travis-ci.org/itchio/node-butlerd.svg?branch=master)](https://travis-ci.org/itchio/node-butlerd)
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

It would be neat to have a code sample right in the README, but those tend to
get out-of-sync with the actual code

Instead, please head over to the [tests](https://github.com/itchio/node-butlerd/tree/master/src/tests) - they ought to be readable!

Note that this repository does not include any request or notification definitions.
These can be generated with `generous ts`, see <https://github.com/itchio/butler> for
the generous tool.

## License

node-butlerd is released under the MIT license, see the LICENSE file.
