import { AccessListEIP2930Transaction, FeeMarketEIP1559Transaction, TypedTransaction } from "@nomicfoundation/ethereumjs-tx";
import { Transaction } from "rethnet-evm";

export function ethereumjsTransactionToRethnet(tx: TypedTransaction): Transaction {

    const chainId = (tx: TypedTransaction) => {
        if (tx as AccessListEIP2930Transaction) {
            return (tx as AccessListEIP2930Transaction).chainId;
        }
        else if (tx as FeeMarketEIP1559Transaction) {
            return (tx as FeeMarketEIP1559Transaction).chainId;
        } else {
            return undefined;
        }
    };

    const rethnetTx: Transaction = {
        to: tx.to?.buf,
        gasLimit: tx.gasLimit,
        gasPrice: (tx as FeeMarketEIP1559Transaction)?.maxFeePerGas,
        gasPriorityFee: (tx as FeeMarketEIP1559Transaction)?.maxPriorityFeePerGas,
        value: tx.value,
        nonce: tx.nonce,
        input: tx.data,
        chainId: chainId(tx),
    }

    return rethnetTx;
}
