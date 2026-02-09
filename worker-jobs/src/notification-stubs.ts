export function logEmailSendIntent(toUserId: string, subject: string, body: string): void {
  console.log("[resend-stub] Email would be sent", {
    toUserId,
    subject,
    body
  });
}

export function logSmsSendIntent(toUserId: string, body: string): void {
  console.log("[twilio-stub] SMS would be sent", {
    toUserId,
    body
  });
}
