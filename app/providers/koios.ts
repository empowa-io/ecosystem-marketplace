import { KoiosProvider } from "@harmoniclabs/koios-pluts";
import { tryGetMarketplaceConfig } from "../utils/tryGetMarketplaceConfig";

export const koios = new KoiosProvider(tryGetMarketplaceConfig().network);