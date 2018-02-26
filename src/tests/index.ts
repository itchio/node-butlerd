import { Instance, Client } from "..";
import * as messages from "./test_messages";
import * as fs from "fs";
import * as rimraf from "rimraf";
import * as which from "which";

async function main() {
  let s = new Instance({
    butlerExecutable: which.sync("butler"),
  });

  s.onClient(async client => {
    await testClient(client);

    s.cancel();
  });

  await s.promise();
}

function assertEqual(actual: number, expected: number) {
  if (actual != expected) {
    throw new Error(`expected ${expected}, but got ${actual}`);
  }
}

async function testClient(client: Client) {
  const versionResult = await client.call(messages.VersionGet({}));
  console.log(`<-- Version.Get: ${JSON.stringify(versionResult)}`);

  const input = 256;

  client.onRequest(messages.TestDouble, req => {
    console.log(`<-- Doubling locally!`);
    return { number: req.params.number * 2 };
  });

  const dtres = await client.call(
    messages.TestDoubleTwice({
      number: input,
    }),
  );

  assertEqual(dtres.number, input * 4);
  console.log(`<-- ${input} doubled twice is ${input * 4}, all is well`);
}

process.on("unhandledRejection", e => {
  console.error(`Unhandled rejection: ${e.stack}`);
  process.exit(1);
});

main().catch(e => {
  console.error(`Error in main: `);
  console.error(e.stack);
  process.exit(1);
});
