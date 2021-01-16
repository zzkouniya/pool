import { Script } from '..';

export class Token {
  typeHash: string;
  typeScript: Script;
  info: TokenInfo;
  balance?: string;
}

export class TokenInfo {
  name: string;
  symbol: string;
  decimal: number;
  logoUri: string;
}

export class TokenHolder {
  constructor(private toknes: Token[]) {}

  getTokens(): Token[] {
    return this.toknes;
  }

  getTokenByTypeHash(typeHash: string): Token {
    return this.toknes.find((x) => x.typeHash === typeHash);
  }

  getTypeScripts(): Script[] {
    return this.toknes.map((x) => x.typeScript);
  }
}
