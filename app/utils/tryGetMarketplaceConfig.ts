import { MarketplaceConfig, tryGetValidMarketplaceConfig } from "../MarketplaceConfig";
import { getConfigPath } from "../MarketplaceConfig/getConfigPath";


let cached_cfg: MarketplaceConfig | undefined = undefined;

export function tryGetMarketplaceConfig( path: string = getConfigPath() ): MarketplaceConfig
{
    if( cached_cfg ) return cached_cfg;
    
    cached_cfg = tryGetValidMarketplaceConfig( path );

    return cached_cfg;
}
