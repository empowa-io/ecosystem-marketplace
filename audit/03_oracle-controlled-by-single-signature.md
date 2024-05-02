# Vulnerability 03: Oracle is Controlled by a Single Signature

Severity: Minor

## Description

At [line 23 of `feeOracle.ts`](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/feeOracle.ts#L23) updating
datum of the oracle UTxO is permitted by `owner`, which can be considered a
single point of failure, i.e. if access to `owner` wallet is lost, fee value is
locked permanently.

## Recommendation

Switch the authorization to the presence of a specified NFT. This way the NFT
can be stored in a multi-sig wallet, which alleviates the oracle from having a
single point of failure.
