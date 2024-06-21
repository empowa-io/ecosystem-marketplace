import { Address, Hash28, PCurrencySymbol, PPubKeyHash, PTokenName, PaymentCredentials, PubKeyHash, PublicKey, Tx, TxBuilder, UTxO } from "@harmoniclabs/plu-ts";
import { getDeployFeeOracleTx } from "../app/txns/feeOracle/getDeployFeeOracleTx";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { makeFeeOracle } from "../src/contracts/feeOracle";
import { tokenName } from "../app/constants";
import { cli } from "../app/providers/cli";
import { getDeployFeeOracleTestTx } from "../test/getDeployFeeOracleTest";

export async function makeFeeOracleAndGetDeployTestTx(
    txBuilder: TxBuilder,
    inputUtxo: UTxO,
    returnAddress: Address,
    nftPolicy: Hash28,
    publicKeyhash: PubKeyHash
): Promise<Tx>
{
    const cfg = tryGetMarketplaceConfig();
    const env = cfg.envFolderPath;
    
    const feeOracle = makeFeeOracle(
        PCurrencySymbol.from( nftPolicy.toBuffer() ),
        PTokenName.from( tokenName ),
        PPubKeyHash.from( publicKeyhash.toBuffer() )
    );

    const feeOracleAddr = new Address(
        cfg.network === "mainnet" ? "mainnet" : "testnet",
        PaymentCredentials.script( feeOracle.hash )
    );

    await cli.utils.writeScript( feeOracle, `${env}/feeOracle.plutus.json` );
    await cli.utils.writeAddress( feeOracleAddr, `${env}/feeOracle.addr` );

    return await getDeployFeeOracleTestTx(
        txBuilder,
        inputUtxo,
        returnAddress,
        feeOracleAddr,
        feeOracle,
        nftPolicy
    );
}