"use client";

import { useState } from "react";
import type { FormEvent } from "react";

const propertyOptions = [
  { value: "PLOT", label: "Residential plot" },
  { value: "INDEPENDENT_HOUSE", label: "Independent house" },
  { value: "FLAT", label: "Apartment / flat" },
  { value: "VILLA", label: "Villa" }
];

export default function EnquiryPage() {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [propertyType, setPropertyType] = useState("PLOT");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!/^\d{10}$/.test(phone)) {
      setMessage("Enter a valid 10-digit Indian mobile number.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      fullName: String(form.get("fullName") || "").trim(),
      phone: `+91${phone}`,
      email: String(form.get("email") || "").trim() || undefined,
      propertyType,
      preferredLocation: String(form.get("preferredLocation") || "").trim(),
      preferredArea: String(form.get("preferredArea") || "").trim(),
      preferredLanguage: String(form.get("preferredLanguage") || "English"),
      callConsent: form.get("callConsent") === "on",
      source: "PUBLIC_WEBSITE"
    };

    if (!payload.callConsent) {
      setMessage("Please agree to receive a call about this enquiry before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
      const response = await fetch(`${apiBase}/leads/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Enquiry submission is not available yet. Please try again later.");
      }
      formElement.reset();
      setPhone("");
      setMessage("Thank you. Your enquiry has been received. Our team will contact you shortly.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit your enquiry right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="enquiry-shell">
      <section className="enquiry-card">
        <div className="enquiry-brand">ESTATEPILOT AI</div>
        <p className="enquiry-eyebrow">PROPERTY ENQUIRY</p>
        <h1>Find a property that feels right.</h1>
        <p className="enquiry-intro">Share what you are looking for. Our property team will get in touch to help with verified details and arrange a site visit if you wish.</p>

        <form onSubmit={handleSubmit} className="enquiry-form">
          <label>
            Your name <span>*</span>
            <input name="fullName" autoComplete="name" placeholder="Enter your full name" required maxLength={100} />
          </label>

          <label>
            Mobile number <span>*</span>
            <div className="phone-field">
              <span className="country-code">🇮🇳 +91</span>
              <input
                aria-label="10-digit Indian mobile number"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                required
              />
            </div>
          </label>

          <label>
            Email address <small>(optional)</small>
            <input name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={160} />
          </label>

          <label>
            What are you interested in? <span>*</span>
            <select value={propertyType} onChange={(event) => setPropertyType(event.target.value)} required>
              {propertyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label>
            Preferred location <small>(optional)</small>
            <input name="preferredLocation" placeholder="e.g. Varthur, Sarjapur, Whitefield" maxLength={160} />
          </label>

          <label>
            Preferred size / configuration <small>(optional)</small>
            <input name="preferredArea" placeholder="e.g. 2 BHK, 1200 sq. ft. plot" maxLength={120} />
          </label>

          <label>
            Preferred language
            <select name="preferredLanguage" defaultValue="English">
              <option>English</option>
              <option>తెలుగు (Telugu)</option>
              <option>हिन्दी (Hindi)</option>
              <option>ಕನ್ನಡ (Kannada)</option>
              <option>தமிழ் (Tamil)</option>
              <option>മലയാളം (Malayalam)</option>
              <option>Other / flexible</option>
            </select>
          </label>

          <label className="consent-row">
            <input name="callConsent" type="checkbox" required />
            <span>I agree to be contacted by phone about this property enquiry. I understand I can ask not to be contacted again.</span>
          </label>

          <p className="privacy-note">We do not ask for your budget in this form. Your details will be used to respond to this enquiry.</p>
          <button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit property enquiry"}</button>
          {message && <p role="status" className="form-message">{message}</p>}
        </form>
        <footer>EstatePilot AI · Property enquiries</footer>
      </section>
    </main>
  );
}
