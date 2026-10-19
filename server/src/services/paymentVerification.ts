import { paystackProvider } from "./paystackProvider";
import { cyzoraProvider } from "./cyzoraProvider";
import { VerifyPaymentResult } from "./paymentProvider";
import { PendingTransactionLookup } from "./paymentService";

/**
 * Verifies an existing payment with whichever provider created it.
 * Paystack rows are verified by our own reference; Cyzora rows by the
 * charge id / session reference stored at initialize time. Shared by
 * the /verify endpoint, the webhooks and the reconciliation cron so all
 * three use exactly the same trusted path.
 */
export async function verifyTransactionRow(row: PendingTransactionLookup): Promise<VerifyPaymentResult> {
  if (row.provider === "cyzora") {
    return cyzoraProvider.verifyByChannel(row.provider_channel, row.provider_transaction_id ?? "", row.provider_reference);
  }
  return paystackProvider.verifyPayment(row.provider_reference);
}
