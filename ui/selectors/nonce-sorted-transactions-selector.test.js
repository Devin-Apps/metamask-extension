import { head, last } from 'lodash';
import { MAINNET_CHAIN_ID } from '../../shared/constants/network';
import {
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from '../../shared/constants/transaction';
import { nonceSortedTransactionsSelector } from './transactions';

const RECIPIENTS = {
  ONE: '0xRecipient1',
  TWO: '0xRecipient2',
};

const SENDERS = {
  ONE: '0xSender1',
  TWO: '0xSender2',
};

const INCOMING_TX = {
  id: '0-incoming',
  type: TRANSACTION_TYPES.INCOMING,
  txParams: {
    value: '0x0',
    from: RECIPIENTS.ONE,
    to: SENDERS.ONE,
  },
};

const SIMPLE_SEND_TX = {
  id: '0-simple',
  txParams: {
    from: SENDERS.ONE,
    to: RECIPIENTS.ONE,
  },
  type: TRANSACTION_TYPES.SIMPLE_SEND,
};

const TOKEN_SEND_TX = {
  id: '0-transfer',
  txParams: {
    from: SENDERS.ONE,
    to: RECIPIENTS.TWO,
    value: '0x0',
    data: '0xdata',
  },
  type: TRANSACTION_TYPES.TOKEN_METHOD_TRANSFER,
};

const RETRY_TX = {
  ...SIMPLE_SEND_TX,
  id: '0-retry',
  type: TRANSACTION_TYPES.RETRY,
};

const CANCEL_TX = {
  id: '0-cancel',
  txParams: {
    value: '0x0',
    from: SENDERS.ONE,
    to: SENDERS.ONE,
  },
  type: TRANSACTION_TYPES.CANCEL,
};

const getStateTree = (txList, incomingTxList = []) => ({
  metamask: {
    provider: {
      nickname: 'mainnet',
      chainId: MAINNET_CHAIN_ID,
    },
    selectedAddress: SENDERS.ONE,
    featureFlags: {
      showIncomingTransactions: true,
    },
    incomingTransactions: [...incomingTxList],
    currentNetworkTxList: [...txList],
  },
});

const duplicateTx = (base, overrides) => {
  const { nonce = '0x0', time = 0, status = TRANSACTION_STATUSES.CONFIRMED } =
    overrides ?? {};
  return {
    ...base,
    txParams: {
      ...base.txParams,
      nonce,
    },
    time,
    status,
  };
};

describe('nonceSortedTransactionsSelector', () => {
  it('should properly group a simple send that is superseded by a retry', () => {
    const txList = [
      duplicateTx(SIMPLE_SEND_TX, { status: TRANSACTION_STATUSES.DROPPED }),
      duplicateTx(RETRY_TX, { time: 1 }),
    ];

    const state = getStateTree(txList);

    const result = nonceSortedTransactionsSelector(state);

    expect(result).toStrictEqual([
      {
        nonce: '0x0',
        transactions: txList,
        initialTransaction: head(txList),
        primaryTransaction: last(txList),
        hasRetried: true,
        hasCancelled: false,
      },
    ]);
  });

  it('should properly group a simple send that is superseded by a cancel', () => {
    const txList = [
      duplicateTx(SIMPLE_SEND_TX, { status: TRANSACTION_STATUSES.DROPPED }),
      duplicateTx(CANCEL_TX, { time: 1 }),
    ];

    const state = getStateTree(txList);

    const result = nonceSortedTransactionsSelector(state);

    expect(result).toStrictEqual([
      {
        nonce: '0x0',
        transactions: txList,
        initialTransaction: head(txList),
        primaryTransaction: last(txList),
        hasRetried: false,
        hasCancelled: true,
      },
    ]);
  });

  it('should properly group a simple send and retry that is superseded by a cancel', () => {
    const txList = [
      duplicateTx(SIMPLE_SEND_TX, { status: TRANSACTION_STATUSES.DROPPED }),
      duplicateTx(RETRY_TX, { time: 1, status: TRANSACTION_STATUSES.DROPPED }),
      duplicateTx(CANCEL_TX, { time: 2 }),
    ];

    const state = getStateTree(txList);

    const result = nonceSortedTransactionsSelector(state);

    expect(result).toStrictEqual([
      {
        nonce: '0x0',
        transactions: txList,
        initialTransaction: head(txList),
        primaryTransaction: last(txList),
        hasRetried: true,
        hasCancelled: true,
      },
    ]);
  });

  it('should group transactions created by an advance user attempting to manually supersede own txs', () => {
    // We do not want this behavior longterm. This test just keeps us from
    // changing expectations from today. It will also allow us to invert this
    // test case when we move and change grouping logic.
    const txList = [
      duplicateTx(TOKEN_SEND_TX, { status: TRANSACTION_STATUSES.DROPPED }),
      duplicateTx(SIMPLE_SEND_TX),
    ];

    const state = getStateTree(txList);

    const result = nonceSortedTransactionsSelector(state);

    expect(result).toStrictEqual([
      {
        nonce: '0x0',
        transactions: txList,
        initialTransaction: head(txList),
        primaryTransaction: last(txList),
        hasRetried: false,
        hasCancelled: false,
      },
    ]);
  });

  it('should NOT group sent and incoming tx with same nonce', () => {
    const txList = [duplicateTx(SIMPLE_SEND_TX)];
    const incomingTxList = [duplicateTx(INCOMING_TX, { time: 1 })];

    const state = getStateTree(txList, incomingTxList);

    const result = nonceSortedTransactionsSelector(state);

    expect(result).toStrictEqual([
      {
        nonce: '0x0',
        transactions: txList,
        initialTransaction: head(txList),
        primaryTransaction: head(txList),
        hasRetried: false,
        hasCancelled: false,
      },
      {
        nonce: '0x0',
        transactions: incomingTxList,
        initialTransaction: head(incomingTxList),
        primaryTransaction: head(incomingTxList),
        hasRetried: false,
        hasCancelled: false,
      },
    ]);
  });
});
