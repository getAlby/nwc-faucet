# NWC Faucet

Build and test your application end to end without needing a real lightning wallet!

NWC Faucet allows you to create test wallets / dummy NWC connections for rapid app development and testing.

[Try it now](https://faucet.nwc.dev)

Powered by [Alby Hub](https://github.com/getAlby/hub)

## API

### Create new wallets

To create a new wallet with a starting balance of 10,000 sats:

```bash
curl -X POST https://faucet.nwc.dev?balance=10000
```

returns a connection string like this:

```txt
nostr+walletconnect://98e3f640a3d7dba6620f38b15abb4f4d58824bc309bb9f2bbee1eb55308e6eab?relay=wss://relay.getalby.com/v1&secret=09fc2a6cd2cfb6b61bc14fa943cc9dbd3303d6e07a3e459b8bb33c69ca54de68&lud16=nwc1769067475@getalby.com
```

The name of the wallet is the same as the username part of the lightning address (lud16 parameter above), in this case `nwc1769067475`.

### Top up a wallet

Then you can top up any wallet that was created by the faucet. The amount parameter is in sats.

```bash
curl -X POST https://faucet.nwc.dev/wallets/nwc1769067475/topup?amount=10000
```

## Development

### Setup env

Configure your .env file for your Alby Hub based on where it is deployed.

⚠️ this app MUST be used with a hub that has **no channels** and MUST have an Alby subscription. To pay for the subscription, you should use another Alby Hub with channels.

You can get the `ALBY_HUB_URL` and `AUTH_TOKEN` by logging into Alby Hub and Going to settings -> Developer. If you use Alby Cloud, you'll also need to provide `ALBY_HUB_NAME` and `ALBY_HUB_REGION` to route requests to your hub.

```bash
cp .env.example .env
```

```bash
yarn install
yarn dev
```

### Production

```bash
yarn build
yarn start
```
