## Index

- [.. (project_structure)](..)
- [contracts](#contracts)
    - [`oneShot`](#oneshot)
    - [`feeOracle`](#feeoracle)
    - [`marketplace`](#marketplace)
- [utils](#utils)
    - [`isInputFromScript`](#isinputfromscript)
    - [`pvalueOf`](#pvalueof)

## Contracts

### `oneShot`


parametrized minting policy.

allows the minting of a single token.

doesn't allow burning.

only mints if the parameter utxo is spent in the transaction.

### `feeOracle`

parametrized spending contract.

requires a policy and a token name as parameters (assumed to be the ones of the `oneShot`)

requires the pub key hash of the owner (whoever will be able to update the fee).

allows spending only if:

1) the input includes the NFT (policy and token name parameters).
2) the output having the NFT goes back to the same contract
3) the new fee (specified as the redeemer) is in range `0 <= x <= 1_000_000`
4) the new fee is specified in the inline output datum having the NFT

### `marketplace`

parametrized spending contract.

requires a policy and a token name as parameters for the token to use as payment ( in out case the EMP policy and token name)
requires a pub key hash to which the fee will be sent.
requires a policy and a token name as parameters (assumed to be the ones of the `oneShot`)

keeps as datum:
- the price of the sale
- the seller (pkh)
- the policy and token name of the token sold.

the user can interact in 3 ways with it:

- Buy
- Close
- Update

most of them are only allowed to `Buy`; `Close` and `Update` require the owner to sign the transacion.

#### `Close`

CDDL:
```cddl
rdmrClose = #6.122([])
```

only requirement is the owner signed

#### `Update`

CDDL:
```cddl
rdmrClose = #6.123([ int ])
```

requires the the owner signed.

checks that the output wiht the NFT sold is going back to the contract.

> **_NOTE:_** `Update` is just like `Close`; with additional safety checks.
> 
> if the client is trusted the `Close` action may also be used to update the sale (essentialy re-listing the closed sale)


#### `Buy`

CDDL:
```cddl
rdmrClose = #6.121([])
```

requires the feeOracle reference input to be included in the transaciton.

checks that the sold NFT is sent to the first required signer of the tranasation.

checks that the fee is sent to the owner (parameter)

checks that the remaining amount goes to the seller (specified in the datum).

## Utils


### `isInputFromScript`


### `pvalueOf`

