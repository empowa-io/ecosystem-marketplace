# Vulnerability 05: Unused Variable

Severity: Informational

## Description

Unused variables can add unnecessary bloat to the code. `ownHash` in `feeOracle.ts` at [line 46](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/feeOracle.ts#L46) has
never been used.

## Recommendation

Remove `ownHash`.
