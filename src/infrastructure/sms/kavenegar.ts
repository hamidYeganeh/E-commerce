export interface SmsSender {
  sendCode(phone: string, code: string): Promise<void>;
}

export class KavenegarSms implements SmsSender {
  constructor(private readonly apiKey: string, private readonly template: string, private readonly request: typeof fetch = fetch) {}

  async sendCode(phone: string, code: string) {
    if (!this.apiKey || !this.template) throw new Error("SMS_NOT_CONFIGURED");
    // Key is in the provider URL by contract. Never log the URL, response body, or thrown fetch error.
    const url = `https://api.kavenegar.com/v1/${encodeURIComponent(this.apiKey)}/verify/lookup.json`;
    try {
      const response = await this.request(url, {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ receptor: `0${phone.slice(3)}`, token: code, template: this.template, type: "sms" }),
      });
      const payload = await response.json() as { return?: { status?: number } };
      if (!response.ok || payload.return?.status !== 200) throw new Error("SMS_DELIVERY_FAILED");
    } catch {
      throw new Error("SMS_DELIVERY_FAILED");
    }
  }
}
