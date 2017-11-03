import { Instance, requests } from "..";

async function main() {
  let s = new Instance();

  s.onClient(async client => {
    const versionResult = await client.call(requests.Version.Get({}));
    console.log(`<-- Version.Get: ${JSON.stringify(versionResult)}`);

    client.onNotification(requests.Operation.Progress, pi => {
      console.log(`<-- Progress: ${JSON.stringify(pi)}`);
    });

    const opResult = await client.call(
      requests.Operation.Start({
        params: {
          stagingFolder: "/tmp",
        },
      }),
    );
    console.log(`<-- Operation.Start: ${JSON.stringify(opResult)}`);

    s.cancel();
  });

  await s.promise();
}

main();
