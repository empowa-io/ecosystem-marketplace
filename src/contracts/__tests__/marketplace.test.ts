import { DataB, DataConstr, DataI, Machine, PCurrencySymbol, PPubKeyHash, PScriptContext, PTokenName, Tx, UTxO, Value, dataFromCbor, getTxInfos, pBool, pData } from "@harmoniclabs/plu-ts";
import { NFTSale, SaleAction, contract } from "../../contracts/marketplace";
import { fromHex } from "@harmoniclabs/uint8array-utils";

const datumData = dataFromCbor("d8799f192710581c016814c7ba1e79bf8434a102736e3d4c382e6b2c1e77049e778d330d581cf98d5ea96323da4ed14067d4fa7b84701beb1e705b7991dad3b2ce3b40ff");

const redeemerData = dataFromCbor("d87980");

const ctxData = dataFromCbor("d8799fd8799f9fd8799fd8799fd8799f582064e89ba588f9523852ecbcdbfd32f9874468c9923044b554ef2b535268e1c970ff00ffd8799fd8799fd87a9f581ca7fb6b082f956b8de39ff6903f92ea8be78cd7a667c7aba866fa957bffd87a80ffbf40bf401a001e8480ff581cf98d5ea96323da4ed14067d4fa7b84701beb1e705b7991dad3b2ce3bbf4001ffffd87b9fd8799f192710581c016814c7ba1e79bf8434a102736e3d4c382e6b2c1e77049e778d330d581cf98d5ea96323da4ed14067d4fa7b84701beb1e705b7991dad3b2ce3b40ffffd87a80ffffd8799fd8799fd8799f582064e89ba588f9523852ecbcdbfd32f9874468c9923044b554ef2b535268e1c970ff01ffd8799fd8799fd8799f581c016814c7ba1e79bf8434a102736e3d4c382e6b2c1e77049e778d330dffd87a80ffbf40bf401b0000000252655cd1ff581c0462de27174c88689ec9fe0e13777e1ed52285510300796e16b88acfbf401a000f4240ffffd87980d87a80ffffff9fd8799fd8799fd8799f58203767608e1e96e8c6d9e2f50416847be3dccbbe74ae35c795e35b181fc0b2ec15ff01ffd8799fd8799fd87a9f581c82adff728286ab5ae1dce89b16a7b2402adcdda250c28f634771ea25ffd87a80ffbf40bf401a001e8480ff581cf84eb52734381be98a01311283cadd0bd4ac62ab8bca73a388093e79bf4001ffffd87b9f1961a8ffd87a80ffffd8799fd8799fd8799f582095dfb5af6fd32833f3f348bf88fbcd15e7193c41785d86210351ea1a9ea78112ff00ffd8799fd8799fd87a9f581ca7fb6b082f956b8de39ff6903f92ea8be78cd7a667c7aba866fa957bffd87a80ffbf40bf401a00989680ffffd87b9f40ffd8799f581ca7fb6b082f956b8de39ff6903f92ea8be78cd7a667c7aba866fa957bffffffff9fd8799fd8799fd8799f581c016814c7ba1e79bf8434a102736e3d4c382e6b2c1e77049e778d330dffd87a80ffbf40bf401a001e8480ff581cf98d5ea96323da4ed14067d4fa7b84701beb1e705b7991dad3b2ce3bbf4001ffffd87980d87a80ffd8799fd8799fd8799f581c016814c7ba1e79bf8434a102736e3d4c382e6b2c1e77049e778d330dffd87a80ffbf40bf401a001e8480ff581c0462de27174c88689ec9fe0e13777e1ed52285510300796e16b88acfbf4018faffffd87980d87a80ffd8799fd8799fd8799f581c016814c7ba1e79bf8434a102736e3d4c382e6b2c1e77049e778d330dffd87a80ffbf40bf401a001e8480ff581c0462de27174c88689ec9fe0e13777e1ed52285510300796e16b88acfbf40192616ffffd87980d87a80ffd8799fd8799fd8799f581c016814c7ba1e79bf8434a102736e3d4c382e6b2c1e77049e778d330dffd87a80ffbf40bf401b0000000252255be4ff581c0462de27174c88689ec9fe0e13777e1ed52285510300796e16b88acfbf401a000f1b30ffffd87980d87a80ffffbf40bf401a0002f7edffffbf40bf4000ffff80a0d8799fd8799fd87980d87980ffd8799fd87b80d87a80ffff9f581c016814c7ba1e79bf8434a102736e3d4c382e6b2c1e77049e778d330dffbfd87a9fd8799fd8799f582064e89ba588f9523852ecbcdbfd32f9874468c9923044b554ef2b535268e1c970ff00ffffd87980ffa058209cde359b8985705ab44b6212d86a5b50f2224ae413bf3d1a17932deb1e6cb8c9ffd87a9fd8799fd8799f582064e89ba588f9523852ecbcdbfd32f9874468c9923044b554ef2b535268e1c970ff00ffffff");

const completeContract = contract
.$( PCurrencySymbol.from( fromHex("0462de27174c88689ec9fe0e13777e1ed52285510300796e16b88acf") ) )
.$( PTokenName.from( new Uint8Array(0) ) )
.$( PPubKeyHash.from( fromHex("016814c7ba1e79bf8434a102736e3d4c382e6b2c1e77049e778d330d") ) )
.$( PCurrencySymbol.from( fromHex("f84eb52734381be98a01311283cadd0bd4ac62ab8bca73a388093e79") ) )
.$( PTokenName.from( new Uint8Array(0) ) )

test("yey", () =>  {
   
    const { result, budgetSpent, logs } = Machine.eval(
        completeContract
        .$(
            NFTSale.fromData( pData( datumData ) )
        )
        .$(
            SaleAction.fromData( pData( redeemerData ) )
        )
        .$(
            PScriptContext.fromData( pData( ctxData ) )
        )
    );

    expect( result ).toEqual(
        Machine.evalSimple( pBool( true ) )
    );

});

test.only("mesh tx", () => {

    const _tx = Tx.fromCbor(
        "84a70085825820586f58387405091e56b25dace397844d474b8fe9f399e57500d508a71dda1be5018258206e96da819b69e0aba91f98c399f34111256792a771dd2b7e6c4ba8d5bf30eb2400825820b5150c1f96d7ae180e05a73269a1d85402924081ed0594918074f0ecf8d7b62800825820cbe9e27d27b33d3351108ac02e301399cfb4180c63d3ab6f20d8126425ca618400825820fcf856f5fb8c499736a1a4428e460bff34b7a42ff8c4d913a7affe988409c46301018382581d602a65b4fbb371fade6e93853c060e398f2fdd55a24f4513025233ce5e821a0011a008a1581c171163f05e4f30b6be3c22668c37978e7d508b84f83558e523133cdfa14474454d501a00337f9882583900de632878e7ade33091b05155739aea08e57f8def2f08465ccb9453e4bf19deac990da562c979ae7f926a162d43ac2d4d2a9252be8650f36e821a0011a008a1581c171163f05e4f30b6be3c22668c37978e7d508b84f83558e523133cdfa14474454d501a07d87028825839009b8cd93fd173fbdeae2b9556c7c31940910ad82e6fe5299c32737f0dbd6b3cdf369c0faad153950ab77117a8f5ad29fa83913ec5fad61a4b821a004d2ee8a2581c171163f05e4f30b6be3c22668c37978e7d508b84f83558e523133cdfa14474454d501b0000000b9c2f8440581c55a68e023e53e8eef1598c9abb1e519e4eac5e9cdef267a0b660d701a1443030313801021a000d39e90b58204d3f3c6e04dac867c6400472086c9600a5d730684385df2d9fbc3a29b504b4bf0d81825820586f58387405091e56b25dace397844d474b8fe9f399e57500d508a71dda1be5000e81581c9b8cd93fd173fbdeae2b9556c7c31940910ad82e6fe5299c32737f0d1281825820a7422a8917094c344a6a1090b3b178fb3596f6664313c526ec60f5c75543fa3f01a3038006815904f15904ee0100003232323232323232323232323232222533357346666666644444444646464646666444464664a666ae68c005200010031533357346002900108020a999ab9a300148010401458dc39aab9d00135573c0026ea80100188cc078cc078cc07940104d5d19aba20031357466ae88dd6180e80289919191981099baf30200013374a900219aba03374a900019aba037506eb4d5d080219aba03574200666ae80d5d080119aba0357426ae880080780784ccc074d5d0980f9aba100123232323232323232323232323232323371e6eb8d5d08080009bae001357420026aae78004dd50009aba1001302900135742002604e0026046002604a0026ae84004dd61aba100130220013574200260400144940c078d5d08021aba2357440026aae78dd500412802119191919191919191919198141981419814198141aba300a132357460026ae880184c8c8cc0848c8cc0b0ccc0a0d5d098151aba100124a0466e3cdd71aba100100413302323302d3371e6eb8d55ce8009bae302c302b01713302423302e3371e6eb8d55ce8009bae32357426ae88d5d11aba2001302c01813370e6eb4d55cf000a40046eacd55cf0009bab3027001302900100e0013574200c26600a00202a2646600c0026eb8c090c09c04ccdc09bad35742604c02400266e0ccdc1001800a410112f466604466644604444a666ae68d5d180088100992999ab9a300400113374a900019aba0300500102813003357440046ae8400480048c8c8c8c8cdc399991119981310a4000444a666ae68cdc79bae35573a00400c26660524290001112999ab9a3371e6eb8d55ce80100409bad35573c004260060026eacd55cf0010980180080080b80b000a40046eacc094004c09c004c08c004c094004004988c8c8c8c8c8c8c8c8dd68009aba100135573c0026ea8004c0a8004c0a0004c090004c098004d5d08009bac3020004375a6ae84c08803888c8c8c8c8cc0808c8c8c8c8c8c8cc0c0cdc79bae00100c1323233029232330343371e0029101001323232337120280026eb4d55cf0009aba100137566aae78008dd71aab9d00100137566058002605c00e6ae84004d55cf0009baa0013574200260520026ae84c0a0004004dd6181380098128009aba1001302300d3301675c6eb0c054004c07c004d5d0800980e8039aba23323301422533357346006004266ae8000800440040708cdc39aab9d37546ae84c074d5d0980e980d180e800a40040066eb0c06c00cdd61aba1002133011371e6eb8c054c060010cc039d71bac300d001301735742602e0029111c171163f05e4f30b6be3c22668c37978e7d508b84f83558e523133cdf0048810048811c2a65b4fbb371fade6e93853c060e398f2fdd55a24f4513025233ce5e0048811c620372840f3c82c1bc1ea862e9bbec191bac148d56598ed8fbaa5e0c004881000030020011498588d5d09aba2357446ae88d5d11aba2357446ae88d5d10009199180191aba030020010014bd62111980290801111198028011801800a60103d87a8000233002214a04446644a666ae68008528800980200109801800980111111919980318020009801800801198020018011112999aab9f001003133002357420026ae880048c8c0088cc0080080048c0088cc0080080048d5d09aba200122232332533357346002900008018a999ab9a300148008401058dc39aab9d00135573c0026ea800cdd8a4c46aae78dd500091aba1357446ae88004894ccd5cd0010008a50010581840003d87980821a006acfc01ab2d05e00f5f6"
    );

    const datumData = new DataConstr(
        0,
        [
            new DataI( 135_000_000 ),
            new DataB("de632878e7ade33091b05155739aea08e57f8def2f08465ccb9453e4"),
            new DataB("55a68e023e53e8eef1598c9abb1e519e4eac5e9cdef267a0b660d701"),
            new DataB("30303138")
        ]
    );

    const inputs: [UTxO, ...UTxO[]] = [
        new UTxO({
            utxoRef: {
                "id": "586f58387405091e56b25dace397844d474b8fe9f399e57500d508a71dda1be5",
                "index": 1
            },
            resolved: {
                address: "addr_test1qzdcekfl69elhh4w9w24d37rr9qfzzkc9eh722vuxfeh7rdadv7d7d5up74dz5u4p2mhz9ag7kkjn75rjylvt7kkrf9sx44v8e",
                value: Value.fromUnits([
                    {
                        "unit": "lovelace",
                        "quantity": "1963633"
                    },
                    {
                        "unit": "171163f05e4f30b6be3c22668c37978e7d508b84f83558e523133cdf74454d50",
                        "quantity": "20000000"
                    }
                ])
            }
        }),
        new UTxO({
            utxoRef: {
                "id": "6e96da819b69e0aba91f98c399f34111256792a771dd2b7e6c4ba8d5bf30eb24",
                "index": 0
            },
            resolved: {
                address: "addr_test1qzdcekfl69elhh4w9w24d37rr9qfzzkc9eh722vuxfeh7rdadv7d7d5up74dz5u4p2mhz9ag7kkjn75rjylvt7kkrf9sx44v8e",
                value: Value.fromUnits([
                    {
                        "unit": "lovelace",
                        "quantity": "1810387"
                    },
                    {
                        "unit": "171163f05e4f30b6be3c22668c37978e7d508b84f83558e523133cdf74454d50",
                        "quantity": "49939000000"
                    }
                ])
            }
        }),
        new UTxO({
            utxoRef: {
                id: "b5150c1f96d7ae180e05a73269a1d85402924081ed0594918074f0ecf8d7b628",
                index: 0
            },
            resolved: {
                address: "addr_test1qzdcekfl69elhh4w9w24d37rr9qfzzkc9eh722vuxfeh7rdadv7d7d5up74dz5u4p2mhz9ag7kkjn75rjylvt7kkrf9sx44v8e",
                value: Value.fromUnits([
                    {
                        "unit": "lovelace",
                        "quantity": "1810563"
                    },
                    {
                        "unit": "171163f05e4f30b6be3c22668c37978e7d508b84f83558e523133cdf74454d50",
                        "quantity": "21000000"
                    }
                ])
            }
        }),
        new UTxO({
            utxoRef: {
                id: "cbe9e27d27b33d3351108ac02e301399cfb4180c63d3ab6f20d8126425ca6184",
                index: 0
            },
            resolved: {
                address: "addr_test1wzs3zvjf8l54klxmcvmmgff0ghqj4jq0dxt3d0f3cup4p0gda8t5d",
                value: Value.fromUnits([
                    {
                        "unit": "lovelace",
                        "quantity": "1495570"
                    },
                    {
                        "unit": "55a68e023e53e8eef1598c9abb1e519e4eac5e9cdef267a0b660d70130303138",
                        "quantity": "1"
                    }
                ]),
                datum: datumData
            }
        }),
        new UTxO({
            utxoRef: {
                id: "fcf856f5fb8c499736a1a4428e460bff34b7a42ff8c4d913a7affe988409c463",
                index: 1
            },
            resolved: {
                address: "addr_test1qzdcekfl69elhh4w9w24d37rr9qfzzkc9eh722vuxfeh7rdadv7d7d5up74dz5u4p2mhz9ag7kkjn75rjylvt7kkrf9sx44v8e",
                value: Value.fromUnits([
                    {
                        "unit": "lovelace",
                        "quantity": "1155080"
                    },
                    {
                        "unit": "171163f05e4f30b6be3c22668c37978e7d508b84f83558e523133cdf74454d50",
                        "quantity": "20000000"
                    }
                ])
            }
        })
    ]; 

    const tx = new Tx({
        ..._tx,
        body: {
            ..._tx.body,
            inputs,
            refInputs: [
                new UTxO({
                    utxoRef: {
                        id: "a7422a8917094c344a6a1090b3b178fb3596f6664313c526ec60f5c75543fa3f",
                        index: 1
                    },
                    resolved: {
                        address: "addr_test1wzkpu8rjrmkmfhej5mjjdqx5ua8qrgakvv0u7mchvha0xugtkdjwx",
                        value: Value.fromUnits([
                            {
                                "unit": "lovelace",
                                "quantity": "2000000"
                            },
                            {
                                "unit": "620372840f3c82c1bc1ea862e9bbec191bac148d56598ed8fbaa5e0c",
                                "quantity": "1"
                            }
                        ]),
                        datum: dataFromCbor("1961a8")
                    }
                })
            ]
        },
    })

    const { v2: txInfoData } = getTxInfos( tx, undefined );

    /*
    console.log(
        JSON.stringify(
            txInfoData.toJson(),
            undefined,
            4
        )
    );
    //*/
    
    const redeemerData = new DataConstr( 0, [] );

    const purposeData = new DataConstr(
        1,
        [
            new DataConstr(
                0,
                [
                    new DataB("cbe9e27d27b33d3351108ac02e301399cfb4180c63d3ab6f20d8126425ca6184"),
                    new DataI(0)
                ]
            )
        ]
    );

    const ctxData = new DataConstr(
        0,
        [
            txInfoData,
            purposeData      
        ]
    );

    const completeContract = contract
    .$( PCurrencySymbol.from( fromHex("171163f05e4f30b6be3c22668c37978e7d508b84f83558e523133cdf") ) )
    .$( PTokenName.from( fromHex("74454d50") ) )
    .$( PPubKeyHash.from( fromHex("2a65b4fbb371fade6e93853c060e398f2fdd55a24f4513025233ce5e") ) )
    .$( PCurrencySymbol.from( fromHex("620372840f3c82c1bc1ea862e9bbec191bac148d56598ed8fbaa5e0c") ) )
    .$( PTokenName.from( fromHex("") ) )

    const evalResult = Machine.eval(
        completeContract
        .$( NFTSale.fromData( pData( datumData ) ) )
        .$( SaleAction.fromData( pData( redeemerData ) ) )
        .$( PScriptContext.fromData( pData( ctxData ) ) )
    );

    console.log( evalResult );
})