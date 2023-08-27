import { PCurrencySymbol, POutputDatum, PPubKeyHash, PScriptContext, PTokenName, Script, Term, bool, bs, compile, int, makeValidator, pBool, pInt, pIntToData, pdelay, perror, pfn, pforce, phoist, pisEmpty, plet, pmatch, pstruct, punBData, punIData } from "@harmoniclabs/plu-ts";
import { pvalueOf } from "../utils/pvalueOf";
import { isInputFromScript } from "../utils/isInputFromScript";

export const NFTSale = pstruct({
    NFTSale: {
        price: int,
        seller: PPubKeyHash.type,
        policy: PCurrencySymbol.type,
        tokenName: PTokenName.type
    }
});

export const SaleAction = pstruct({
    Buy: {},
    Close: {},
    Update: {
        newPrice: int
    }
});

const feeDenominator = phoist(pInt(1_000_000));

export const contract = pfn([
    PCurrencySymbol.type, // paymentAssetSym
    PTokenName.type, // paymentAssetName
    PPubKeyHash.type, // owner
    PCurrencySymbol.type, // oracle nft
    PTokenName.type, // oracle nft
    NFTSale.type,
    SaleAction.type,
    PScriptContext.type
  ], bool)
((
    paymentAssetSym,
    paymentAssetName,
    owner,
    oracleNftSym,
    oracleNftName,
    sale, action, ctx
) => {

    const { tx } = ctx;

    const pvalueOfToken = plet( pvalueOf.$( paymentAssetSym ).$( paymentAssetName ) );

    const delSingedBySeller = plet(
        // not always needed
        pdelay(
            tx.signatories.some( sale.seller.eqTerm )
        )
    );

    const paidAmtToHash = plet(
        pfn([ int, bs ], bool )
        (( amt, hash ) => tx.outputs.some( out => {

            const outToPkh = punBData.$(
                out.address.credential.raw.fields.head
            ).eq( hash );

            const outValueGtEqAmt = pvalueOfToken.$( out.value ).gtEq( amt )
            
            return outValueGtEqAmt
            .and(  outToPkh );
        }))
    );

    return pmatch( action )
    .onClose( _ => pforce( delSingedBySeller ))
    .onUpdate( ({ newPrice }) => {

        // inlined
        const singedBySeller = pforce( delSingedBySeller );

        // inlined
        const singleIn = pisEmpty.$( tx.inputs.tail );

        // inlined
        const singleOut = pisEmpty.$( tx.outputs.tail );

        const _in = plet( tx.inputs.head );
        const out = plet( tx.outputs.head );
        
        const ownHash = plet(
            punBData.$(
                _in.resolved.address.credential
                .raw.fields.head
            )
        );

        const rawFields = sale.raw.fields;

        // inlined
        const validOutDatum = out.datum.eq(
            POutputDatum.InlineDatum({
                datum: NFTSale.NFTSale({
                    seller: rawFields.head,
                    price: pIntToData.$( newPrice ),
                    policy: rawFields.tail.tail.head,
                    tokenName: rawFields.tail.tail.tail.head
                }) as any
            })
        );

        // inlined
        const validOutAddress = pmatch( out.address.credential )
        .onPScriptCredential(({ valHash }) => valHash.eq( ownHash ))
        ._( _ => pBool( false ) ) 

        // inlined
        const validOut = validOutDatum.and( validOutAddress )

        return singedBySeller
        .and(  singleIn )
        .and(  singleOut )
        .and(  validOut );
    })
    .onBuy( _ => {

        const feeNumerator = plet(
            pmatch(
                ctx.tx.refInputs.find(({ resolved }) =>
                    pvalueOf.$( oracleNftSym ).$( oracleNftName ).$( resolved.value ).eq( 1 )
                )
            )
            .onNothing( _ => perror( int ) )
            .onJust(({ val }) =>
                // only works if inline datum
                punIData.$(
                    val.resolved.datum // POutputDatum
                    .raw.fields // first field (datum if inline)
                    .head // the datum data
                )
            )
        );

        // inlined
        const onlyOneRequiredSigner = pisEmpty.$( tx.signatories.tail );

        // inlined
        const nftSentToSigner =
        // `plet.in` to avoid inilining in recursive `some`
        plet(
            tx.signatories.head
        ).in( fstSigner => 
            tx.outputs.some( out => {
        
                const outToBuyer = pmatch( out.address.credential )
                .onPPubKeyCredential(({ pkh }) => pkh.eq( fstSigner ))
                ._( _ => pBool( false ) );

                const valueIncludesNFT = out.value.some(({ fst, snd: assets }) =>
                    fst.eq( sale.policy )
                    .and(
                        assets.some( entry =>
                            entry.fst.eq( sale.tokenName )
                            .and( entry.snd.eq( 1 ) ) 
                        ) 
                    )
                );

                return outToBuyer.and( valueIncludesNFT );
            })
        );

        const ownerFee = plet(
            sale.price.mult(feeNumerator).div(feeDenominator)
        );

        const realPrice = plet(
            sale.price.sub( ownerFee )
        );

        // inlined
        const paidToSeller = paidAmtToHash.$( realPrice ).$( sale.seller )

        // inlined
        const scriptInputs = tx.inputs.filter( isInputFromScript );

        // inlined
        // implies the only script running is the current;
        // prevents double satisfaciton
        const singleScriptInput = pisEmpty.$( scriptInputs.tail );

        // inlined
        const paidFee = paidAmtToHash.$( ownerFee ).$( owner );

        return singleScriptInput
        .and(  onlyOneRequiredSigner )
        .and(  nftSentToSigner )
        .and(  paidFee )
        .and(  paidToSeller )
    });
});

function makeMarketplaceContract(
    paymentAssetSym: Term<typeof PCurrencySymbol>,
    paymentAssetName: Term<typeof PTokenName>,
    owner: Term<typeof PPubKeyHash>,
    oracleNftSym: Term<typeof PCurrencySymbol>,
    oracleNftName: Term<typeof PTokenName>
)
{
    return makeValidator(
        contract
        .$( paymentAssetSym )
        .$( paymentAssetName )
        .$( owner )
        .$( oracleNftSym )
        .$( oracleNftName )
    );
}

export function makeMarketplace(
    paymentAssetSym: Term<typeof PCurrencySymbol>,
    paymentAssetName: Term<typeof PTokenName>,
    owner: Term<typeof PPubKeyHash>,
    oracleNftSym: Term<typeof PCurrencySymbol>,
    oracleNftName: Term<typeof PTokenName>
)
{
    return new Script(
        "PlutusScriptV2",
        compile(
            makeMarketplaceContract(
                paymentAssetSym,
                paymentAssetName,
                owner,
                oracleNftSym,
                oracleNftName,
            )
        )
    );
}