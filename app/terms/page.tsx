import type { Metadata } from "next";
import { LegalDocument, LegalSection } from "@/components/legal/LegalDocument";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Clickframes, credits, and monthly plans.",
};

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of Service" current="terms">
      <LegalSection title="The service">
        <p>
          These terms cover Clickframes at clickframes.app. You need a Google account, and you need to be 18 or older, to buy a plan or generate a video. By signing in or paying, you agree to these terms and the{" "}
          <a className="text-[#ffb089]" href="/privacy">Privacy Policy</a>.
        </p>
      </LegalSection>
      <LegalSection title="Your uploads">
        <p>You keep ownership of the scripts, photos, songs, and logos you upload. You give Clickframes permission to use them only to make, store, and show the video you asked for.</p>
        <p>You confirm that you have the rights to everything you upload, and permission from the people in the photos. You own the finished videos Clickframes makes for you, and you may use them anywhere, including in ads, gifts, and social posts.</p>
      </LegalSection>
      <LegalSection title="Credits and plans">
        <p>1 credit is 1 second of video. A monthly plan adds its credits each billing period. The month starts the day you pay. A one-time top-up is only for someone with an active monthly plan, and those credits are added once.</p>
        <p>Credits are used when a video starts generating. If you change plans, the new month starts the day that payment goes through, and the previous plan stops then. You can cancel a membership from the account menu. An active plan keeps access until the current period ends.</p>
      </LegalSection>
      <LegalSection title="Payments">
        <p>
          Whop processes the charge. The price you confirm at checkout is the price for that plan or top-up. If a charge looks wrong, email{" "}
          <a className="text-[#ffb089]" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and include the Google account you used.
        </p>
      </LegalSection>
      <LegalSection title="What you can expect">
        <p>The film is generated from what you submit. A face, product, or logo can hold from shot to shot, and it can also miss. Generation time varies. A finished file stays available in your library unless you ask us to delete the account.</p>
      </LegalSection>
      <LegalSection title="Acceptable use">
        <p>Do not upload anything you do not have the right to use. Do not use Clickframes for unlawful material, to impersonate a real person without permission, or to disrupt the service. We can refuse a generation or close an account that breaks these terms.</p>
      </LegalSection>
      <LegalSection title="The service can change">
        <p>We can update features, prices, and these terms. The date on this page is the version in effect. If you keep using Clickframes after an update, the new terms apply. Rights you already have where you live stay in place.</p>
        <p>
          If something is wrong, email <a className="text-[#ffb089]" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> first.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
