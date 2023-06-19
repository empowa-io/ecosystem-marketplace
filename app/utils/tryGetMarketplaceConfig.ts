import { MarketplaceConfig, tryGetValidMarketplaceConfig } from "../MarketplaceConfig";


let cached_cfg: MarketplaceConfig | undefined = undefined;

export function tryGetMarketplaceConfig( path: string = "./marketplace.config.json" ): MarketplaceConfig
{
    if( cached_cfg ) return cached_cfg;
    
    cached_cfg = tryGetValidMarketplaceConfig( path );

    return cached_cfg;
}
