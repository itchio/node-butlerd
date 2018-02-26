# node-buse

![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)
[![Build Status](https://travis-ci.org/itchio/node-buse.svg?branch=master)](https://travis-ci.org/itchio/node-buse)
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

node-buse handles:

  * launching [butler](https://itch.io/docs/butler) in service mode
  * connecting to it
  * sending requests and notifications to it
  * receiving results and notifications from it
  * terminating it

It implements bidirectional the [JSON-RPC 2.0 Specification](http://www.jsonrpc.org/specification)
over TCP, excluding batch requests (section 6)

It also ships with typings for all methods of the `buse` (butler service) JSON-RPC 2.0 service,
allowing one to make requests and notifications in a type-safe way, as long
as it stays in sync with [buse's own types](https://github.com/itchio/butler/tree/master/buse).

## Usage

It would be neat to have a code sample right in the README, but those tend to
get out-of-sync with the actual code

Instead, please head over to the [tests](https://github.com/itchio/node-buse/tree/master/src/tests) - they ought to be readable!

Note that this repository does not include any request or notification definitions.
These can be generated with `busegen ts`, see <https://github.com/itchio/butler> for
the busegen tool.

## License

node-buse is released under the MIT license, see the LICENSE file.
