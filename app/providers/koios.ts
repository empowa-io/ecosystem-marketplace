import { KoiosProvider } from "@harmoniclabs/koios-pluts";
import { tryGetMarketplaceConfig } from "../utils/tryGetMarketplaceConfig";
console.log("Conf: ",tryGetMarketplaceConfig())
console.log("Network: ",tryGetMarketplaceConfig().network)
export const koios = new KoiosProvider(tryGetMarketplaceConfig().network);