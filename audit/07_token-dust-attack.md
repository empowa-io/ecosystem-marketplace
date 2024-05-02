# Vulnerability 07: Token Dust Attack

Severity: Major

## Description

At `feeOracle.ts`, since the continuing output is only validated
via `pvalueOf`, it can be subject to being filled with random tokens which can
increase the transaction fees of subsequent transactions, and even brick the
UTxO.

This is a common vulnerability known as "Token Dust Attack."

## Recommendation

The recommendation here is identical to the one given for `feeOracle.ts`'s own
input at [02. Costly Value Lookups](./02_costly-value-lookups.md), i.e. check
the UTxO's value consists of exactly 2 assets, one of which is Ada, and the
other is the authentication NFT.

Note that ordering of assets is also lexicographic (similar to input UTxOs).
However this might depend on the framework (`plu-ts` in this case) and how it
gives access to assets and/or flattens a value.

We reiterate here that it is not advised to validate the Lovelace count in this
instance as its minimum amount depends on network's protocol parameters.
