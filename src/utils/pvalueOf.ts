import { phoist, pfn, PValue, PCurrencySymbol, PTokenName, int, precursiveList, PValueEntryT, pdelay, pInt, fn, list, pif, PAssetsEntryT } from "@harmoniclabs/plu-ts";

export const pvalueOf = phoist(
    pfn([
        PCurrencySymbol.type,
        PTokenName.type,
        PValue.type
    ],  int)
    (( currSym, tokenName, value ) =>
        precursiveList( int, PValueEntryT )
        .$( _self => pdelay( pInt(0) ) )
        .$( 

            pfn([
                fn([ list(PValueEntryT) ], int ),
                PValueEntryT,
                list( PValueEntryT )
            ],  int)

            ((self, head, tail ) =>
                pif( int ).$( head.fst.eq( currSym ) )
                .then(

                    precursiveList( int, PAssetsEntryT )
                    .$( _self => pdelay( pInt(0) ) )
                    .$(

                        pfn([
                            fn([ list(PAssetsEntryT) ], int ),
                            PAssetsEntryT,
                            list( PAssetsEntryT )
                        ],  int)

                        ((self, head, tail) =>
                            pif( int ).$( head.fst.eq( tokenName ) )
                            .then( head.snd )
                            .else( self.$( tail ) as any )
                        )
                    )
                    .$( head.snd )
                )
                .else( self.$( tail ) as any )
            )
        )
        .$( value )
    )
);