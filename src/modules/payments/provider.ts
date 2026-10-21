// Implemented by a provider adapter, never by checkout or a browser callback.
export interface PaymentProvider {
  redirect(authority: string): string;
  createPayment(input: { paymentId: string; amountRial: bigint; callbackUrl: string; idempotencyKey: string }): Promise<{ authority: string; redirectUrl: string }>;
  verifyPayment(input: { authority: string; expectedAmountRial: bigint }): Promise<
    | { status: "verified"; transactionId: string; amountRial: bigint }
    | { status: "failed"; code: string }
    | { status: "unknown" }
  >;
}
