import React from 'react';
import { LegalLayout, type LegalSectionItem } from './LegalLayout.js';
import { ShieldCheck, Lock, EyeOff, Server, MapPin, Sparkles, UserCheck, Cookie } from 'lucide-react';

interface PrivacyPageProps {
  onNavigateTab: (tab: 'terms' | 'privacy') => void;
  onBackToApp: () => void;
}

const SECTIONS: LegalSectionItem[] = [
  { id: 'priv-1', number: '1', title: 'Privacy-by-Design Architecture' },
  { id: 'priv-2', number: '2', title: 'Information We Collect Directly' },
  { id: 'priv-3', number: '3', title: 'Information We Intentionally Do NOT Collect' },
  { id: 'priv-4', number: '4', title: 'Location Data & Precision Policies' },
  { id: 'priv-5', number: '5', title: 'AI Processing & Third-Party LLM Usage' },
  { id: 'priv-6', number: '6', title: 'How We Use Your Information' },
  { id: 'priv-7', number: '7', title: 'Data Sharing, Maps & Public Visibility' },
  { id: 'priv-8', number: '8', title: 'Cookies, Local Storage & Client State' },
  { id: 'priv-9', number: '9', title: 'Third-Party Service Providers' },
  { id: 'priv-10', number: '10', title: 'Data Storage, Retention & Deletion' },
  { id: 'priv-11', number: '11', title: 'User Rights & Privacy Choices' },
  { id: 'priv-12', number: '12', title: 'Children’s Privacy Notice' },
  { id: 'priv-13', number: '13', title: 'Security Safeguards & Encryption' },
  { id: 'priv-14', number: '14', title: 'International Data Transfers' },
  { id: 'priv-15', number: '15', title: 'Changes to this Policy' },
  { id: 'priv-16', number: '16', title: 'Contacting the Privacy Team' },
];

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ onNavigateTab, onBackToApp }) => {
  return (
    <LegalLayout
      currentTab="privacy"
      title="Privacy Policy"
      subtitle="How Earth Talk collects, pseudonymizes, processes, and protects your geological observations, location coordinates, and contributor identity in Rwanda."
      lastUpdated="October 11, 2026"
      sections={SECTIONS}
      onNavigateTab={onNavigateTab}
      onBackToApp={onBackToApp}
    >
      {/* Privacy Highlights Card */}
      <div className="bg-[#e6f4ea] border border-[#ceead6] rounded-xl p-5 sm:p-6 not-prose space-y-3">
        <div className="flex items-center gap-2 font-semibold text-[#137333] text-base">
          <ShieldCheck className="w-5 h-5 text-[#137333]" />
          <span>Our Privacy-by-Design Commitments</span>
        </div>
        <ul className="text-xs sm:text-sm text-[#3c4043] space-y-2 list-disc list-inside">
          <li>
            <strong>Zero Raw Phone Numbers Stored:</strong> Inbound WhatsApp telephone numbers are immediately hashed server-side using salted HMAC-SHA256 and never recorded in geological records.
          </li>
          <li>
            <strong>Coordinate Masking by Default:</strong> Exact GPS coordinates are never made public without your explicit consent; public views default to generalized district representative points.
          </li>
          <li>
            <strong>No Third-Party Advertising:</strong> Earth Talk contains zero commercial tracking scripts, zero data brokers, and zero ad networks.
          </li>
          <li>
            <strong>Full Contributor Control:</strong> You can designate any observation as private, delete profile avatars, or withdraw public listings at any time.
          </li>
        </ul>
      </div>

      {/* Section 1 */}
      <section id="priv-1" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">1.</span> Privacy-by-Design Architecture
        </h2>
        <p>
          Earth Talk (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the platform&rdquo;) is built on the belief that citizen science must protect participant safety. In field sciences and geology, revealing exact personal identifiers or unconsented coordinates can expose individuals or fragile geological sites to exploitation.
        </p>
        <p>
          Our technical architecture enforces privacy at the protocol level. We operate in compliance with ethical citizen science guidelines and the legal frameworks governing data protection in the Republic of Rwanda.
        </p>
      </section>

      {/* Section 2 */}
      <section id="priv-2" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">2.</span> Information We Collect Directly
        </h2>
        <p>When you interact with Earth Talk, we collect the following limited categories of information:</p>
        <ul className="list-disc list-inside space-y-2 pl-2">
          <li>
            <strong>Geoscience Media:</strong> Photographs (JPEG, PNG, WebP) and short video clips of rock outcrops, mineral specimens, landforms, fossils, soil profiles, and water springs submitted via WhatsApp or web upload.
          </li>
          <li>
            <strong>Field Observations:</strong> Text notes, specimen descriptions, answers to community questions, and qualitative comments provided by you.
          </li>
          <li>
            <strong>Voluntary Geographic Information:</strong> GPS coordinates (latitude/longitude), elevation data, or district/sector names you voluntarily provide.
          </li>
          <li>
            <strong>Contributor Profiles:</strong> Local display names (e.g., &ldquo;Field Explorer #2041&rdquo; or your chosen nickname) and profile avatar images (up to 1.5MB).
          </li>
          <li>
            <strong>Moderation Reports:</strong> If you report abusive content, we collect the reason category and an irreversible cryptographic hash of your browser session to prevent duplicate submissions.
          </li>
        </ul>
      </section>

      {/* Section 3 */}
      <section id="priv-3" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">3.</span> Information We Intentionally Do NOT Collect
        </h2>
        <div className="bg-[#f8fafd] border border-[#e3e3e3] rounded-xl p-4 sm:p-5 not-prose my-3">
          <div className="flex items-center gap-2 font-semibold text-[#1f1f1f] text-sm sm:text-base">
            <Lock className="w-5 h-5 text-[#0b57d0] shrink-0" />
            <span>Strict Non-Collection Boundaries</span>
          </div>
          <p className="text-xs sm:text-sm text-[#5e5e5e] mt-2 leading-relaxed">
            We deliberately design our database schema to reject unnecessary personal data:
          </p>
          <ul className="text-xs sm:text-sm text-[#3c4043] space-y-1.5 mt-2 list-disc list-inside">
            <li><strong>No Telephone Numbers:</strong> Raw phone numbers are transformed into an irreversible cryptographic hash (salted HMAC-SHA256) upon message arrival and immediately discarded from memory.</li>
            <li><strong>No Government IDs or Financial Info:</strong> Earth Talk never asks for national IDs, passports, credit cards, or bank details.</li>
            <li><strong>No Biometric or Facial Recognition:</strong> Media is processed exclusively for geological and landscape classification. Human faces are not indexed.</li>
            <li><strong>No Third-Party Ad Trackers:</strong> We do not deploy Google Analytics, Meta Pixels, or cross-site tracking cookies.</li>
          </ul>
        </div>
      </section>

      {/* Section 4 */}
      <section id="priv-4" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">4.</span> Location Data & Precision Policies
        </h2>
        <p>
          Geographic data in Earth Talk is governed by a strict four-tiered location precision engine:
        </p>
        <ul className="list-disc list-inside space-y-2 pl-2">
          <li>
            <strong>1. District Centroid (Default):</strong> Observations without affirmative exact-location consent are generalized to the geographic center of the relevant Rwandan district (e.g., Gisagara, Musanze, Huye). Exact coordinates are masked.
          </li>
          <li>
            <strong>2. Approximate:</strong> Coordinates are generalized to a regional radius, preventing pinpoint identification of private property or vulnerable mineral veins.
          </li>
          <li>
            <strong>3. Exact:</strong> High-precision decimal coordinates are displayed on the public map ONLY if you explicitly authorize public sharing.
          </li>
          <li>
            <strong>4. Private:</strong> Kept strictly confidential; coordinates are never returned by public API views and are rendered exclusively on your authenticated &ldquo;My Map&rdquo; view.
          </li>
        </ul>
        <p className="text-xs sm:text-sm text-[#5e5e5e]">
          <strong>Browser Geolocation:</strong> When you click &ldquo;Show my location&rdquo; on the web map, your browser uses HTML5 Geolocation locally on your device to display a position marker. This coordinate is NOT transmitted to or stored on our servers.
        </p>
      </section>

      {/* Section 5 */}
      <section id="priv-5" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">5.</span> AI Processing & Third-Party LLM Usage
        </h2>
        <p>
          Earth Talk integrates Google Gemini API (<code>@google/genai</code>, models such as <code>gemini-3.8-flash</code> and <code>gemini-2.5-flash</code>) to provide educational image interpretations.
        </p>
        <ul className="list-disc list-inside space-y-2 pl-2">
          <li>
            <strong>How It Works:</strong> When you submit a photograph or video frame, our backend transmits the media bytes and caption server-side over an encrypted TLS connection to Google Gemini API.
          </li>
          <li>
            <strong>Returned Analysis:</strong> The model evaluates visual characteristics (rock texture, mineral luster, structural layering) and outputs structured taxonomy categories, diagnostic features, and educational safety notes.
          </li>
          <li>
            <strong>Data Privacy:</strong> Under our server-side API integration, submitted field data is used exclusively to answer the inference call and is not used by Earth Talk to train proprietary models.
          </li>
        </ul>
      </section>

      {/* Section 6 */}
      <section id="priv-6" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">6.</span> How We Use Your Information
        </h2>
        <p>We use the data collected strictly for the following purposes:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li>To generate your educational Geoscience Passport and preliminary classification.</li>
          <li>To visualize geological observations across Rwandan districts on the interactive map.</li>
          <li>To support community investigations, discussions, and evidence correlation.</li>
          <li>To allow Super Admin moderation of spam, humanitarian hazards, and abusive content.</li>
          <li>To compile aggregated, anonymized open-science research summaries for geological researchers.</li>
        </ul>
      </section>

      {/* Section 7 */}
      <section id="priv-7" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">7.</span> Data Sharing, Maps & Public Visibility
        </h2>
        <p>
          <strong>Public Information:</strong> If you publish an observation, the following information is accessible publicly via the map and public API: specimen category, AI classification, user caption, post title, community discussions, and the authorized generalized coordinate.
        </p>
        <p>
          <strong>Confidential Information:</strong> Your hashed contributor key, unconsented exact coordinates, and private draft observations are NEVER exposed via public endpoints. The SQL view <code>public_observations</code> replaces exact latitude and longitude with <code>NULL</code> unless exact sharing is enabled.
        </p>
      </section>

      {/* Section 8 */}
      <section id="priv-8" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">8.</span> Cookies, Local Storage & Client State
        </h2>
        <p>
          Earth Talk does not use traditional tracking cookies. We utilize browser <code>localStorage</code> solely for functional application state:
        </p>
        <ul className="list-disc list-inside space-y-1.5 pl-2 text-xs sm:text-sm">
          <li><code>earthtalk_user_session</code> — Secure token for authenticated WhatsApp contributor web access.</li>
          <li><code>earthtalk_local_account</code> — Your lightweight Field Explorer display name and avatar identifier.</li>
          <li><code>earthtalk_preferences</code> — Your map visual preferences (basemap layer, 2D/3D camera pitch, location permission preference).</li>
          <li><code>earthtalk_history</code> — Client-side history of recently viewed passports (never synced to server).</li>
        </ul>
      </section>

      {/* Section 9 */}
      <section id="priv-9" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">9.</span> Third-Party Service Providers
        </h2>
        <p>We work with trusted infrastructure providers:</p>
        <div className="space-y-2 not-prose my-3 text-xs sm:text-sm">
          <div className="p-3 rounded-lg border border-[#e3e3e3] bg-white">
            <span className="font-semibold text-[#1f1f1f]">Meta WhatsApp Business Cloud API:</span>
            <p className="text-[#5e5e5e] mt-0.5">Processes incoming media and outgoing verification codes according to Meta&rsquo;s Business Privacy Policy.</p>
          </div>
          <div className="p-3 rounded-lg border border-[#e3e3e3] bg-white">
            <span className="font-semibold text-[#1f1f1f]">Google Gemini API:</span>
            <p className="text-[#5e5e5e] mt-0.5">Executes multimodal AI visual classification over secure server-side proxy routes.</p>
          </div>
          <div className="p-3 rounded-lg border border-[#e3e3e3] bg-white">
            <span className="font-semibold text-[#1f1f1f]">MapLibre GL & Esri / OpenStreetMap:</span>
            <p className="text-[#5e5e5e] mt-0.5">Supplies public raster map tiles (World Imagery, World Topo, OpenStreetMap). No personal data is sent to tile servers.</p>
          </div>
          <div className="p-3 rounded-lg border border-[#e3e3e3] bg-white">
            <span className="font-semibold text-[#1f1f1f]">Supabase (PostgreSQL / PostGIS):</span>
            <p className="text-[#5e5e5e] mt-0.5">Provides encrypted relational and spatial database storage.</p>
          </div>
        </div>
      </section>

      {/* Section 10 */}
      <section id="priv-10" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">10.</span> Data Storage, Retention & Deletion
        </h2>
        <p>
          Observations are stored indefinitely in the citizen science registry to support longitudinal geological research. Contributor session tokens automatically expire after 7 days (or immediately upon sign-out).
        </p>
        <p>
          <strong>Account & Observation Deletion:</strong> You have the right to request deletion of your submitted observations, comments, or profile avatar at any time by contacting our privacy team.
        </p>
      </section>

      {/* Section 11 */}
      <section id="priv-11" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">11.</span> User Rights & Privacy Choices
        </h2>
        <p>You maintain full control over your participation:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong>Location Anonymity:</strong> Change precision tiers or mark observations private from your dashboard.</li>
          <li><strong>Profile Removal:</strong> Remove your avatar or reset your local Field Explorer identity.</li>
          <li><strong>Data Access:</strong> Request a copy of all observations linked to your contributor hash.</li>
          <li><strong>Withdrawal:</strong> Request unpublishing of any post from the public GIS layer.</li>
        </ul>
      </section>

      {/* Section 12 */}
      <section id="priv-12" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">12.</span> Children’s Privacy Notice
        </h2>
        <p>
          Earth Talk is designed for students, educators, and the general public. However, our WhatsApp interaction channels require users to meet the minimum age specified by WhatsApp (13 years or older). We do not knowingly collect personal information directly from children under 13 without verifiable parental or school consent.
        </p>
      </section>

      {/* Section 13 */}
      <section id="priv-13" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">13.</span> Security Safeguards & Encryption
        </h2>
        <p>We deploy robust technical and operational protections:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2 text-xs sm:text-sm">
          <li>All web traffic is encrypted using Transport Layer Security (TLS 1.3/HTTPS).</li>
          <li>Contributor phone numbers are irreversibly hashed with salted HMAC-SHA256.</li>
          <li>Admin sessions use scrypt key derivation and constant-time token comparison.</li>
          <li>Strict rate limiting prevents automated scraping and credential brute-force attempts.</li>
        </ul>
      </section>

      {/* Section 14 */}
      <section id="priv-14" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">14.</span> International Data Transfers
        </h2>
        <p>
          While Earth Talk is dedicated to Rwanda geoscience, our cloud infrastructure and third-party APIs (such as Meta WhatsApp and Google Gemini) may process data in cloud data centers located in Europe or the United States. All transfers are governed by international cloud data security standards.
        </p>
      </section>

      {/* Section 15 */}
      <section id="priv-15" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">15.</span> Changes to this Policy
        </h2>
        <p>
          We may update this Privacy Policy to reflect technical enhancements or statutory updates. Changes will be posted to <code>/privacy</code> with an updated revision date.
        </p>
      </section>

      {/* Section 16 */}
      <section id="priv-16" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">16.</span> Contacting the Privacy Team
        </h2>
        <p>
          If you have questions about your privacy, wish to request data deletion, or require clarification regarding our hashing architecture, contact our data protection team:
        </p>
        <div className="bg-[#f8fafd] border border-[#e3e3e3] rounded-xl p-4 text-xs sm:text-sm text-[#3c4043] space-y-1.5 not-prose">
          <div className="font-semibold text-[#1f1f1f]">Earth Talk Data Protection Office</div>
          <div>Email: <a href="mailto:privacy@earthtalk.org" className="text-[#0b57d0] hover:underline font-mono">privacy@earthtalk.org</a></div>
          <div>Address: Kigali, Rwanda [Official Physical Address Placeholder]</div>
          <div>Jurisdiction: Republic of Rwanda</div>
        </div>
      </section>
    </LegalLayout>
  );
};
