import { Cell } from '..';
import { Token } from '..';

export interface PoolInfo {
  poolId: string;
  tokenA: Token;
  tokenB: Token;
  infoCell?: Cell;
}
