import { extendConfig, internalTask } from "hardhat/config";

import {
  TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT,
  TASK_COMPILE_TRANSLATE_IMPORT_NAME,
} from "hardhat/builtin-tasks/task-names";
import { CompilationJob, CompilerInput } from "hardhat/types";
import { getRemappings } from "./getRemappings";

extendConfig((config) => {
  // TODO this should only by done for "foundry-first" projects
  // TODO we should get the actual sources directory using `forge config --json`
  config.paths.sources = "./src";
  config.paths.cache = "./cache_hardhat";

  // Override dependency resolution
});

internalTask(TASK_COMPILE_TRANSLATE_IMPORT_NAME).setAction(
  async ({ importName }: { importName: string }): Promise<string> => {
    const remappings = await getRemappings();

    for (const from in remappings) {
      if (Object.prototype.hasOwnProperty.call(remappings, from)) {
        const to = remappings[from];
        if (importName.startsWith(from)) {
          return importName.replace(from, to);
        }
      }
    }

    return importName;
  }
);

internalTask(TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT).setAction(
  async (
    { compilationJob }: { compilationJob: CompilationJob },
    _hre,
    runSuper
  ): Promise<CompilerInput> => {
    const input = (await runSuper({ compilationJob })) as CompilerInput;

    const remappings = await getRemappings();
    input.settings.remappings = Object.entries(remappings).map((fromTo) =>
      fromTo.join("=")
    );

    return input;
  }
);
