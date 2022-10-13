import { runCmd } from "./runCmd";

let remappingsLoaded = false;
const remappings: { [from: string]: string } = {};

export async function getRemappings() {
  if (!remappingsLoaded) {
    const remappingsTxt = await runCmd("forge remappings");

    const remappingLines = remappingsTxt.split("\n");
    for (const remappingLine of remappingLines) {
      const fromTo = remappingLine.split("=");
      if (fromTo.length !== 2) {
        continue;
      }

      remappings[fromTo[0]] = fromTo[1];
    }
    remappingsLoaded = true;
  }

  return remappings;
}
