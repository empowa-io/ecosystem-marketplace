import { PTxInInfo, bool, phoist, plam } from "@harmoniclabs/plu-ts";

export const isInputFromScript = phoist(
    plam( PTxInInfo.type, bool )
    (({ resolved }) =>
        resolved.address.credential.raw.index.eq( 1 ) // address.credential constructor is 1 (PValidatorHash)
    )
);