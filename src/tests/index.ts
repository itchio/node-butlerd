import { Instance, messages, Client } from "..";
import * as fs from "fs";
import * as rimraf from "rimraf";

async function main() {
  let s = new Instance();

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
  const versionResult = await client.call(messages.Version.Get({}));
  console.log(`<-- Version.Get: ${JSON.stringify(versionResult)}`);

  const input = 256;

  client.onRequest(messages.Test.DoubleRequest, req => {
    console.log(`<-- Doubling locally!`);
    return { number: req.params.number * 2 };
  });

  const dtres = await client.call(
    messages.Test.DoubleTwiceRequest({
      number: input,
    }),
  );

  assertEqual(dtres.number, input * 4);
  console.log(`<-- ${input} doubled twice is ${input * 4}, all is well`);

  const apiKey = process.env.ITCH_TEST_ACCOUNT_TOKEN;
  if (!apiKey) {
    console.log(`No API key, skipping Operation.Start test...`);
    return;
  }

  try {
    rimraf.sync("./prefix");
    fs.mkdirSync("./prefix");
  } catch (e) {
    if (e.code !== "EEXIST") {
      throw e;
    }
  }

  client.onNotification(messages.Log, ({ params }) => {
    console.log(`[${params.level}] ${params.message}`);
  });

  let lastProgress = 0.0;

  client.onNotification(messages.Operation.Progress, ({ params }) => {
    if (params.progress - lastProgress >= 0.2) {
      console.log(`${(params.progress * 100).toFixed(2)}% done...`);
      lastProgress = params.progress;
    }
  });

  const opResult = await client.call(
    messages.Operation.Start({
      operation: "install",
      stagingFolder: "./prefix/staging",
      installParams: {
        game: {
          id: 59362,
          title: "Neverjam",
        },
        installFolder: "./prefix/install",
        credentials: {
          apiKey,
        },
      },
    }),
  );
  console.log(`<-- Operation.Start: ${JSON.stringify(opResult)}`);
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
