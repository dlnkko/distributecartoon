import type { Metadata } from "next";
import { LegalDocument, LegalSection } from "@/components/legal/LegalDocument";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Clickframes handles your account, uploads, videos, and payments.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy Policy" current="privacy">
      <LegalSection title="Who we are">
        <p>
          Clickframes is the site at clickframes.app. It turns a script, a photo, or a song into a Pixar or claymation short. This policy explains what we collect and why. To reach us, email{" "}
          <a className="text-[#ffb089]" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
      <LegalSection title="What we collect">
        <p>When you sign in with Google, we receive the name, email address, and profile photo Google shares for that account.</p>
        <p>When you make a video, we store what you submit: scripts, photos, songs, look notes, and the images and videos we generate from them. We also store your credit balance, plan, and the status of a payment.</p>
        <p>We keep a session cookie so you stay signed in, and a cookie that remembers a sign-out so the public site loads. We do not use that cookie to follow you across other sites.</p>
      </LegalSection>
      <LegalSection title="How we use it">
        <p>We use this information to run your account, make the video you asked for, show it in your library, charge the credits or plan you chose, and answer you if you email us.</p>
        <p>Photos, scripts, and audio are sent to the providers that generate the images and video. They are used to make your film, not to build a public profile of the people in the photos.</p>
      </LegalSection>
      <LegalSection title="Who else sees it">
        <p>Google handles sign-in. Supabase stores the account and project records. Cloudflare stores uploaded files and finished videos. Whop processes the payment. We do not store your full card number.</p>
        <p>The generation providers receive the material needed to make that film: the script, the photos, the audio, and the instructions for the look. We do not sell your account or your uploads.</p>
      </LegalSection>
      <LegalSection title="How long we keep it">
        <p>Scripts, photos, songs, and finished videos stay in your account so you can open them later. Payment records stay for as long as we need them to show your plan and to answer a billing question.</p>
        <p>
          To delete your account and the files in it, email <a className="text-[#ffb089]" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the Google address you use to sign in. We will delete the account data we can still reach, except records we have to keep for a payment dispute or a legal duty.
        </p>
      </LegalSection>
      <LegalSection title="Photos of other people">
        <p>Clickframes is for adults. If you upload a photo of someone else, including a family member or a child you are allowed to film, you are confirming that you have permission to use that photo for the video.</p>
      </LegalSection>
      <LegalSection title="Changes">
        <p>If this policy changes, the date at the top of this page changes with it. The current version is the one on clickframes.app/privacy.</p>
      </LegalSection>
    </LegalDocument>
  );
}
