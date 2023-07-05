import { Address, Hash28, PCurrencySymbol, PPubKeyHash, PTokenName, PaymentCredentials, PublicKey, Tx, TxBuilder, UTxO } from "@harmoniclabs/plu-ts";
import { getDeployFeeOracleTx } from "./getDeployFeeOracleTx";
import { tryGetMarketplaceConfig } from "../../utils/tryGetMarketplaceConfig";
import { makeFeeOracle } from "../../../src/contracts/feeOracle";
import { tokenName } from "../../constants";
import { cli } from "../../providers/cli";

export async function makeFeeOracleAndGetDeployTx(
    txBuilder: TxBuilder,
    inputUtxo: UTxO,
    returnAddress: Address,
    nftPolicy: Hash28,
    publicKey: PublicKey
): Promise<Tx>
{
    const cfg = tryGetMarketplaceConfig();
    const env = cfg.envFolderPath;
    
    const feeOracle = makeFeeOracle(
        PCurrencySymbol.from( nftPolicy.toBuffer() ),
        PTokenName.from( tokenName ),
        PPubKeyHash.from( publicKey.hash.toBuffer() )
    );

    const feeOracleAddr = new Address(
        cfg.network === "mainnet" ? "mainnet" : "testnet",
        PaymentCredentials.script( feeOracle.hash )
    );

    await cli.utils.writeScript( feeOracle, `${env}/feeOracle.plutus.json` );
    await cli.utils.writeAddress( feeOracleAddr, `${env}/feeOracle.addr` );

    return await getDeployFeeOracleTx(
        txBuilder,
        inputUtxo,
        returnAddress,
        feeOracleAddr,
        feeOracle,
        nftPolicy
    );
}