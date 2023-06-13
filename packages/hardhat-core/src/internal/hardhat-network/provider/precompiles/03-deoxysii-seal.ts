import type { ExecResult } from "@nomicfoundation/ethereumjs-evm";
import type { PrecompileInput } from "@nomicfoundation/ethereumjs-evm/dist/precompiles";
import deoxysii from "@oasisprotocol/deoxysii";
import { ethers } from "ethers-v5";

export function precompile03(opts: PrecompileInput): ExecResult {
  // TODO: more accurate gas usage in precompiles
  const gasUsed = BigInt(50_000);

  const abiCoder = new ethers.utils.AbiCoder();
  const inputs = abiCoder.decode(
    ["bytes32 key", "bytes32 nonce", "bytes plainText", "bytes addition"],
    opts.data
  );

  const key = ethers.utils.arrayify(inputs.key);
  const nonce = ethers.utils.arrayify(inputs.nonce).subarray(0, 15);
  const plainText = ethers.utils.arrayify(inputs.plainText);
  const addition = ethers.utils.arrayify(inputs.addition);

  const cipher = new deoxysii.AEAD(key);
  const result = Buffer.from(cipher.encrypt(nonce, plainText, addition));

  return {
    executionGasUsed: gasUsed,
    returnValue: result,
  };
}
