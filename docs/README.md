# Empowa ecosystem marketplace documentaiton

## Index

- [project_overview](#project-overview)
- [project_structure](./project_structure/README.md)

## Project overview

### What is this? Where am I?

this repository contains the source code for the Empowa ecosystem marketplace.

the project is organized mainly in two folders:

- the `src` folder
- the `app` folder

the above contains the actual contracts.

the latter includes some scripts to interact with the compiled contracts.

### Contracts interaction

the project consists of 3 contracts in total:

- the `oneShot` minting policy;
- the `feeOracle`
- the `marketplace`

as you can imagine the `marketplace` is the principal one.

the `feeOracle` is used to update the fee that the marketplace takes for each succesful buy
the fee can be updated indipendently by the marketplace and it can be done only by a predefined owner

and finally the `oneShot` is a standard parametrized minting policy.

the interacitons are described in the chart below.

```mermaid
flowchart LR
    oneShot
    feeOracle
    marketplace
    owner((owner))
    anyone((anyone))
    token{{payment asset}}


    oneShot ==> |mints NFT identifyer| feeOracle
    oneShot -. policy param .-> feeOracle

    anyone -. utxo param .-> oneShot
    owner -. pub key hash param .-> marketplace

    oneShot -. policy param .-> marketplace
    
    owner -. pub key hash param .-> feeOracle

    feeOracle --> |refUtxo| marketplace
    
    token -. policy param .-> marketplace
```