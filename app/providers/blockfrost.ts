import { BlockfrostPluts } from "@harmoniclabs/blockfrost-pluts";
import { BlockfrostOptions } from "@harmoniclabs/blockfrost-pluts/dist/BlockfrostPluts/BlockfrostOptions";
import { tryGetMarketplaceConfig } from "../utils/tryGetMarketplaceConfig";

const projectId = tryGetMarketplaceConfig().blockfrostProjectId;

export const blockfrost = projectId ? new BlockfrostPluts({ projectId: projectId }) : undefined;