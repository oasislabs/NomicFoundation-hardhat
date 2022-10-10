import { extendConfig } from "hardhat/config";

extendConfig((config) => {
  // TODO this should only by done for "foundry-first" projects
  // TODO we should get the actual sources directory using `forge config --json`
  config.paths.sources = "./src";
  config.paths.cache = "./cache_hardhat";
});
