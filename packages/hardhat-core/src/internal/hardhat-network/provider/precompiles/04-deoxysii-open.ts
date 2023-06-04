import type { ExecResult } from "@nomicfoundation/ethereumjs-evm";
import type { PrecompileInput } from "@nomicfoundation/ethereumjs-evm/dist/precompiles";
import deoxysii from "@oasisprotocol/deoxysii";
import { ethers } from "ethers-v5";

export function precompile04(opts: PrecompileInput): ExecResult {
  // TODO: more accurate gas usage in precompiles
  const gasUsed = BigInt(50_000);

  const abiCoder = new ethers.utils.AbiCoder();
  const inputs = abiCoder.decode(
    ["bytes32 key", "bytes32 nonce", "bytes encryptedText", "bytes addition"],
    opts.data
  );

  const key = ethers.utils.arrayify(inputs.key);
  const nonce = ethers.utils.arrayify(inputs.nonce).subarray(0, 15);
  const encryptedText = ethers.utils.arrayify(inputs.encryptedText);
  const addition = ethers.utils.arrayify(inputs.addition);

  const cipher = new deoxysii.AEAD(key);
  const result = Buffer.from(cipher.decrypt(nonce, encryptedText, addition));

  return {
    executionGasUsed: gasUsed,
    returnValue: result,
  };
}
