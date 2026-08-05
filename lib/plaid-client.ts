import {
  Configuration,
  CountryCode,
  CreditAccountSubtype,
  DepositoryAccountSubtype,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type LinkTokenCreateRequest,
} from "plaid";

export type PlaidEnvironmentName = "sandbox" | "production";

export function getPlaidEnvironment(): PlaidEnvironmentName {
  return process.env.PLAID_ENV?.trim().toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

export function isPlaidConfigured(): boolean {
  return Boolean(
    process.env.PLAID_CLIENT_ID?.trim() &&
      process.env.PLAID_SECRET?.trim() &&
      process.env.FINANCIAL_TOKEN_ENCRYPTION_KEY?.trim(),
  );
}

export function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = process.env.PLAID_SECRET?.trim();
  if (!clientId || !secret) {
    throw new Error("Plaid is not configured");
  }

  const environment = getPlaidEnvironment();
  const configuration = new Configuration({
    basePath: PlaidEnvironments[environment],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  return new PlaidApi(configuration);
}

export async function createPlaidLinkToken({
  clientUserId,
  accessToken,
}: {
  clientUserId: string;
  accessToken?: string;
}): Promise<string> {
  const request: LinkTokenCreateRequest = {
    client_name: "Southern Smiles",
    language: "en",
    country_codes: [CountryCode.Us],
    user: { client_user_id: clientUserId },
  };

  if (accessToken) {
    request.access_token = accessToken;
    request.additional_consented_products = [Products.Transactions];
    request.transactions = { days_requested: 730 };
  } else {
    request.products = [Products.Transactions];
    request.optional_products = [Products.Liabilities];
    request.transactions = { days_requested: 730 };
    request.account_filters = {
      credit: { account_subtypes: [CreditAccountSubtype.CreditCard] },
      depository: {
        account_subtypes: [
          DepositoryAccountSubtype.Checking,
          DepositoryAccountSubtype.Savings,
          DepositoryAccountSubtype.MoneyMarket,
        ],
      },
    };
  }

  const redirectUri = process.env.PLAID_REDIRECT_URI?.trim();
  const webhook = process.env.PLAID_WEBHOOK_URL?.trim();
  if (redirectUri) request.redirect_uri = redirectUri;
  if (webhook && !accessToken) request.webhook = webhook;

  const response = await getPlaidClient().linkTokenCreate(request);
  return response.data.link_token;
}

export interface PlaidApiErrorDetails {
  code: string | null;
  message: string;
  reconnectRequired: boolean;
}

export function getPlaidApiErrorDetails(error: unknown): PlaidApiErrorDetails {
  const responseData =
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response &&
    typeof error.response.data === "object" &&
    error.response.data !== null
      ? (error.response.data as Record<string, unknown>)
      : null;

  const code = typeof responseData?.error_code === "string"
    ? responseData.error_code
    : null;
  const message = typeof responseData?.error_message === "string"
    ? responseData.error_message
    : error instanceof Error
      ? error.message
      : "Plaid could not refresh this connection";

  return {
    code,
    message: message.slice(0, 1000),
    reconnectRequired: code === "ITEM_LOGIN_REQUIRED" || code === "ITEM_LOCKED",
  };
}
