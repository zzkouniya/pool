import { MIN_SUDT_CAPACITY } from '@gliaswap/constants';
import {
  Output,
  TransactionWithStatus,
  CellInfoSerializationHolderFactory,
  LiquidityOrderCellArgs,
  PoolInfo,
  Script,
  PoolInfoFactory,
} from '..';
import { LIQUIDITY_LOCK_CODE_HASH, LIQUIDITY_LOCK_HASH_TYPE } from '../../config/tokenToken';
import { scriptEquals } from '../scriptEquals';
import { TokenHolderFactory } from '../tokens';
import { DexOrderChain, OrderHistory, ORDER_STATUS, Step } from './dexOrderChain';

export enum LIQUIDITY_ORDER_TYPE {
  ADD = 'add',
  REMOVE = 'remove',
}

export class DexLiquidityChain extends DexOrderChain {
  private poolInfo: PoolInfo;
  constructor(
    userLock: Script,
    cell: Output,
    data: string,
    tx: TransactionWithStatus,
    index: number,
    live: boolean,
    nextOrderCell: DexOrderChain,
    poolInfo: PoolInfo,
    poolInfos: PoolInfo[],
  ) {
    super(userLock, cell, data, tx, index, nextOrderCell, live, poolInfos);
    this.poolInfo = poolInfo;
  }

  getOrderHistory(): OrderHistory {
    const transactionHash = this.getLastOrder().getTxHash();
    const tokens = PoolInfoFactory.getTokensByCell(this.poolInfo.infoCell);
    const amountA = TokenHolderFactory.getInstance().getTokenByTypeHash(tokens.tokenA.typeHash);
    const amountB =
      this.getType() === LIQUIDITY_ORDER_TYPE.ADD
        ? TokenHolderFactory.getInstance().getTokenByTypeHash(this.cell.type.toHash())
        : PoolInfoFactory.getTokensByCell(this.poolInfo.infoCell).tokenB;
    // FIXME:
    if (this.getType() === LIQUIDITY_ORDER_TYPE.ADD) {
      if (tokens.isSudtSudt()) {
        for (let i = 0; i < this.tx.transaction.outputs.length; i++) {
          const cell = this.tx.transaction.outputs[i];
          if (
            cell.lock.codeHash === LIQUIDITY_LOCK_CODE_HASH &&
            cell.lock.hashType === LIQUIDITY_LOCK_HASH_TYPE &&
            scriptEquals.equalsTypeScript(cell.type, tokens.tokenA.typeScript)
          ) {
            amountA.balance = CellInfoSerializationHolderFactory.getInstance()
              .getSudtCellSerialization()
              .decodeData(this.tx.transaction.outputsData[i])
              .toString();
          }
        }
      } else {
        amountA.balance = (BigInt(this.cell.capacity) - MIN_SUDT_CAPACITY * 2n).toString();
      }
    } else {
      const lpTokenScript = this.buildLpTokenTypeScript();
      if (tokens.isSudtSudt()) {
        for (let i = 0; i < this.tx.transaction.outputs.length; i++) {
          const cell = this.tx.transaction.outputs[i];
          if (this.equalCell(cell, LIQUIDITY_LOCK_CODE_HASH, LIQUIDITY_LOCK_HASH_TYPE, lpTokenScript)) {
            amountA.balance = CellInfoSerializationHolderFactory.getInstance()
              .getSudtCellSerialization()
              .decodeData(this.tx.transaction.outputsData[i])
              .toString();
          }
        }
      } else {
        amountA.balance = CellInfoSerializationHolderFactory.getInstance()
          .getLiquidityCellSerialization()
          .decodeArgs(this.cell.lock.args)
          .ckbMin.toString();
      }
    }

    if (this.tx.transaction.hash === '0xa330fe0e103d1c45e4acdfaab3cdafd495715bb008cf72aec86be81569cfa508') {
      console.log(1);
    }

    if (tokens.isSudtSudt()) {
      if (this.getType() === LIQUIDITY_ORDER_TYPE.ADD) {
        for (let i = 0; i < this.tx.transaction.outputs.length; i++) {
          const cell = this.tx.transaction.outputs[i];
          if (this.equalCell(cell, LIQUIDITY_LOCK_CODE_HASH, LIQUIDITY_LOCK_HASH_TYPE, tokens.tokenB.typeScript)) {
            amountB.balance = CellInfoSerializationHolderFactory.getInstance()
              .getSudtCellSerialization()
              .decodeData(this.tx.transaction.outputsData[i])
              .toString();
          }
        }
      } else {
        const lpTokenScript = this.buildLpTokenTypeScript();
        for (let i = 0; i < this.tx.transaction.outputs.length; i++) {
          const cell = this.tx.transaction.outputs[i];
          if (this.equalCell(cell, LIQUIDITY_LOCK_CODE_HASH, LIQUIDITY_LOCK_HASH_TYPE, lpTokenScript)) {
            amountB.balance = CellInfoSerializationHolderFactory.getInstance()
              .getSudtCellSerialization()
              .decodeData(this.tx.transaction.outputsData[i])
              .toString();
          }
        }
      }
    } else {
      amountB.balance = CellInfoSerializationHolderFactory.getInstance()
        .getLiquidityCellSerialization()
        .decodeData(this.data)
        .toString();
    }
    const steps = this.buildStep();
    const status = this.getStatus();

    const orderHistory: OrderHistory = {
      poolId: this.poolInfo.infoCell.cellOutput.type.toHash(),
      transactionHash: transactionHash,
      timestamp: this.tx.txStatus.timestamp,
      amountIn: amountA,
      amountOut: amountB,
      stage: {
        status: status,
        steps: steps,
      },
      type: this.getType(),
    };

    return orderHistory;
  }

  getArgsData(): LiquidityOrderCellArgs {
    return CellInfoSerializationHolderFactory.getInstance()
      .getLiquidityCellSerialization()
      .decodeArgs(this.cell.lock.args);
  }

  getData(): bigint {
    return CellInfoSerializationHolderFactory.getInstance().getSwapCellSerialization().decodeData(this.data);
  }

  getType(): string {
    const token = TokenHolderFactory.getInstance()
      .getTokens()
      .find((x) => x.typeHash === this.cell.type.toHash());
    if (token) {
      return LIQUIDITY_ORDER_TYPE.ADD;
    }

    return LIQUIDITY_ORDER_TYPE.REMOVE;
  }

  getStatus(): string {
    if (this.isCancel()) {
      if (this.getLastOrder().tx.txStatus.status === 'pending') {
        return ORDER_STATUS.CANCELING;
      } else {
        return ORDER_STATUS.CANCELED;
      }
    }

    const orders = this.getOrders();

    if (orders.length === 1) {
      if (this.tx.txStatus.status === 'pending') {
        return ORDER_STATUS.PENDING;
      }
      return ORDER_STATUS.OPEN;
    }

    if (this.getLastOrder().tx.txStatus.status === 'pending') {
      return ORDER_STATUS.OPEN;
    }

    return ORDER_STATUS.COMPLETED;
  }

  buildStep(): Step[] {
    const orders = this.getOrders();
    const result: Step[] = [];
    if (this.tx.txStatus.status !== 'pending') {
      const step: Step = new Step(this.tx.transaction.hash, this.index.toString());
      result.push(step);
    }

    orders.forEach((x) => {
      const step: Step = new Step(x.tx.transaction.hash, x.index.toString());
      result.push(step);
    });

    return result;
  }

  filterOrderHistory(): boolean {
    return true;
    // if (this.getStatus() !== ORDER_STATUS.COMPLETED && this.getStatus() !== ORDER_STATUS.CANCELED) {
    //   return true;
    // }
    // return false;
  }

  private equalCell(cell: Output, lockCodeHash: string, lockHashType: string, typeScript?: Script): boolean {
    if (
      cell.lock.codeHash === lockCodeHash &&
      cell.lock.hashType === lockHashType &&
      scriptEquals.equalsTypeScript(cell.type, typeScript)
    ) {
      return true;
    }

    return false;
  }

  private buildLpTokenTypeScript(): Script {
    return new Script(
      '0xc5e5dcf215925f7ef4dfaf5f4b4f105bc321c02776d6e7d52a1db3fcd9d011a4',
      'type',
      this.poolInfo.infoCell.cellOutput.lock.toHash(),
    );
  }
}
