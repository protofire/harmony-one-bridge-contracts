/* eslint-disable no-param-reassign */
const BigNumber = require('bignumber.js')
const Web3 = require('web3')
const Tx = require('ethereumjs-tx')
const Web3Utils = require('web3-utils')
const HarmonyUtils = require('@harmony-js/utils')
const fetch = require('node-fetch')
const assert = require('assert')
const promiseRetry = require('promise-retry')
const {
  web3Home,
  web3Foreign,
  FOREIGN_RPC_URL,
  GAS_LIMIT_EXTRA,
  HOME_DEPLOYMENT_GAS_PRICE,
  FOREIGN_DEPLOYMENT_GAS_PRICE,
  GET_RECEIPT_INTERVAL_IN_MILLISECONDS
} = require('./web3')

const { harmonyHome, harmonyAccount, deploymentPrivateKey, HOME_RPC_URL } = require('./harmony')

async function deployHarmonyContract(contractJson, args = []) {
  const instance = harmonyHome.contracts.createContract(contractJson.abi)

  const deployed = await instance
    .deploy({
      data: contractJson.bytecode,
      arguments: args
    })
    .send({
      gasLimit: new harmonyHome.utils.Unit('1000000').asWei().toWei(),
      gasPrice: new harmonyHome.crypto.BN('1000000000')
    })

    // console.log('deployed', deployed)
  instance.options.address = deployed.address
  instance.deployedBlockNumber = deployed.transaction.receipt.blockNumber
  return instance
}

async function sendRawTxHome(options) {
  return sendRawTx({
    ...options,
    gasPrice: HOME_DEPLOYMENT_GAS_PRICE
  })
}

async function sendRawTxForeign(options) {
  return sendRawTx({
    ...options,
    gasPrice: FOREIGN_DEPLOYMENT_GAS_PRICE
  })
}

async function sendRawTx({ data, nonce, to, privateKey, url, gasPrice, value }) {
  try {
    const txToEstimateGas = {
      from: privateKeyToAddress(Web3Utils.bytesToHex(privateKey)),
      value,
      to,
      data
    }
    // const estimatedGas = BigNumber(await sendNodeRequest(url, 'hmy_estimateGas', txToEstimateGas)) // FIXME - calculate estimateGas
    const estimatedGas = BigNumber('210000')
    const blockData = await harmonyHome.blockchain.estimateGas({to: '0x0000000000000000000000000000000000000000', data})
    console.log('nonce', blockData)

    // const nonce = await harmonyHome.blockchain.getBlockByNumber()
    // const blockData = await sendNodeRequest(url, 'hmy_getBlockByNumber', ['latest', false])
    // const blockGasLimit = BigNumber(blockData.gasLimit)
    // if (estimatedGas.isGreaterThan(blockGasLimit)) {
    //   throw new Error(
    //     `estimated gas greater (${estimatedGas.toString()}) than the block gas limit (${blockGasLimit.toString()})`
    //   )
    // }
    let gas = estimatedGas.multipliedBy(BigNumber(1 + GAS_LIMIT_EXTRA))
    // if (gas.isGreaterThan(blockGasLimit)) {
    //   gas = blockGasLimit
    // } else {
    //   gas = gas.toFixed(0)
    // }

    const rawTx = {
      nonce,
      gasPrice: Web3Utils.toHex(gasPrice),
      gasLimit: Web3Utils.toHex(gas),
      to,
      data,
      value
    }

    // const tx = new Tx(rawTx)
    // tx.sign(privateKey)
    // const serializedTx = tx.serialize()
    // const txHash = await sendNodeRequest(url, 'hmy_sendRawTransaction', `0x${serializedTx.toString('hex')}`)
    // console.log('pending txHash', txHash)
    // return await getReceipt(txHash, url)
  } catch (e) {
    console.error(e)
  }
}

async function sendNodeRequest(url, method, signedData) {
  if (!Array.isArray(signedData)) {
    signedData = [signedData]
  }
  const request = await fetch(url, {
    headers: {
      'Content-type': 'application/json'
    },
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params: signedData,
      id: 1
    })
  })
  const json = await request.json()
  if (typeof json.error === 'undefined' || json.error === null) {
    if (method === 'hmy_sendRawTransaction') {
      assert.strictEqual(json.result.length, 66, `Tx wasn't sent ${json}`)
    }
    return json.result
  }
  throw new Error(`web3 RPC failed: ${JSON.stringify(json.error)}`)
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getReceipt(txHash, url) {
  await timeout(GET_RECEIPT_INTERVAL_IN_MILLISECONDS)
  let receipt = await sendNodeRequest(url, 'hmy_getTransactionReceipt', txHash)
  if (receipt === null || receipt.blockNumber === null) {
    receipt = await getReceipt(txHash, url)
  }
  return receipt
}

function add0xPrefix(s) {
  if (s.indexOf('0x') === 0) {
    return s
  }

  return `0x${s}`
}

function privateKeyToAddress(privateKey) {
  return new Web3().eth.accounts.privateKeyToAccount(add0xPrefix(privateKey)).address
}

function logValidatorsAndRewardAccounts(validators, rewards) {
  console.log(`VALIDATORS\n==========`)
  validators.forEach((validator, index) => {
    console.log(`${index + 1}: ${validator}, reward address ${rewards[index]}`)
  })
}

async function upgradeHarmonyProxy({ proxy, implementationAddress, version, nonce }) {
  try {
    const data = await proxy.methods.upgradeTo(version, implementationAddress).encodeABI()
    const tx = harmonyHome.transactions.newTx({
      nonce,
      gasLimit: new harmonyHome.utils.Unit('1000000').asWei().toWei(),
      gasPrice: new harmonyHome.crypto.BN('1000000000'),
      shardID: 0,
      to: proxy.options.address,
      data
    })
    console.log('TX', tx)
    const signed = await harmonyAccount.signTransaction(tx, true)
    console.log('Signed Transation', signed.txParams)
    console.log('rawTransaction', signed.getRawTransaction())

    const [Transaction, hash] = await signed.sendTransaction()
    console.log('Transaction', Transaction)
    console.log('Transaction Hash', hash)
    const confirmed = await Transaction.confirm(hash)
    console.log('Transaction Receipt', confirmed.receipt)

    assert(confirmed.isConfirmed(), 'Transaction Failed')
  } catch (error) {
    console.log(error)
    throw error
  }
}

async function transferProxyOwnership({ proxy, newOwner, nonce, url }) {
  const data = await proxy.methods.transferProxyOwnership(newOwner).encodeABI()
  const sendTx = getSendTxMethod(url)
  const result = await sendTx({
    data,
    nonce,
    to: proxy.options.address,
    privateKey: deploymentPrivateKey,
    url
  })
  if (result.status) {
    assert.strictEqual(Web3Utils.hexToNumber(result.status), 1, 'Transaction Failed')
  } else {
    await assertStateWithRetry(proxy.methods.proxyOwner().call, newOwner)
  }
}

async function transferOwnership({ contract, newOwner, nonce, url }) {
  const data = await contract.methods.transferOwnership(newOwner).encodeABI()
  const sendTx = getSendTxMethod(url)
  const result = await sendTx({
    data,
    nonce,
    to: contract.options.address,
    privateKey: deploymentPrivateKey,
    url
  })
  if (result.status) {
    assert.strictEqual(Web3Utils.hexToNumber(result.status), 1, 'Transaction Failed')
  } else {
    await assertStateWithRetry(contract.methods.owner().call, newOwner)
  }
}

async function setBridgeContract({ contract, bridgeAddress, nonce, url }) {
  const data = await contract.methods.setBridgeContract(bridgeAddress).encodeABI()
  const sendTx = getSendTxMethod(url)
  const result = await sendTx({
    data,
    nonce,
    to: contract.options.address,
    privateKey: deploymentPrivateKey,
    url
  })
  if (result.status) {
    assert.strictEqual(Web3Utils.hexToNumber(result.status), 1, 'Transaction Failed')
  } else {
    await assertStateWithRetry(contract.methods.bridgeContract().call, bridgeAddress)
  }
}

async function initializeHarmonyValidators({
  contract,
  isRewardableBridge,
  requiredNumber,
  validators,
  rewardAccounts,
  owner,
  nonce,
  url
}) {
  let data
  try {
    let { nonce } = await harmonyAccount.getBalance()

    if (isRewardableBridge) {
      console.log(`REQUIRED_NUMBER_OF_VALIDATORS: ${requiredNumber}, VALIDATORS_OWNER: ${owner}`)
      logValidatorsAndRewardAccounts(validators, rewardAccounts)
      data = await contract.methods.initialize(requiredNumber, validators, rewardAccounts, owner).encodeABI()
    } else {
      console.log(
        `REQUIRED_NUMBER_OF_VALIDATORS: ${requiredNumber}, VALIDATORS: ${validators}, VALIDATORS_OWNER: ${owner}`
      )
      data = await contract.methods.initialize(requiredNumber, validators, owner).encodeABI()
    }

    const tx = harmonyHome.transactions.newTx({
      nonce,
      gasLimit: new harmonyHome.utils.Unit('1000000').asWei().toWei(),
      gasPrice: new harmonyHome.crypto.BN('1000000000'),
      shardID: 0,
      to: contract.options.address,
      data
    })

    console.log('TX', tx)
    const signed = await harmonyAccount.signTransaction(tx, true)
    console.log('Signed Transation', signed.txParams)
    console.log('rawTransaction', signed.getRawTransaction())

    assert(confirmed.isConfirmed(), 'Transaction Failed')
  } catch (error) {
    console.log(error)
    throw error
  }


  if (isRewardableBridge) {
    console.log(`REQUIRED_NUMBER_OF_VALIDATORS: ${requiredNumber}, VALIDATORS_OWNER: ${owner}`)
    logValidatorsAndRewardAccounts(validators, rewardAccounts)
    data = await contract.methods.initialize(requiredNumber, validators, rewardAccounts, owner).encodeABI()
  } else {
    console.log(
      `REQUIRED_NUMBER_OF_VALIDATORS: ${requiredNumber}, VALIDATORS: ${validators}, VALIDATORS_OWNER: ${owner}`
    )
    data = await contract.methods.initialize(requiredNumber, validators, owner).encodeABI()
  }
  const sendTx = getSendTxMethod(url)
  const result = await sendTx({
    data,
    nonce,
    to: contract.options.address,
    privateKey: deploymentPrivateKey,
    url
  })
  if (result.status) {
    assert.strictEqual(Web3Utils.hexToNumber(result.status), 1, 'Transaction Failed')
  } else {
    await assertStateWithRetry(contract.methods.isInitialized().call, true)
  }
}

async function assertStateWithRetry(fn, expected) {
  return promiseRetry(async retry => {
    const value = await fn()
    if (value !== expected && value.toString() !== expected) {
      retry(`Transaction Failed. Expected: ${expected} Actual: ${value}`)
    }
  })
}

function getSendTxMethod(url) {
  return url === HOME_RPC_URL ? sendRawTxHome : sendRawTxForeign
}

async function isContract(web3, address) {
  const code = await web3.eth.getCode(address)
  return code !== '0x' && code !== '0x0'
}

module.exports = {
  deployHarmonyContract,
  sendRawTxHome,
  sendRawTxForeign,
  privateKeyToAddress,
  logValidatorsAndRewardAccounts,
  upgradeHarmonyProxy,
  initializeHarmonyValidators,
  transferProxyOwnership,
  transferOwnership,
  setBridgeContract,
  assertStateWithRetry,
  isContract
}
