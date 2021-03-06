import * as commons from '@gliaswap/commons';
import { body, Context, request, responses, summary, tags, description } from 'koa-swagger-decorator';

import * as config from '../config';
import { Script, cellConver, Token, TokenHolder, TokenHolderFactory } from '../model';
import { dexSwapService, DexSwapService, txBuilder } from '../service';

import { AssetSchema, ScriptSchema, StepSchema, TransactionToSignSchema } from './swaggerSchema';

const swapTag = tags(['Swap']);

export default class DexSwapController {
  private readonly service: DexSwapService;
  private readonly tokenHolder: TokenHolder;

  constructor() {
    this.service = dexSwapService;
    this.tokenHolder = TokenHolderFactory.getInstance();
  }

  @request('post', '/v1/swap/orders')
  @summary('Get swap orders')
  @description('Get swap orders')
  @swapTag
  @responses({
    200: {
      description: 'success',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            transactionHash: { type: 'string', required: true },
            timestamp: { type: 'string', required: true },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            amountIn: { type: 'object', properties: (AssetSchema as any).swaggerDocument },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            amountOut: { type: 'object', properties: (AssetSchema as any).swaggerDocument },
            stage: {
              type: 'object',
              properties: {
                status: { type: 'string', required: true },
                steps: {
                  type: 'array',
                  items: {
                    type: 'object',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    properties: (StepSchema as any).swaggerDocument,
                  },
                },
              },
            },
            type: { type: 'string', required: true },
          },
        },
      },
    },
  })
  @body({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lock: { type: 'object', properties: (ScriptSchema as any).swaggerDocument },
    ethAddress: { type: 'string', required: true },
    limit: { type: 'number', required: false },
    skip: { type: 'number', required: false },
  })
  public async getSwapOrders(ctx: Context): Promise<void> {
    const req = ctx.request.body;
    const { lock, ethAddress, limit, skip } = req;
    const result = await this.service.orders(cellConver.converScript(lock), ethAddress, limit, skip);
    ctx.status = 200;
    ctx.body = result.map((x) => {
      return {
        transactionHash: x.transactionHash,
        timestamp: x.timestamp,
        amountIn: x.amountIn.toAsset(),
        amountOut: x.amountOut.toAsset(),
        stage: x.stage,
        type: x.type,
      };
    });
  }

  @request('post', '/v1/swap/orders/swap')
  @summary('Create swap order tx')
  @description('Create swap order tx')
  @swapTag
  @responses({
    200: {
      description: 'success',
      schema: {
        type: 'object',
        properties: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tx: { type: 'object', properties: (TransactionToSignSchema as any).swaggerDocument, required: true },
          fee: { type: 'string', required: true },
        },
      },
    },
  })
  @body({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assetInWithAmount: { type: 'object', properties: (AssetSchema as any).swaggerDocument, required: true },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assetOutWithMinAmount: { type: 'object', properties: (AssetSchema as any).swaggerDocument, required: true },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lock: { type: 'object', properties: (ScriptSchema as any).swaggerDocument, required: true },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tips: { type: 'object', properties: (AssetSchema as any).swaggerDocument, required: true },
  })
  public async createSwapOrderTx(ctx: Context): Promise<void> {
    const reqBody = ctx.request.body as commons.GenerateSwapTransactionPayload;
    const { assetInWithAmount, assetOutWithMinAmount, lock, tips } = reqBody;

    if (!config.LOCK_DEPS[lock.codeHash]) {
      ctx.throw(400, `unknown user lock code hash: ${lock.codeHash}`);
    }

    const [tokenInAmount, tokenOutMinAmount] = [assetInWithAmount, assetOutWithMinAmount].map((asset) => {
      if (asset.balance == undefined || BigInt(asset.balance) == 0n) {
        ctx.throw(400, `asset type hash ${asset.typeHash}'s balance is zero`);
      }

      let token = Token.fromAsset(asset as AssetSchema);
      if (token.typeScript == undefined) {
        token = this.tokenHolder.getTokenByTypeHash(asset.typeHash);
      }
      if (!token) {
        ctx.throw(400, `asset type hash: ${asset.typeHash} not in token list`);
      }
      token = token.clone();
      token.balance = asset.balance;

      return token;
    });

    const req = new txBuilder.SwapRequest(
      tokenInAmount,
      tokenOutMinAmount,
      Script.deserialize(lock),
      Token.fromAsset(tips as AssetSchema),
    );
    const txWithFee = await this.service.buildSwapTx(ctx, req);

    ctx.status = 200;
    ctx.body = txWithFee.serialize();
  }

  @request('post', '/v1/swap/orders/swap-lock')
  @summary('Create swap order lock script')
  @description('Create swap order lock script')
  @swapTag
  @responses({
    200: {
      description: 'success',
      schema: {
        type: 'object',
        properties: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lock: { type: 'object', properties: (ScriptSchema as any).swaggerDocument, required: true },
        },
      },
    },
  })
  @body({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assetInWithAmount: { type: 'object', properties: (AssetSchema as any).swaggerDocument, required: true },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assetOutWithMinAmount: { type: 'object', properties: (AssetSchema as any).swaggerDocument, required: true },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lock: { type: 'object', properties: (ScriptSchema as any).swaggerDocument, required: true },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tips: { type: 'object', properties: (AssetSchema as any).swaggerDocument, required: true },
  })
  public async createSwapOrderLock(ctx: Context): Promise<void> {
    const reqBody = ctx.request.body as commons.GenerateSwapTransactionPayload;
    const { assetInWithAmount, assetOutWithMinAmount, lock, tips } = reqBody;

    if (!config.LOCK_DEPS[lock.codeHash]) {
      ctx.throw(400, `unknown user lock code hash: ${lock.codeHash}`);
    }

    const [tokenInAmount, tokenOutMinAmount] = [assetInWithAmount, assetOutWithMinAmount].map((asset) => {
      if (asset.balance == undefined || BigInt(asset.balance) == 0n) {
        ctx.throw(400, `asset type hash ${asset.typeHash}'s balance is zero`);
      }

      let token = this.tokenHolder.getTokenByTypeHash(asset.typeHash);
      if (!token) {
        ctx.throw(400, `asset type hash: ${asset.typeHash} not in token list`);
      }
      token = token.clone();
      token.balance = asset.balance;

      return token;
    });

    const req = new txBuilder.SwapRequest(
      tokenInAmount,
      tokenOutMinAmount,
      Script.deserialize(lock),
      Token.fromAsset(tips as AssetSchema),
    );
    const swapOrderLock = this.service.buildSwapLock(req);

    ctx.status = 200;
    ctx.body = { lock: swapOrderLock };
  }

  @request('post', '/v1/swap/orders/cancel')
  @summary('Create cancel swap order tx')
  @description('Create cancel swap order tx')
  @swapTag
  @responses({
    200: {
      description: 'success',
      schema: {
        type: 'object',
        properties: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tx: { type: 'object', properties: (TransactionToSignSchema as any).swaggerDocument, required: true },
          fee: { type: 'string', required: true },
        },
      },
    },
  })
  @body({
    txHash: { type: 'string', required: true },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lock: { type: 'object', properties: (ScriptSchema as any).swaggerDocument, required: true },
  })
  public async createCancelOrderTx(ctx: Context): Promise<void> {
    const { txHash, lock } = ctx.request.body as commons.GenerateCancelRequestTransactionPayload;

    if (!config.LOCK_DEPS[lock.codeHash]) {
      ctx.throw(400, `unknown user lock code hash: ${lock.codeHash}`);
    }

    const req = {
      txHash,
      userLock: Script.deserialize(lock),
      requestType: txBuilder.CancelRequestType.Swap,
    };
    const txWithFee = await this.service.buildCancelRequestTx(ctx, req);

    ctx.status = 200;
    ctx.body = txWithFee.serialize();
  }
}
