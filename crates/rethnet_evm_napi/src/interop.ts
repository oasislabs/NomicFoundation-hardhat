import {
    DefaultStateManager,
    StateManager,
} from "@nomicfoundation/ethereumjs-statemanager";
import { Account, Address } from "@nomicfoundation/ethereumjs-util"
import { Account as RethnetAccount } from '../rethnet-evm'
import { SyncStateManager } from 'hardhat/src/internal/hardhat-network/provider/SyncStateManager'

export class HardhatDB {
    protected _stateManager: SyncStateManager;

    constructor(stateManager: SyncStateManager) {
        this._stateManager = stateManager;
    }

    public getAccountByAddress(address: Buffer): RethnetAccount {
        let account = this._stateManager.getAccount(new Address(address));
        console.log(account);
        return new RethnetAccount(account.balance, account.nonce, account.codeHash);
    }

    public insertAccount(address: Buffer, balance: BigInt) {
        this._stateManager.putAccount(new Address(address), new Account(0n, balance));
    }
}
