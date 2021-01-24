import { Context } from 'koa';
import { BridgeInfoMatchChain, BridgeInfoMatchChainFactory, Script, TokenHolderFactory } from '../model';
import { ckbRepository, DexRepository } from '../repository';
import { SWAP_ORDER_LOCK_CODE_HASH, SWAP_ORDER_LOCK_HASH_TYPE } from '../config';
import { QueryOptions } from '@ckb-lumos/base';
import { DexOrderChainFactory } from '../model/orders/dexOrderChainFactory';
import { DexOrderChain, OrderHistory } from '../model/orders/dexOrderChain';
import { txBuilder } from '.';

export class DexSwapService {
  private readonly txBuilderService: txBuilder.TxBuilderService;
  private readonly dexRepository: DexRepository;

  constructor() {
    this.txBuilderService = new txBuilder.TxBuilderService();
    this.dexRepository = ckbRepository;
  }

  public async buildSwapOrderTx(ctx: Context, req: txBuilder.SwapOrderRequest): Promise<txBuilder.TransactionWithFee> {
    return await this.txBuilderService.buildSwap(ctx, req);
  }

  public async buildCancelOrderTx(
    ctx: Context,
    req: txBuilder.CancelOrderRequest,
  ): Promise<txBuilder.TransactionWithFee> {
    return await this.txBuilderService.buildCancelOrder(ctx, req);
  }

  async orders(lock: Script, _limit: number, _skip: number): Promise<OrderHistory[]> {
    const types = TokenHolderFactory.getInstance().getTypeScripts();
    const orderLock: Script = new Script(SWAP_ORDER_LOCK_CODE_HASH, SWAP_ORDER_LOCK_HASH_TYPE, lock.toHash());
    const bridgeInfoMatch = await this.getBridgeInfoMatch(lock);

    const orders: DexOrderChain[] = [];
    for (let i = 0; i < types.length; i++) {
      const txs = await this.getOrders(orderLock, types[i], bridgeInfoMatch);
      txs.forEach((x) => orders.push(x));
    }

    return orders.map((x) => x.getOrderHistory());
  }

  private async getBridgeInfoMatch(lock: Script): Promise<BridgeInfoMatchChain> {
    const pureCrossTxs = await this.dexRepository.getForceBridgeHistory(lock, true);
    const crossChainOrderTxs = await this.dexRepository.getForceBridgeHistory(lock, false);
    return BridgeInfoMatchChainFactory.getInstance(pureCrossTxs, crossChainOrderTxs);
  }

  private async getOrders(
    orderLock: Script,
    type: Script,
    bridgeInfoMatch: BridgeInfoMatchChain,
  ): Promise<DexOrderChain[]> {
    const queryOptions: QueryOptions = {
      lock: {
        script: orderLock.toLumosScript(),
        argsLen: 'any',
      },
      type: type.toLumosScript(),
      order: 'desc',
    };
    const txs = await this.dexRepository.collectTransactions(queryOptions);

    // const mock = MockRepositoryFactory.getDexRepositoryInstance();
    // mock
    //   .mockCollectTransactions()
    //   .resolves([])
    //   .withArgs({
    //     lock: {
    //       script: orderLock.toLumosScript(),
    //       argsLen: 'any',
    //     },
    //     type: new Script(
    //       '0xc5e5dcf215925f7ef4dfaf5f4b4f105bc321c02776d6e7d52a1db3fcd9d011a4',
    //       'type',
    //       '0xe18b390fbeffbe7c7a03119b54a6493d29ea428d2e1dda3efa016110c0cc1125',
    //     ).toLumosScript(),
    //     order: 'desc',
    //   })
    //   .resolves(mockSwapOrder);
    // const txs = await mock.collectTransactions(queryOptions);
    const factory = new DexOrderChainFactory(true);
    const orders = factory.getOrderChains(orderLock, type, txs, bridgeInfoMatch);

    return orders;
  }
}

export const dexSwapService = new DexSwapService();
