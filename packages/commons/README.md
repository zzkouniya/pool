# @gliaswap/commons

This library contains some public components of gliaswap as well as interface definitions

## Example

```ts
import { GliaswapAPI, envs, isCkbNativeAsset } from '@gliaswap/commons';

// 1. set the default env variables
envs.set('ERC20_USDT_ADDRESS', '0x...');

@Controller
class GliaswapServerController implements GliaswapAPI {
  @API('GET', '/balances')
  async getAssetsWithBalance(lock: Script, assets?: Asset[]): Promise<GliaswapAssetWithBalance[]> {
    const result = await Promise.all(assets || []).then((asset) =>
      isCkbNativeAsset(asset) ? service.getCkbWithBalance(lock) : service.getSudtWithBalance(lock, asset),
    );
    return result;
  }
}
```

```ts
class GliaswapClientFetcher implements GliaswapAPI {
  async getAssetsWithBalance(lock: Script, assets?: Asset[]): Promise<GliaswapAssetWithBalance[]> {
    return fetch('https://...', { lock, assets }).then((res) => res.json());
  }
}
```
