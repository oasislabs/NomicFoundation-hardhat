import type { ExecResult } from "@nomicfoundation/ethereumjs-evm";
import type { PrecompileInput } from "@nomicfoundation/ethereumjs-evm/dist/precompiles";
import { sha512_256 } from "js-sha512";
import nacl from "tweetnacl";
import { ethers } from "ethers-v5";

export function precompile02(opts: PrecompileInput): ExecResult {
  const gasUsed = BigInt(100_000);

  const abiCoder = new ethers.utils.AbiCoder();
  const inputs = abiCoder.decode(
    ["bytes32 publicKey", "bytes32 privateKey"],
    opts.data
  );

  const secretKey = ethers.utils.arrayify(inputs.privateKey);
  const publicKey = ethers.utils.arrayify(inputs.publicKey);

  const result = Buffer.from(
    sha512_256.hmac
      .create("MRAE_Box_Deoxys-II-256-128")
      .update(nacl.scalarMult(secretKey, publicKey))
      .arrayBuffer()
  );

  return {
    executionGasUsed: gasUsed,
    returnValue: result,
  };
}
