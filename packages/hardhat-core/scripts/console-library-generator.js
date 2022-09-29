const eutil = require("@nomicfoundation/ethereumjs-util");
const fs = require("fs");

const { keccak256 } = require("../internal/util/keccak");

const functionPrefix = "\tfunction";
const functionBody =
  ") internal view {" + '\n\t\t_sendLogPayload(abi.encodeWithSignature("log(';
const functionSuffix = "));" + "\n\t}" + "\n" + "\n";

let logger =
  "// ------------------------------------\n" +
  "// This code was autogenerated using\n" +
  "// scripts/console-library-generator.js\n" +
  "// ------------------------------------\n\n";

const singleTypes = [
  "int256",
  "uint256",
  "string memory",
  "bool",
  "address",
  "bytes memory",
];
for (let i = 0; i < singleTypes.length; i++) {
  const singleType = singleTypes[i].replace(" memory", "");
  const type = singleType.charAt(0).toUpperCase() + singleType.slice(1);
  logger += "export const " + type + 'Ty = "' + type + '";\n';
}

const offset = singleTypes.length - 1;
for (let i = 1; i <= 32; i++) {
  singleTypes[offset + i] = "bytes" + i.toString();
  logger +=
    "export const Bytes" + i.toString() + 'Ty = "Bytes' + i.toString() + '";\n';
}

const types = ["uint256", "string memory", "bool", "address"];

let consoleSolFile =
  "// SPDX-License-Identifier: MIT\n" +
  "pragma solidity >= 0.4.22 <0.9.0;" +
  "\n" +
  "\n" +
  "library console {" +
  "\n" +
  "\taddress constant CONSOLE_ADDRESS = address(0x000000000000000000636F6e736F6c652e6c6f67);" +
  "\n" +
  "\n" +
  "\tfunction _sendLogPayload(bytes memory payload) private view {\n" +
  "\t\tuint256 payloadLength = payload.length;\n" +
  "\t\taddress consoleAddress = CONSOLE_ADDRESS;\n" +
  "\t\tassembly {\n" +
  "\t\t\tlet payloadStart := add(payload, 32)\n" +
  "\t\t\tlet r := staticcall(gas(), consoleAddress, payloadStart, payloadLength, 0, 0)\n" +
  "\t\t}\n" +
  "\t}\n" +
  "\n" +
  "\tfunction log() internal view {\n" +
  '\t\t_sendLogPayload(abi.encodeWithSignature("log()"));\n' +
  "\t}\n" +
  "\n";

logger +=
  "\n// In order to optimize map lookup\n" +
  "// we'll store 4byte signature as int\n" +
  "export const ConsoleLogs = {\n";

// Add the empty log() first
const sigInt = eutil.bufferToInt(
  keccak256(eutil.bufArrToArr(Buffer.from("log" + "()"))).slice(0, 4)
);
logger += "  " + sigInt + ": [],\n";

for (let i = 0; i < singleTypes.length; i++) {
  const type = singleTypes[i].replace(" memory", "");

  // use logInt and logUint as function names for backwards-compatibility
  const typeAliasedInt = type.replace("int256", "int");
  const nameSuffix =
    typeAliasedInt.charAt(0).toUpperCase() + typeAliasedInt.slice(1);

  const sigInt = eutil.bufferToInt(
    keccak256(eutil.bufArrToArr(Buffer.from("log" + "(" + type + ")"))).slice(
      0,
      4
    )
  );
  logger +=
    "  " +
    sigInt +
    ": [" +
    type.charAt(0).toUpperCase() +
    type.slice(1) +
    "Ty],\n";

  const sigIntAliasedInt = eutil.bufferToInt(
    keccak256(
      eutil.bufArrToArr(Buffer.from("log" + "(" + typeAliasedInt + ")"))
    ).slice(0, 4)
  );
  if (sigIntAliasedInt !== sigInt) {
    logger +=
      "  " +
      sigIntAliasedInt +
      ": [" +
      type.charAt(0).toUpperCase() +
      type.slice(1) +
      "Ty],\n";
  }

  consoleSolFile +=
    functionPrefix +
    " log" +
    nameSuffix +
    "(" +
    singleTypes[i] +
    " p0" +
    functionBody +
    type +
    ')", ' +
    "p0" +
    functionSuffix;
}

const maxNumberOfParameters = 4;
const numberOfPermutations = {};
const dividers = {};
const paramsNames = {};

for (let i = 0; i < maxNumberOfParameters; i++) {
  dividers[i] = Math.pow(maxNumberOfParameters, i);
  numberOfPermutations[i] = Math.pow(maxNumberOfParameters, i + 1);

  paramsNames[i] = [];
  for (let j = 0; j <= i; j++) {
    paramsNames[i][j] = "p" + j.toString();
  }
}

for (let i = 0; i < maxNumberOfParameters; i++) {
  for (let j = 0; j < numberOfPermutations[i]; j++) {
    const params = [];

    for (let k = 0; k <= i; k++) {
      params.push(types[Math.floor(j / dividers[k]) % types.length]);
    }
    params.reverse();

    let sigParams = [];
    let sigParamsAliasedInt = [];
    let constParams = [];

    let input = "";
    let internalParamsNames = [];
    for (let k = 0; k <= i; k++) {
      input += params[k] + " " + paramsNames[i][k] + ", ";
      internalParamsNames.push(paramsNames[i][k]);

      let param = params[k].replace(" memory", "");
      let paramAliasedInt = param.replace("int256", "int");
      sigParams.push(param);
      sigParamsAliasedInt.push(paramAliasedInt);
      constParams.push(param.charAt(0).toUpperCase() + param.slice(1) + "Ty");
    }

    consoleSolFile +=
      functionPrefix +
      " log(" +
      input.substr(0, input.length - 2) +
      functionBody +
      sigParams.join(",") +
      ')", ' +
      internalParamsNames.join(", ") +
      functionSuffix;

    if (sigParams.length !== 1) {
      const sigInt = eutil.bufferToInt(
        keccak256(
          eutil.bufArrToArr(Buffer.from("log(" + sigParams.join(",") + ")"))
        ).slice(0, 4)
      );
      logger += "  " + sigInt + ": [" + constParams.join(", ") + "],\n";

      const sigIntAliasedInt = eutil.bufferToInt(
        keccak256(
          eutil.bufArrToArr(
            Buffer.from("log(" + sigParamsAliasedInt.join(",") + ")")
          )
        ).slice(0, 4)
      );
      if (sigIntAliasedInt !== sigInt) {
        logger +=
          "  " + sigIntAliasedInt + ": [" + constParams.join(", ") + "],\n";
      }
    }
  }
}

consoleSolFile += "}\n";
logger = logger + "};\n";

fs.writeFileSync(
  __dirname + "/../src/internal/hardhat-network/stack-traces/logger.ts",
  logger
);
fs.writeFileSync(__dirname + "/../console.sol", consoleSolFile);
