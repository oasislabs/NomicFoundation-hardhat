mod cast;
mod db;
mod sync;
mod threadsafe_function;

use crate::db::GetBlockHashByBlockNumber;
use rethnet_evm::Bytecode;
use std::{fmt::Debug, str::FromStr};

use napi::{bindgen_prelude::*, JsUnknown, NapiRaw};
use napi_derive::napi;
use rethnet_evm::{
    sync::Client, AccountInfo, BlockEnv, Bytes, CfgEnv, CreateScheme, LayeredDatabase, TransactTo,
    TxEnv, H160, H256, U256,
};

use crate::{
    cast::TryCast,
    db::{
        CallbackDatabase, GetAccountByAddressCall, GetAccountStorageSlotCall,
        GetCodeByCodeHashCall, GetStorageRootCall,
    },
    sync::{await_promise, handle_error},
    threadsafe_function::{ThreadSafeCallContext, ThreadsafeFunction},
};

#[napi(object)]
pub struct Account {
    /// Account balance
    #[napi(readonly)]
    pub balance: BigInt,
    /// Account nonce
    #[napi(readonly)]
    pub nonce: BigInt,
    /// 256-bit code hash
    #[napi(readonly)]
    pub code_hash: Buffer,
    /// Optionally, byte code
    #[napi(readonly)]
    pub code: Option<Buffer>,
}

impl Debug for Account {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Account")
            .field("balance", &self.balance)
            .field("nonce", &self.nonce)
            .field("code_hash", &self.code_hash.as_ref())
            .finish()
    }
}

impl From<AccountInfo> for Account {
    fn from(account_info: AccountInfo) -> Self {
        Self {
            balance: BigInt {
                sign_bit: false,
                words: account_info.balance.0.to_vec(),
            },
            nonce: BigInt::from(account_info.nonce),
            code_hash: Buffer::from(account_info.code_hash.as_bytes()),
            code: account_info
                .code
                .map(|code| Buffer::from(code.bytes().as_ref())),
        }
    }
}

#[napi(object)]
pub struct GenesisAccount {
    /// Account private key
    pub private_key: String,
    /// Account balance
    pub balance: BigInt,
}

#[napi(object)]
pub struct AccessListItem {
    pub address: String,
    pub storage_keys: Vec<String>,
}

impl TryFrom<AccessListItem> for (H160, Vec<U256>) {
    type Error = napi::Error;

    fn try_from(value: AccessListItem) -> std::result::Result<Self, Self::Error> {
        let address = H160::from_str(&value.address)
            .map_err(|e| napi::Error::new(Status::InvalidArg, e.to_string()))?;

        let storage_keys = value
            .storage_keys
            .into_iter()
            .map(|key| {
                U256::from_str(&key)
                    .map_err(|e| napi::Error::new(Status::InvalidArg, e.to_string()))
            })
            .collect::<std::result::Result<Vec<U256>, _>>()?;

        Ok((address, storage_keys))
    }
}

#[napi(object)]
pub struct Transaction {
    /// 160-bit address for caller
    /// Defaults to `0x00.0` address.
    pub from: Option<Buffer>,
    /// 160-bit address for receiver
    /// Creates a contract if no address is provided.
    pub to: Option<Buffer>,
    /// Maximum gas allowance for the code execution to avoid infinite loops.
    /// Defaults to 2^63.
    pub gas_limit: Option<BigInt>,
    /// Number of wei to pay for each unit of gas during execution.
    /// Defaults to 1 wei.
    pub gas_price: Option<BigInt>,
    /// Maximum tip per gas that's given directly to the forger.
    pub gas_priority_fee: Option<BigInt>,
    /// (Up to) 256-bit unsigned value.
    pub value: Option<BigInt>,
    /// Nonce of sender account.
    pub nonce: Option<BigInt>,
    /// Input byte data
    pub input: Option<Buffer>,
    /// A list of addresses and storage keys that the transaction plans to access.
    pub access_list: Option<Vec<AccessListItem>>,
    /// Transaction is only valid on networks with this chain ID.
    pub chain_id: Option<BigInt>,
}

#[napi(object)]
pub struct Block {
    pub number: BigInt,
    pub timestamp: BigInt,
}

#[napi(object)]
pub struct Host {
    pub chain_id: BigInt,
    pub allow_unlimited_contract_size: bool,
}

impl TryFrom<Transaction> for TxEnv {
    type Error = napi::Error;

    fn try_from(value: Transaction) -> std::result::Result<Self, Self::Error> {
        let caller = if let Some(from) = value.from.as_ref() {
            H160::from_slice(from)
        } else {
            H160::default()
        };

        let transact_to = if let Some(to) = value.to.as_ref() {
            TransactTo::Call(H160::from_slice(to))
        } else {
            TransactTo::Create(CreateScheme::Create)
        };

        let data = value
            .input
            .map_or(Bytes::default(), |input| Bytes::copy_from_slice(&input));

        let access_list = value.access_list.map_or(Ok(Vec::new()), |access_list| {
            access_list
                .into_iter()
                .map(|item| item.try_into())
                .collect::<std::result::Result<Vec<(H160, Vec<U256>)>, _>>()
        })?;

        Ok(Self {
            caller,
            gas_limit: value
                .gas_limit
                .map_or(2u64.pow(63), |limit| limit.get_u64().1),
            gas_price: value
                .gas_price
                .map_or(Ok(U256::from(0)), BigInt::try_cast)?,
            gas_priority_fee: value
                .gas_priority_fee
                .map_or(Ok(None), |fee| BigInt::try_cast(fee).map(Some))?,
            transact_to,
            value: value.value.map_or(Ok(U256::default()), BigInt::try_cast)?,
            data,
            chain_id: value.chain_id.map(|chain_id| chain_id.get_u64().1),
            nonce: value.nonce.map(|nonce| nonce.get_u64().1),
            access_list,
        })
    }
}

impl TryFrom<Block> for BlockEnv {
    type Error = napi::Error;

    fn try_from(value: Block) -> std::result::Result<Self, Self::Error> {
        Ok(Self {
            number: U256::from(value.number.get_u64().1),
            timestamp: U256::from(value.timestamp.get_u64().1),
            ..Self::default()
        })
    }
}

impl TryFrom<Host> for CfgEnv {
    type Error = napi::Error;

    fn try_from(value: Host) -> std::result::Result<Self, Self::Error> {
        Ok(Self {
            chain_id: U256::from(value.chain_id.get_u64().1),
            limit_contract_code_size: if value.allow_unlimited_contract_size {
                Some(usize::MAX)
            } else {
                Some(0x6000)
            },
            ..Self::default()
        })
    }
}

#[napi(object)]
pub struct TransactionOutput {
    /// Return value from Call or Create transactions
    #[napi(readonly)]
    pub output: Option<Buffer>,
    /// Optionally, a 160-bit address from Create transactions
    #[napi(readonly)]
    pub address: Option<Buffer>,
}

impl From<rethnet_evm::TransactOut> for TransactionOutput {
    fn from(value: rethnet_evm::TransactOut) -> Self {
        let (output, address) = match value {
            rethnet_evm::TransactOut::None => (None, None),
            rethnet_evm::TransactOut::Call(output) => (Some(Buffer::from(output.as_ref())), None),
            rethnet_evm::TransactOut::Create(output, address) => (
                Some(Buffer::from(output.as_ref())),
                address.map(|address| Buffer::from(address.as_bytes())),
            ),
        };

        Self { output, address }
    }
}

#[napi(object)]
pub struct ExecutionResult {
    pub exit_code: u8,
    pub output: TransactionOutput,
    pub gas_used: BigInt,
    pub gas_refunded: BigInt,
    pub logs: Vec<serde_json::Value>,
}

impl TryFrom<rethnet_evm::ExecutionResult> for ExecutionResult {
    type Error = napi::Error;

    fn try_from(value: rethnet_evm::ExecutionResult) -> std::result::Result<Self, Self::Error> {
        let logs = value
            .logs
            .into_iter()
            .map(serde_json::to_value)
            .collect::<serde_json::Result<Vec<serde_json::Value>>>()?;

        Ok(Self {
            exit_code: value.exit_reason as u8,
            output: value.out.into(),
            gas_used: BigInt::from(value.gas_used),
            gas_refunded: BigInt::from(value.gas_refunded),
            logs,
        })
    }
}

#[napi(object)]
pub struct TransactionResult {
    pub exec_result: ExecutionResult,
    pub state: serde_json::Value,
}

impl TryFrom<(rethnet_evm::ExecutionResult, rethnet_evm::State)> for TransactionResult {
    type Error = napi::Error;

    fn try_from(
        value: (rethnet_evm::ExecutionResult, rethnet_evm::State),
    ) -> std::result::Result<Self, Self::Error> {
        let exec_result = value.0.try_into()?;
        let state = serde_json::to_value(value.1)?;

        Ok(Self { exec_result, state })
    }
}

#[napi]
pub struct Rethnet {
    client: Client,
}

#[napi]
impl Rethnet {
    #[allow(clippy::new_without_default)]
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            client: Client::with_db(LayeredDatabase::default()),
        }
    }

    #[allow(clippy::too_many_arguments)]
    #[napi(factory)]
    pub fn with_callbacks(
        env: Env,
        #[napi(ts_arg_type = "(address: Buffer) => Promise<Account>")]
        get_account_by_address_fn: JsFunction,
        #[napi(ts_arg_type = "(address: Buffer, index: bigint) => Promise<bigint>")]
        get_account_storage_slot_fn: JsFunction,
        #[napi(ts_arg_type = "() => Promise<Buffer>")] get_storage_root_fn: JsFunction,
        #[napi(ts_arg_type = "(codeHash: Buffer) => Promise<Buffer>")]
        get_code_by_code_hash_fn: JsFunction,
        #[napi(ts_arg_type = "(blockNumber: bigint) => Promise<Buffer>")]
        get_block_hash_by_block_number_fn: JsFunction,
    ) -> napi::Result<Self> {
        let get_account_by_address_fn = ThreadsafeFunction::create(
            env.raw(),
            unsafe { get_account_by_address_fn.raw() },
            0,
            |ctx: ThreadSafeCallContext<GetAccountByAddressCall>| {
                let sender = ctx.value.sender.clone();
                let address = ctx.env.create_buffer_copy(ctx.value.address.as_bytes())?;

                let promise = ctx.callback.call(None, &[address.into_raw()])?;
                let result =
                    await_promise::<Account, AccountInfo>(ctx.env, promise, ctx.value.sender);

                handle_error(sender, result)
            },
        )?;

        let get_account_storage_slot_fn = ThreadsafeFunction::create(
            env.raw(),
            unsafe { get_account_storage_slot_fn.raw() },
            0,
            |ctx: ThreadSafeCallContext<GetAccountStorageSlotCall>| {
                let sender = ctx.value.sender.clone();
                let address = ctx
                    .env
                    .create_buffer_copy(ctx.value.address.as_bytes())?
                    .into_raw();

                let index = ctx
                    .env
                    .create_bigint_from_words(false, ctx.value.index.0.to_vec())?;

                let promise = ctx
                    .callback
                    .call(None, &[address.into_unknown(), index.into_unknown()?])?;

                let result = await_promise::<BigInt, U256>(ctx.env, promise, ctx.value.sender);

                handle_error(sender, result)
            },
        )?;

        let get_storage_root_fn = ThreadsafeFunction::create(
            env.raw(),
            unsafe { get_storage_root_fn.raw() },
            0,
            |ctx: ThreadSafeCallContext<GetStorageRootCall>| {
                let sender = ctx.value.sender.clone();

                let promise = ctx.callback.call::<JsUnknown>(None, &[])?;
                let result = await_promise::<Buffer, H256>(ctx.env, promise, ctx.value.sender);

                handle_error(sender, result)
            },
        )?;

        let get_code_by_code_hash_fn = ThreadsafeFunction::create(
            env.raw(),
            unsafe { get_code_by_code_hash_fn.raw() },
            0,
            |ctx: ThreadSafeCallContext<GetCodeByCodeHashCall>| {
                let sender = ctx.value.sender.clone();
                let code_hash = ctx.env.create_buffer_copy(ctx.value.code_hash.as_bytes())?;

                let promise = ctx.callback.call(None, &[code_hash.into_raw()])?;

                let result = await_promise::<Buffer, Bytecode>(ctx.env, promise, ctx.value.sender);

                handle_error(sender, result)
            },
        )?;

        let get_block_hash_by_block_number_fn = ThreadsafeFunction::create(
            env.raw(),
            unsafe { get_block_hash_by_block_number_fn.raw() },
            0,
            |ctx: ThreadSafeCallContext<GetBlockHashByBlockNumber>| {
                let sender = ctx.value.sender.clone();

                let block_number = ctx
                    .env
                    .create_bigint_from_words(false, ctx.value.block_number.0.to_vec())?;

                let promise = ctx.callback.call(None, &[block_number.into_unknown()?])?;

                let result = await_promise::<Buffer, H256>(ctx.env, promise, ctx.value.sender);

                handle_error(sender, result)
            },
        )?;

        let db = CallbackDatabase::new(
            get_account_by_address_fn,
            get_account_storage_slot_fn,
            get_storage_root_fn,
            get_code_by_code_hash_fn,
            get_block_hash_by_block_number_fn,
        );

        Ok(Self {
            client: Client::with_db(db),
        })
    }

    #[napi]
    pub async fn dry_run(
        &self,
        transaction: Transaction,
        block: Block,
        host: Host,
    ) -> Result<TransactionResult> {
        let transaction: TxEnv = transaction.try_into()?;
        let block = block.try_into()?;
        let host = host.try_into()?;
        self.client
            .dry_run(transaction, block, host)
            .await
            .try_into()
    }
}
