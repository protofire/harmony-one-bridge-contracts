const { Harmony } = require('@harmony-js/core');
const { ChainID, ChainType } = require('@harmony-js/utils');
const env = require('./loadEnv')

const { HOME_RPC_URL, GET_RECEIPT_INTERVAL_IN_MILLISECONDS, DEPLOYMENT_ACCOUNT_PRIVATE_KEY, FOREIGN_DEPLOYMENT_GAS_PRICE } = env

const harmonyHome = new Harmony(
  'wss://ws.s0.t.hmny.io',
  {
    chainType: ChainType.Harmony,
    // chainId: ChainID.HmyTestnet,
    chainId: ChainID.HmyMainnet,
    // defaultShardID: 1
  },
)

// const harmonyAccount = harmonyHome.wallet.addByPrivateKey(DEPLOYMENT_ACCOUNT_PRIVATE_KEY);
const harmonyAccount = harmonyHome.wallet.addByPrivateKey('01F903CE0C960FF3A9E68E80FF5FFC344358D80CE1C221C3F9711AF07F83A3BD');

const GAS_LIMIT_EXTRA = env.DEPLOYMENT_GAS_LIMIT_EXTRA

const deploymentPrivateKey = Buffer.from(DEPLOYMENT_ACCOUNT_PRIVATE_KEY, 'hex')

module.exports = {
  harmonyHome,
  harmonyAccount,
  deploymentPrivateKey,
  HOME_RPC_URL,
  GAS_LIMIT_EXTRA,
  FOREIGN_DEPLOYMENT_GAS_PRICE,
  GET_RECEIPT_INTERVAL_IN_MILLISECONDS
}
