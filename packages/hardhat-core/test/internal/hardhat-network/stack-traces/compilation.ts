import fs from "fs";
import path from "path";
import { NativeCompiler } from "../../../../src/internal/solidity/compiler";
import {
  Compiler,
  CompilerDownloader,
} from "../../../../src/internal/solidity/compiler/downloader";
import { getCompilersDir } from "../../../../src/internal/util/global-dir";

import { CompilerInput, CompilerOutput } from "../../../../src/types";

import { SolidityCompiler } from "./compilers-list";

interface SolcSourceFileToContents {
  [filename: string]: { content: string };
}

function getSolcSourceFileMapping(sources: string[]): SolcSourceFileToContents {
  return Object.assign(
    {},
    ...sources.map((s) => ({
      [path.basename(s)]: { content: fs.readFileSync(s, "utf8") },
    }))
  );
}

function getSolcInput(
  sources: SolcSourceFileToContents,
  compilerOptions: SolidityCompiler
): CompilerInput {
  const optimizer =
    compilerOptions.optimizer === undefined
      ? {
          enabled: false,
        }
      : {
          enabled: true,
          runs: compilerOptions.optimizer.runs,
        };

  return {
    language: "Solidity",
    sources,
    settings: {
      viaIR: compilerOptions.optimizer?.viaIR ?? false,
      optimizer,
      outputSelection: {
        "*": {
          "*": [
            "abi",
            "evm.bytecode",
            "evm.deployedBytecode",
            "evm.methodIdentifiers",
          ],
          "": ["id", "ast"],
        },
      },
    },
  };
}

function getSolcInputForFiles(
  sources: string[],
  compilerOptions: SolidityCompiler
): CompilerInput {
  return getSolcInput(getSolcSourceFileMapping(sources), compilerOptions);
}

function getSolcInputForLiteral(
  source: string,
  compilerOptions: SolidityCompiler,
  filename: string = "literal.sol"
): CompilerInput {
  return getSolcInput({ [filename]: { content: source } }, compilerOptions);
}

export const COMPILER_DOWNLOAD_TIMEOUT = 10000;

async function compile(
  input: CompilerInput,
  compiler: Compiler
): Promise<[CompilerInput, CompilerOutput]> {
  if (compiler.isSolcJs) {
    throw new Error("These tests expect to be able to run native solc");
  }
  const nativeCompiler = new NativeCompiler(compiler.compilerPath);

  const output = await nativeCompiler.compile(input);

  if (output.errors) {
    for (const error of output.errors) {
      if (error.severity === "error") {
        throw new Error(`Failed to compile: ${error.message}`);
      }
    }
  }

  return [input, output];
}

export async function compileFiles(
  sources: string[],
  compilerOptions: SolidityCompiler
): Promise<[CompilerInput, CompilerOutput]> {
  const compiler = await getCompilerForVersion(compilerOptions.solidityVersion);
  return compile(getSolcInputForFiles(sources, compilerOptions), compiler);
}

export async function compileLiteral(
  source: string,
  compilerOptions: SolidityCompiler = {
    solidityVersion: "0.8.0",
    compilerPath: "soljson-v0.8.0+commit.c7dfd78e.js",
  },
  filename: string = "literal.sol"
): Promise<[CompilerInput, CompilerOutput]> {
  await downloadCompiler(compilerOptions.solidityVersion);
  const compiler = await getCompilerForVersion(compilerOptions.solidityVersion);

  return compile(
    getSolcInputForLiteral(source, compilerOptions, filename),
    compiler
  );
}

async function getCompilerForVersion(
  solidityVersion: string
): Promise<Compiler> {
  const compilersCache = await getCompilersDir();
  const compilerPlatform = CompilerDownloader.getCompilerPlatform();
  const downloader = CompilerDownloader.getConcurrencySafeDownloader(
    compilerPlatform,
    compilersCache
  );
  const compiler = await downloader.getCompiler(solidityVersion);
  if (compiler === undefined) {
    throw new Error("Expected compiler to be downloaded");
  }

  return compiler;
}

export async function downloadCompiler(solidityVersion: string) {
  const compilersCache = await getCompilersDir();
  const compilerPlatform = CompilerDownloader.getCompilerPlatform();
  const downloader = CompilerDownloader.getConcurrencySafeDownloader(
    compilerPlatform,
    compilersCache
  );

  const isCompilerDownloaded = await downloader.isCompilerDownloaded(
    solidityVersion
  );

  if (!isCompilerDownloaded) {
    console.log("Downloading solc", solidityVersion);
    await downloader.downloadCompiler(solidityVersion);
  }
}
