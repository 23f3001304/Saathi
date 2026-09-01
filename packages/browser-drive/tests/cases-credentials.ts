import type { Case } from "./classifier-case.js";
import { c, REG } from "./classifier-case.js";

/** What the agent may never type into, by field. */
export const PASSWORD_CASES: readonly Case[] = [
  c("input type=password", { inputType: "password" }, "password", "login"),
  c("autocomplete current-password", { autocomplete: "current-password" }, "password", "login"),
  c("autocomplete new-password", { autocomplete: "new-password" }, "password", "login"),
  c("name=password", { name: "password" }, "password", "login"),
  c("name=passwd", { name: "passwd" }, "password", "login"),
  c("name=pwd", { name: "pwd" }, "password", "login"),
  c("id=user_pass_phrase", { id: "user_pass_phrase" }, "password", "login"),
  c("label पासवर्ड", { labelText: "पासवर्ड" }, "password", "login"),
  c(
    "password inside a sign-up flow hands off to account-creation",
    { inputType: "password", pageUrl: REG },
    "password",
    "account-creation",
  ),
];

export const OTP_CASES: readonly Case[] = [
  c("autocomplete one-time-code", { autocomplete: "one-time-code" }, "otp", "otp"),
  c("name=otp", { name: "otp" }, "otp", "otp"),
  c("name=otp_code", { name: "otp_code" }, "otp", "otp"),
  c("label One time password", { labelText: "One time password" }, "otp", "otp"),
  c("label Verification code", { labelText: "Verification code" }, "otp", "otp"),
  c("name=auth_code", { name: "auth_code" }, "otp", "otp"),
  c("aria Enter security code", { ariaLabel: "Enter security code" }, "otp", "otp"),
  c("name=mfa", { name: "mfa" }, "otp", "otp"),
  c("name=2fa", { name: "2fa" }, "otp", "otp"),
  c("label Passcode", { labelText: "Passcode" }, "otp", "otp"),
  c("label ओटीपी", { labelText: "ओटीपी" }, "otp", "otp"),
  c(
    "short numeric field beside verification text",
    { maxLength: 6, inputMode: "numeric", nearbyText: "Enter the code we sent you" },
    "otp",
    "otp",
  ),
  c(
    "four-digit tel field labelled PIN",
    { maxLength: 4, inputType: "tel", labelText: "PIN" },
    "otp",
    "otp",
  ),
  c(
    "pattern-only numeric beside a verify prompt",
    { maxLength: 8, pattern: "\\d{8}", nearbyText: "Verify your sign-in" },
    "otp",
    "otp",
  ),
];

export const CARD_CASES: readonly Case[] = [
  c("autocomplete cc-number", { autocomplete: "cc-number" }, "card", "payment"),
  c("autocomplete cc-name", { autocomplete: "cc-name" }, "card", "payment"),
  c("autocomplete cc-exp", { autocomplete: "cc-exp" }, "card", "payment"),
  c("autocomplete cc-exp-month", { autocomplete: "cc-exp-month" }, "card", "payment"),
  c("name=cardNumber", { name: "cardNumber" }, "card", "payment"),
  c("name=card_number", { name: "card_number" }, "card", "payment"),
  c("label Credit card", { labelText: "Credit card" }, "card", "payment"),
  c("label Debit card", { labelText: "Debit card" }, "card", "payment"),
  c("name=expiry_month", { name: "expiry_month" }, "card", "payment"),
  c("label Valid thru", { labelText: "Valid thru" }, "card", "payment"),
  c("label Card holder", { labelText: "Card holder" }, "card", "payment"),
  c("label कार्ड नंबर", { labelText: "कार्ड नंबर" }, "card", "payment"),
];

export const CVV_CASES: readonly Case[] = [
  c("autocomplete cc-csc", { autocomplete: "cc-csc" }, "cvv", "payment"),
  c("name=cvv", { name: "cvv" }, "cvv", "payment"),
  c("name=cvc", { name: "cvc" }, "cvv", "payment"),
  c("name=cvv2", { name: "cvv2" }, "cvv", "payment"),
  c("label Card security code", { labelText: "Card security code" }, "cvv", "payment"),
];

export const IDENTITY_CASES: readonly Case[] = [
  c("name=aadhaar", { name: "aadhaar" }, "aadhaar", "account-creation"),
  c("name=aadhar", { name: "aadhar" }, "aadhaar", "account-creation"),
  c("label आधार संख्या", { labelText: "आधार संख्या" }, "aadhaar", "account-creation"),
  c("name=uidai_number", { name: "uidai_number" }, "aadhaar", "account-creation"),
];

export const UPI_CASES: readonly Case[] = [
  c("name=upi_pin", { name: "upi_pin" }, "upi_pin", "payment"),
  c("label UPI PIN", { labelText: "UPI PIN" }, "upi_pin", "payment"),
  c("name=mpin", { name: "mpin" }, "upi_pin", "payment"),
  c("label ATM PIN", { labelText: "ATM PIN" }, "upi_pin", "payment"),
  c("label Transaction PIN", { labelText: "Transaction PIN" }, "upi_pin", "payment"),
  c("label यूपीआई पिन", { labelText: "यूपीआई पिन" }, "upi_pin", "payment"),
  c("name=upi_id", { name: "upi_id" }, "upi_vpa", "payment"),
  c("name=vpa", { name: "vpa" }, "upi_vpa", "payment"),
  c(
    "label Virtual payment address",
    { labelText: "Virtual payment address" },
    "upi_vpa",
    "payment",
  ),
];

export const BANK_CASES: readonly Case[] = [
  c("name=account_number", { name: "account_number" }, "bank_account", "payment"),
  c("name=ifsc", { name: "ifsc" }, "bank_account", "payment"),
  c("label IBAN", { labelText: "IBAN" }, "bank_account", "payment"),
  c("label Routing number", { labelText: "Routing number" }, "bank_account", "payment"),
  c("label खाता संख्या", { labelText: "खाता संख्या" }, "bank_account", "payment"),
];

export const CREDENTIAL_CASES: readonly Case[] = [
  ...PASSWORD_CASES,
  ...OTP_CASES,
  ...CARD_CASES,
  ...CVV_CASES,
  ...IDENTITY_CASES,
  ...UPI_CASES,
  ...BANK_CASES,
];
