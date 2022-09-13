use std::convert::TryFrom;

use anyhow::anyhow;
use napi::{
    bindgen_prelude::*,
    tokio::{
        self,
        sync::{
            mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender},
            oneshot,
        },
    },
};
use napi_derive::napi;
use rethnet_evm::{
    AccountInfo, Bytecode, Bytes, CreateScheme, Database, DatabaseDebug, ExecutionResult,
    LayeredDatabase, RethnetLayer, State, TransactTo, TxEnv, EVM, H160, H256, U256,
};

#[napi(constructor)]
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
}

#[napi(object)]
pub struct Transaction {
    /// 160-bit address for caller
    pub from: Buffer,
    /// 160-bit address for receiver
    pub to: Option<Buffer>,
    /// Input byte data
    pub input: Option<Buffer>,
    /// (Up to) 256-bit unsigned value
    pub value: Option<BigInt>,
}

fn try_u256_from_bigint(mut value: BigInt) -> napi::Result<U256> {
    let num_words = value.words.len();
    if num_words > 4 {
        return Err(napi::Error::new(
            Status::InvalidArg,
            "BigInt cannot have more than 4 words.".to_owned(),
        ));
    } else if num_words < 4 {
        value.words.append(&mut vec![0u64; 4 - num_words]);
    }

    Ok(U256(value.words.try_into().unwrap()))
}

impl TryFrom<Transaction> for TxEnv {
    type Error = napi::Error;

    fn try_from(value: Transaction) -> std::result::Result<Self, Self::Error> {
        let caller = H160::from_slice(&value.from);

        let data = value
            .input
            .map_or(Bytes::default(), |input| Bytes::copy_from_slice(&input));

        let transact_to: TransactTo = if let Some(to) = value.to {
            TransactTo::Call(H160::from_slice(&to))
        } else {
            TransactTo::Create(CreateScheme::Create)
        };

        Ok(Self {
            transact_to,
            caller,
            data,
            value: value
                .value
                .map_or(Ok(U256::default()), |value| try_u256_from_bigint(value))?,
            ..Default::default()
        })
    }
}

#[napi]
pub struct RethnetClient {
    request_sender: UnboundedSender<Request>,
}

#[napi]
impl RethnetClient {
    #[napi(constructor)]
    pub fn new() -> Self {
        let (request_sender, request_receiver) = unbounded_channel();

        tokio::spawn(Rethnet::run(request_receiver));

        Self { request_sender }
    }

    #[napi]
    pub async fn call(&self, transaction: Transaction) -> Result<serde_json::Value> {
        let transaction = transaction.try_into()?;

        let (sender, receiver) = oneshot::channel();

        self.request_sender
            .send(Request::Call {
                transaction,
                sender,
            })
            .map_err(|_| anyhow!("Failed to send request"))?;

        let result = receiver.await.expect("Rethnet unexpectedly crashed");

        serde_json::to_value(result.1)
            .map_err(|e| napi::Error::new(Status::GenericFailure, e.to_string()))
    }

    #[napi]
    pub async fn insert_account(&self, address: Buffer) -> Result<()> {
        let address = H160::from_slice(&address);

        let (sender, receiver) = oneshot::channel();

        self.request_sender
            .send(Request::InsertAccount { address, sender })
            .map_err(|_| anyhow!("Failed to send request"))?;

        receiver.await.expect("Rethnet unexpectedly crashed");
        Ok(())
    }

    #[napi]
    pub async fn insert_block(&self, block_number: BigInt, block_hash: Buffer) -> Result<()> {
        let block_number = try_u256_from_bigint(block_number)?;
        let block_hash = H256::from_slice(&block_hash);

        let (sender, receiver) = oneshot::channel();

        self.request_sender
            .send(Request::InsertBlock {
                block_number,
                block_hash,
                sender,
            })
            .map_err(|_| anyhow!("Failed to send request"))?;

        receiver.await.expect("Rethnet unexpectedly crashed");
        Ok(())
    }

    #[napi]
    pub async fn get_account_by_address(&self, address: Buffer) -> Result<Account> {
        let address = H160::from_slice(&address);

        let (sender, receiver) = oneshot::channel();

        self.request_sender
            .send(Request::AccountByAddress { address, sender })
            .map_err(|_| anyhow!("Failed to send request"))?;

        receiver
            .await
            .expect("Rethnet unexpectedly crashed")?
            .map_or_else(
                || {
                    Err(napi::Error::new(
                        Status::GenericFailure,
                        format!(
                            "Database does not contain account with address: {}.",
                            address,
                        ),
                    ))
                },
                |account_info| {
                    Ok(Account {
                        balance: BigInt {
                            sign_bit: false,
                            words: account_info.balance.0.to_vec(),
                        },
                        nonce: BigInt::from(account_info.nonce),
                        code_hash: Buffer::from(account_info.code_hash.as_bytes()),
                    })
                },
            )
    }

    #[napi]
    pub async fn set_account_balance(&self, address: Buffer, balance: BigInt) -> Result<()> {
        let address = H160::from_slice(&address);
        let balance = try_u256_from_bigint(balance)?;

        let (sender, receiver) = oneshot::channel();

        self.request_sender
            .send(Request::SetAccountBalance {
                address,
                balance,
                sender,
            })
            .map_err(|_| anyhow!("Failed to send request"))?;

        receiver.await.expect("Rethnet unexpectedly crashed");
        Ok(())
    }

    #[napi]
    pub async fn set_account_code(&self, address: Buffer, code: Buffer) -> Result<()> {
        let address = H160::from_slice(&address);

        let (sender, receiver) = oneshot::channel();

        self.request_sender
            .send(Request::SetAccountCode {
                address,
                bytes: Bytes::copy_from_slice(&code),
                sender,
            })
            .map_err(|_| anyhow!("Failed to send request"))?;

        receiver.await.expect("Rethnet unexpectedly crashed");
        Ok(())
    }

    #[napi]
    pub async fn set_account_nonce(&self, address: Buffer, nonce: BigInt) -> Result<()> {
        let address = H160::from_slice(&address);
        let (sign, nonce, lossless) = nonce.get_u64();
        assert!(!sign && lossless, "Expected nonce to be a u64.");

        let (sender, receiver) = oneshot::channel();

        self.request_sender
            .send(Request::SetAccountNonce {
                address,
                nonce,
                sender,
            })
            .map_err(|_| anyhow!("Failed to send request"))?;

        receiver.await.expect("Rethnet unexpectedly crashed");
        Ok(())
    }

    #[napi]
    pub async fn set_account_storage_slot(
        &self,
        address: Buffer,
        index: BigInt,
        value: BigInt,
    ) -> Result<()> {
        let address = H160::from_slice(&address);
        let index = try_u256_from_bigint(index)?;
        let value = try_u256_from_bigint(value)?;

        let (sender, receiver) = oneshot::channel();

        self.request_sender
            .send(Request::SetAccountStorageSlot {
                address,
                index,
                value,
                sender,
            })
            .map_err(|_| anyhow!("Failed to send request"))?;

        receiver.await.expect("Rethnet unexpectedly crashed");
        Ok(())
    }
}

enum Request {
    AccountByAddress {
        address: H160,
        sender: oneshot::Sender<anyhow::Result<Option<AccountInfo>>>,
    },
    Call {
        transaction: TxEnv,
        sender: oneshot::Sender<(ExecutionResult, State)>,
    },
    InsertAccount {
        address: H160,
        sender: oneshot::Sender<()>,
    },
    InsertBlock {
        block_number: U256,
        block_hash: H256,
        sender: oneshot::Sender<()>,
    },
    SetAccountBalance {
        address: H160,
        balance: U256,
        sender: oneshot::Sender<()>,
    },
    SetAccountCode {
        address: H160,
        bytes: Bytes,
        sender: oneshot::Sender<()>,
    },
    SetAccountNonce {
        address: H160,
        nonce: u64,
        sender: oneshot::Sender<()>,
    },
    SetAccountStorageSlot {
        address: H160,
        index: U256,
        value: U256,
        sender: oneshot::Sender<()>,
    },
}

struct Rethnet {
    evm: EVM<LayeredDatabase<RethnetLayer>>,
    request_receiver: UnboundedReceiver<Request>,
}

impl Rethnet {
    pub fn new(request_receiver: UnboundedReceiver<Request>) -> Self {
        let mut evm = EVM::new();
        evm.database(LayeredDatabase::default());

        Self {
            evm,
            request_receiver,
        }
    }

    pub async fn run(request_receiver: UnboundedReceiver<Request>) -> anyhow::Result<()> {
        let mut rethnet = Rethnet::new(request_receiver);

        rethnet.event_loop().await
    }

    async fn event_loop(&mut self) -> anyhow::Result<()> {
        while let Some(request) = self.request_receiver.recv().await {
            let sent_response = match request {
                Request::AccountByAddress { address, sender } => {
                    sender.send(self.evm.db().unwrap().basic(address)).is_ok()
                }
                Request::Call {
                    transaction,
                    sender,
                } => {
                    self.evm.env.tx = transaction;
                    sender.send(self.evm.transact()).is_ok()
                }
                Request::InsertAccount { address, sender } => {
                    self.evm
                        .db()
                        .unwrap()
                        .insert_account(&address, AccountInfo::default());
                    sender.send(()).is_ok()
                }
                Request::InsertBlock {
                    block_number,
                    block_hash,
                    sender,
                } => {
                    self.evm
                        .db()
                        .unwrap()
                        .insert_block(block_number, block_hash);
                    sender.send(()).is_ok()
                }
                Request::SetAccountBalance {
                    address,
                    balance,
                    sender,
                } => {
                    self.evm.db().unwrap().account_info_mut(&address).balance = balance;
                    sender.send(()).is_ok()
                }
                Request::SetAccountCode {
                    address,
                    bytes,
                    sender,
                } => {
                    self.evm.db().unwrap().account_info_mut(&address).code =
                        Some(Bytecode::new_raw(bytes));
                    sender.send(()).is_ok()
                }
                Request::SetAccountNonce {
                    address,
                    nonce,
                    sender,
                } => {
                    self.evm.db().unwrap().account_info_mut(&address).nonce = nonce;
                    sender.send(()).is_ok()
                }
                Request::SetAccountStorageSlot {
                    address,
                    index,
                    value,
                    sender,
                } => {
                    self.evm
                        .db()
                        .unwrap()
                        .set_storage_slot_at_layer(address, index, value);

                    sender.send(()).is_ok()
                }
            };

            if !sent_response {
                return Err(anyhow!("Failed to send response"));
            }
        }
        Ok(())
    }
}
