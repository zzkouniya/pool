import { createFixedStruct, U8, U128LE, U64LE } from 'easy-byte';
import {
  SudtCellSerialization,
  LiquidityCellSerialization,
  LiquidityOrderCellArgs,
  TipsArgsSerialization,
  TipsCellArgs,
} from '.';

export class DefaultLiquidityCellSerialization implements LiquidityCellSerialization {
  constructor(private serialization: SudtCellSerialization, private tipsArgsSerialization: TipsArgsSerialization) {
    this.serialization = serialization;
    this.tipsArgsSerialization = tipsArgsSerialization;
  }

  encodeArgs = (
    userlockHash: string,
    version: number,
    sudtMin: bigint,
    ckbMin: bigint,
    infoTypeHash: string,
    tips: bigint,
    tipsSudt: bigint,
  ): string => {
    const data = this.getStructDefine();

    const tipsArgs = this.tipsArgsSerialization.encodeArgs(tips, tipsSudt);
    return `${infoTypeHash}${data
      .encode({
        version,
        sudtMin,
        ckbMin,
      })
      .toString('hex')}${userlockHash.slice(2, 66)}${tipsArgs}`;
  };

  decodeArgs = (argsHex: string): LiquidityOrderCellArgs => {
    const args = this.getStructDefine();
    const decodeLenght = 66 + 2 + 32 + 16;

    const infoTypeHash = argsHex.slice(0, 66);
    const userLockHash = `0x${argsHex.slice(decodeLenght, decodeLenght + 64)}`;
    const tips: TipsCellArgs = this.tipsArgsSerialization.decodeArgs(argsHex.slice(decodeLenght + 64, argsHex.length));

    const structObj = args.decode(Buffer.from(argsHex.slice(66, decodeLenght), 'hex'));

    return {
      infoTypeHash,
      ...structObj,
      userLockHash,
      ...tips,
    };
  };

  encodeData = (sudtAmount: bigint): string => {
    return this.serialization.encodeData(sudtAmount);
  };

  decodeData = (dataHex: string): bigint => {
    return this.serialization.decodeData(dataHex);
  };

  private getStructDefine() {
    return createFixedStruct().field('version', U8).field('sudtMin', U128LE).field('ckbMin', U64LE);
  }
}
