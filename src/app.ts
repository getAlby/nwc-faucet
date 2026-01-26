import "dotenv/config";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyBody from "@fastify/formbody";
import fastifyCors from "@fastify/cors";
import path from "path";

const APP_NAME_PREFIX = "nwc";

function removeTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.AUTH_TOKEN}`,
    "AlbyHub-Name": process.env.ALBY_HUB_NAME || "",
    "AlbyHub-Region": process.env.ALBY_HUB_REGION || "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function getAlbyHubUrl() {
  const albyHubUrl = process.env.ALBY_HUB_URL;
  if (!albyHubUrl) {
    throw new Error("No ALBY_HUB_URL set");
  }
  return removeTrailingSlash(albyHubUrl);
}

async function createApp() {
  const newAppResponse = await fetch(new URL("/api/apps", getAlbyHubUrl()), {
    method: "POST",
    body: JSON.stringify({
      name: APP_NAME_PREFIX + Math.floor(Date.now() / 1000),
      pubkey: "",
      budgetRenewal: "monthly",
      maxAmount: 0,
      scopes: [
        "get_info",
        "pay_invoice",
        "get_balance",
        "make_invoice",
        "lookup_invoice",
        "list_transactions",
        "notifications",
      ],
      returnTo: "",
      isolated: true,
      metadata: {
        app_store_app_id: "uncle-jim",
      },
    }),
    headers: getHeaders(),
  });

  if (!newAppResponse.ok) {
    throw new Error("Failed to create app: " + (await newAppResponse.text()));
  }

  const newApp = (await newAppResponse.json()) as {
    pairingUri: string;
    id: string;
    name: string;
  };

  if (!newApp.pairingUri) {
    throw new Error("No pairing URI in create app response");
  }

  return newApp;
}

async function transferToApp(appId: string, amountSat: number): Promise<void> {
  const transferResponse = await fetch(
    new URL("/api/transfers", getAlbyHubUrl()),
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        toAppId: appId,
        amountSat,
      }),
    },
  );

  if (!transferResponse.ok) {
    throw new Error("Failed to transfer: " + (await transferResponse.text()));
  }
}

async function createLightningAddress(
  appId: string,
  address: string,
): Promise<void> {
  console.log("Creating lightning address", address, appId);
  const response = await fetch(
    new URL("/api/lightning-addresses", getAlbyHubUrl()),
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        address,
        appId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      "Failed to create lightning address: " + (await response.text()),
    );
  }
}

const fastify = Fastify({ logger: true });

// Register static file serving for the HTML page
fastify.register(fastifyStatic, {
  root: path.join(__dirname),
  prefix: "/",
});

fastify.register(fastifyBody);
fastify.register(fastifyCors, {
  origin: "*",
});

fastify.get("/", async (request, reply) => {
  return reply.sendFile("index.html");
});

fastify.post("/", async (request, reply) => {
  const query = request.query as { balance?: string } | undefined;
  const body = request.body as { balance?: string } | undefined;
  const balance = body?.balance
    ? parseInt(body.balance, 10)
    : query?.balance
      ? parseInt(query.balance, 10)
      : undefined;

  try {
    const newApp = await createApp();

    if (balance !== undefined && balance > 0) {
      await transferToApp(newApp.id, balance);
    }

    await createLightningAddress(newApp.id, newApp.name);

    return `${newApp.pairingUri}&lud16=${newApp.name}@getalby.com`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    reply.status(500).send({ error: errorMessage });
    throw error;
  }
});

fastify.post<{ Params: { name: string } }>(
  "/wallets/:name/topup",
  async (request, reply) => {
    const { name } = request.params;
    const query = request.query as { amount?: string } | undefined;
    const body = request.body as { amount?: string } | undefined;
    const amount = body?.amount
      ? parseInt(body.amount, 10)
      : query?.amount
        ? parseInt(query.amount, 10)
        : undefined;

    try {
      if (!name || !amount) {
        throw new Error("missing parameters");
      }

      // in case lightning address was passed, only take the username component
      const [appName] = name.split("@");

      console.log(`Looking up app: ${appName}`);

      const appsResponse = await fetch(
        new URL(
          `/api/apps?filters=${JSON.stringify({ name: appName })}`,
          getAlbyHubUrl(),
        ),
        {
          headers: getHeaders(),
        },
      );

      if (!appsResponse.ok) {
        throw new Error(`Failed to list apps: ${appsResponse.status}`);
      }

      const apps = (await appsResponse.json()) as {
        apps: {
          id: string;
          name: string;
        }[];
      };
      if (apps.apps.length !== 1) {
        throw new Error(
          "Unexpected number of apps returned in apps request: " +
            apps.apps.length,
        );
      }
      const targetApp = apps.apps.find((app) => app.name === appName);

      if (!targetApp) {
        throw new Error(`App not found: ${appName}.`);
      }

      console.log(
        `Found app ${appName} (ID: ${targetApp.id}), transferring ${amount} sats...`,
      );

      // 2. Transfer funds to the app
      await transferToApp(targetApp.id, amount);

      return reply.send({
        message: "Payment successful",
        amount: amount,
      });
    } catch (error) {
      console.error("Top up failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      reply.status(500).send({ error: errorMessage });
    }
  },
);

const start = async () => {
  try {
    await fastify.listen({
      port: parseInt(process.env.PORT || "3000"),
      host: "0.0.0.0",
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
