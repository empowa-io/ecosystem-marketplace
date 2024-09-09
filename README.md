## Empowa ecosystem marketplace

```mermaid
flowchart LR
    oneShot
    feeOracle
    marketplace
    marketplace_owner((marketplace\nowner))
    anyone((anyone))
    token{{payment asset}}

    anyone -. utxo param .-> oneShot

    oneShot ==> |mints NFT identifyer| feeOracle
    oneShot -. policy param .-> feeOracle

    oneShot -. policy param .-> marketplace
    
    marketplace_owner -. pub key hash param .-> marketplace
    marketplace_owner -. pub key hash param .-> feeOracle

    feeOracle --> |refUtxo| marketplace
    
    token -. policy param .-> marketplace
```

## Docs

see the [`docs` folder](./docs/) for documentation

## Testing Suite

### 1. Install Required Packages

```bash
npm install

# or

pnpm install
```

### 2. Run Tests

```bash
npm run test-al

# or

pnpm run test-al
```

![empowa-marketplace-unit-tests.gif](test/assets/images/empowa-marketplace-unit-tests.gif)
