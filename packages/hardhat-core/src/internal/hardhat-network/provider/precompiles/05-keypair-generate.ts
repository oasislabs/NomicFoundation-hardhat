import type { ExecResult } from "@nomicfoundation/ethereumjs-evm";
import type { PrecompileInput } from "@nomicfoundation/ethereumjs-evm/dist/precompiles";
import nacl from "tweetnacl";
import { ethers } from "ethers-v5";

export function precompile05(opts: PrecompileInput): ExecResult {
  const gasUsed = BigInt(100_000);

  const abiCoder = new ethers.utils.AbiCoder();
  const inputs = abiCoder.decode(["uint method", "bytes seed"], opts.data);

  const keyPair = nacl.box.keyPair();
  const publicKey = ethers.utils.hexlify(keyPair.publicKey);
  const secretKey = ethers.utils.hexlify(keyPair.secretKey);

  const result = Buffer.from(
    ethers.utils.arrayify(
      abiCoder.encode(["bytes", "bytes"], [publicKey, secretKey])
    )
  );

  return {
    executionGasUsed: gasUsed,
    returnValue: result,
  };
}
