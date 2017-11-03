# node-buse

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

## License

node-buse is released under the MIT license, see the LICENSE file.
