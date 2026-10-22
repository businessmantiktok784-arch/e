import React from 'react';
import { LegalLayout, type LegalSectionItem } from './LegalLayout.js';
import { AlertCircle, ShieldAlert, Cpu, MapPin, Scale, HelpCircle } from 'lucide-react';

interface TermsPageProps {
  onNavigateTab: (tab: 'terms' | 'privacy') => void;
  onBackToApp: () => void;
}

const SECTIONS: LegalSectionItem[] = [
  { id: 'section-1', number: '1', title: 'Acceptance of Terms' },
  { id: 'section-2', number: '2', title: 'Description of the Earth Talk Platform' },
  { id: 'section-3', number: '3', title: 'Scientific & Educational AI Disclaimers' },
  { id: 'section-4', number: '4', title: 'Contributor Identity & Account System' },
  { id: 'section-5', number: '5', title: 'Geolocation & Coordinate Sharing Options' },
  { id: 'section-6', number: '6', title: 'User Responsibilities & Acceptable Use' },
  { id: 'section-7', number: '7', title: 'Community Investigations & Evidence Standards' },
  { id: 'section-8', number: '8', title: 'Intellectual Property & Media Licenses' },
  { id: 'section-9', number: '9', title: 'Third-Party Services & External APIs' },
  { id: 'section-10', number: '10', title: 'Service Availability, Limits & Volatility' },
  { id: 'section-11', number: '11', title: 'Limitation of Liability & Warranty Disclaimers' },
  { id: 'section-12', number: '12', title: 'Suspension, Moderation & Termination' },
  { id: 'section-13', number: '13', title: 'Governing Law & Dispute Resolution' },
  { id: 'section-14', number: '14', title: 'Modifications to Terms' },
  { id: 'section-15', number: '15', title: 'Contact Information' },
];

export const TermsPage: React.FC<TermsPageProps> = ({ onNavigateTab, onBackToApp }) => {
  return (
    <LegalLayout
      currentTab="terms"
      title="Terms of Service"
      subtitle="These Terms of Service govern your access to and use of the Earth Talk platform, WhatsApp submission workflows, community discovery feeds, and GIS observation layers in Rwanda."
      lastUpdated="October 11, 2026"
      sections={SECTIONS}
      onNavigateTab={onNavigateTab}
      onBackToApp={onBackToApp}
    >
      {/* Key Takeaways Card */}
      <div className="bg-[#f0f4f9] border border-[#d3e3fd] rounded-xl p-5 sm:p-6 not-prose space-y-3">
        <div className="flex items-center gap-2 font-semibold text-[#041e49] text-base">
          <Scale className="w-5 h-5 text-[#0b57d0]" />
          <span>Core Principles at a Glance</span>
        </div>
        <ul className="text-xs sm:text-sm text-[#3c4043] space-y-2 list-disc list-inside">
          <li>
            <strong>Educational Purpose:</strong> All AI interpretations are preliminary educational aids, never certified assay data or laboratory determinations.
          </li>
          <li>
            <strong>Privacy by Default:</strong> Newly submitted observations and exact coordinates remain private to the contributor until deliberately published.
          </li>
          <li>
            <strong>No Commercial Speculation:</strong> Earth Talk prohibits using observations for mineral speculation, claims staking, or commercial deposit appraisal.
          </li>
          <li>
            <strong>Community Responsibility:</strong> You must respect private property, field safety protocols, and maintain factual, civil discussions.
          </li>
        </ul>
      </div>

      {/* Section 1 */}
      <section id="section-1" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">1.</span> Acceptance of Terms
        </h2>
        <p>
          By accessing or using <strong>Earth Talk</strong> (accessible via web interfaces and the designated WhatsApp messaging channel), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree to these Terms, you must not access or use our services.
        </p>
        <p>
          Earth Talk is operated as a civic geoscience initiative (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;Earth Talk&rdquo;). These Terms apply to all visitors, registered WhatsApp contributors, local Field Explorers, and researchers who interact with our services.
        </p>
      </section>

      {/* Section 2 */}
      <section id="section-2" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">2.</span> Description of the Earth Talk Platform
        </h2>
        <p>
          Earth Talk is a WhatsApp-first GeoAI, GIS, and community geoscience platform tailored for Rwanda (&ldquo;Discover Earth. Together.&rdquo;). The service provides:
        </p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li>
            Multimodal artificial intelligence analysis of user-submitted field photographs and video clips of rocks, minerals, fossils, geological layers, structures, volcanic formations, and hydrogeological features.
          </li>
          <li>
            Generation of digital <strong>Geoscience Passports</strong> carrying unique identifiers (e.g., <code>ET-RW-000001</code>) summarizing observed characteristics.
          </li>
          <li>
            An interactive public and private Geographic Information System (GIS) map visualizing geological localities, district-level distributions, and community sites.
          </li>
          <li>
            Community investigation tools, question-and-answer threads, evidence submissions, and review ladders.
          </li>
        </ul>
      </section>

      {/* Section 3 */}
      <section id="section-3" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">3.</span> Scientific & Educational AI Disclaimers
        </h2>
        <div className="bg-[#fff3d7] border border-[#ffdf99] rounded-xl p-4 sm:p-5 not-prose my-3">
          <div className="flex items-center gap-2 font-semibold text-[#9f6108] text-sm sm:text-base">
            <AlertCircle className="w-5 h-5 text-[#9f6108] shrink-0" />
            <span>Strict Scientific Safety Policy</span>
          </div>
          <p className="text-xs sm:text-sm text-[#5e5e5e] mt-2 leading-relaxed">
            Observations analyzed by Earth Talk reflect <strong>preliminary AI-assisted visual interpretations</strong> based on photograph pixels and provided context. They do NOT constitute laboratory assay, petrographic thin-section analysis, X-ray diffraction, or official geological survey verification.
          </p>
        </div>
        <p>
          You acknowledge and agree to the following scientific limitations:
        </p>
        <ul className="list-disc list-inside space-y-2 pl-2">
          <li>
            <strong>No Economic or Mining Assays:</strong> Earth Talk never determines mineral grade, ore presence, deposit volume, commercial viability, market value, or purity from photographs. Any speculation or commercial reliance is strictly unauthorized and at your sole risk.
          </li>
          <li>
            <strong>No Geotechnical or Hazard Certification:</strong> AI interpretations must never be used as structural engineering assessments, slope stability certifications, landslide hazard clearances, or drinking water safety guarantees.
          </li>
          <li>
            <strong>Validation Uncertainty:</strong> Model confidence scores (e.g., high, moderate, low) express visual similarity rather than scientific certainty. Field confirmation requires laboratory-backed expert review.
          </li>
        </ul>
      </section>

      {/* Section 4 */}
      <section id="section-4" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">4.</span> Contributor Identity & Account System
        </h2>
        <p>
          Earth Talk avoids intrusive account registration by using lightweight, privacy-preserving identity models:
        </p>
        <ul className="list-disc list-inside space-y-2 pl-2">
          <li>
            <strong>WhatsApp Contributors:</strong> Identified via inbound WhatsApp messages. Your raw phone number is immediately converted on our servers into an irreversible, salted HMAC-SHA256 hash (<code>USER_HASH_SECRET</code>). The raw phone number is never stored in geological observation rows.
          </li>
          <li>
            <strong>WhatsApp Web Verification:</strong> Contributor sessions on the web are established via a 6-digit one-time code sent directly to your WhatsApp account. Tokens are time-limited and revocable.
          </li>
          <li>
            <strong>Field Explorer Accounts:</strong> Web visitors may participate in community discussions using local browser-stored profiles (&ldquo;Field Explorer #XXXX&rdquo;). Display names may be customized, subject to our 7-day rename cooldown window to prevent impersonation.
          </li>
          <li>
            <strong>Administrative Governance:</strong> Expert verification, research exports, and moderation queues are restricted to the authorized Super Admin.
          </li>
        </ul>
      </section>

      {/* Section 5 */}
      <section id="section-5" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">5.</span> Geolocation & Coordinate Sharing Options
        </h2>
        <p>
          Location data is sensitive. Earth Talk operates a strict voluntary consent framework with four distinct precision tiers:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 not-prose my-3">
          <div className="p-3.5 rounded-lg border border-[#e3e3e3] bg-[#f8fafd]">
            <span className="font-semibold text-xs text-[#0b57d0] block uppercase">District Centroid</span>
            <p className="text-xs text-[#5e5e5e] mt-1">General district representative coordinate. Protects exact outcrop location.</p>
          </div>
          <div className="p-3.5 rounded-lg border border-[#e3e3e3] bg-[#f8fafd]">
            <span className="font-semibold text-xs text-[#0b57d0] block uppercase">Approximate</span>
            <p className="text-xs text-[#5e5e5e] mt-1">Generalized coordinates within regional vicinity, masking precise GPS coordinates.</p>
          </div>
          <div className="p-3.5 rounded-lg border border-[#e3e3e3] bg-[#f8fafd]">
            <span className="font-semibold text-xs text-[#0b57d0] block uppercase">Exact (Affirmative Consent)</span>
            <p className="text-xs text-[#5e5e5e] mt-1">Exact recorded GPS decimal coordinates, published only with your explicit permission.</p>
          </div>
          <div className="p-3.5 rounded-lg border border-[#e3e3e3] bg-[#f8fafd]">
            <span className="font-semibold text-xs text-[#0b57d0] block uppercase">Private</span>
            <p className="text-xs text-[#5e5e5e] mt-1">Completely withheld from public map and APIs; visible only on your private &ldquo;My Map&rdquo; view.</p>
          </div>
        </div>
      </section>

      {/* Section 6 */}
      <section id="section-6" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">6.</span> User Responsibilities & Acceptable Use
        </h2>
        <p>When submitting observations, comments, or evidence, you agree that you will NOT:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li>Trespass on private property, restricted national parks, military zones, or protected natural reserves without legal authorization.</li>
          <li>Engage in hazardous exploration, unstable cliff descent, illegal excavation, or destructive hammering of culturally or environmentally sensitive outcrops.</li>
          <li>Submit fraudulent, synthetic, fabricated, or deliberately misleading images or location claims.</li>
          <li>Upload obscene, defamatory, harassing, sexually explicit, hateful, or abusive media or comments.</li>
          <li>Attempt to reverse-engineer contributor HMAC hashes, scrape bulk private records, or disrupt platform infrastructure through denial-of-service attacks.</li>
          <li>Promote commercial mineral deals, unlicensed artisanal mining ventures, or speculative investments.</li>
        </ul>
      </section>

      {/* Section 7 */}
      <section id="section-7" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">7.</span> Community Investigations & Evidence Standards
        </h2>
        <p>
          Earth Talk maintains an objective evidence ladder to categorize observations:
        </p>
        <ol className="list-decimal list-inside space-y-1 pl-2 text-xs sm:text-sm">
          <li><code>ai_assisted</code> — Automated model visual interpretation.</li>
          <li><code>community_discussed</code> — Reviewed with community commentary.</li>
          <li><code>community_investigated</code> — Backed by multiple site visits or corroborating evidence.</li>
          <li><code>expert_reviewed</code> — Assessed by a qualified geoscientist.</li>
          <li><code>scientifically_confirmed</code> — Confirmed through formal laboratory or published documentation.</li>
          <li><code>unresolved</code> — Disputed interpretation under active review.</li>
        </ol>
        <p className="text-xs sm:text-sm text-[#5e5e5e]">
          Community votes alone cannot elevate an observation to scientific confirmation. We reserve the right to remove any claim or down-rank evidence that violates our transparency standards.
        </p>
      </section>

      {/* Section 8 */}
      <section id="section-8" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">8.</span> Intellectual Property & Media Licenses
        </h2>
        <p>
          <strong>Your Content:</strong> You retain copyright and ownership of the original photographs, videos, and field notes you submit to Earth Talk.
        </p>
        <p>
          <strong>License to Earth Talk:</strong> By submitting content, you grant Earth Talk a worldwide, non-exclusive, royalty-free, perpetual license to host, display, reproduce, resize, format, and distribute your submitted media for educational, research, and non-commercial public science purposes on our platforms.
        </p>
        <p>
          <strong>Platform Intellectual Property:</strong> The Earth Talk software codebase, user interface, brand assets, taxonomy definitions, and curated geological site boundaries are protected by copyright and intellectual property laws.
        </p>
      </section>

      {/* Section 9 */}
      <section id="section-9" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">9.</span> Third-Party Services & External APIs
        </h2>
        <p>Earth Talk interfaces with external technology providers:</p>
        <ul className="list-disc list-inside space-y-1 pl-2 text-xs sm:text-sm">
          <li><strong>Meta / WhatsApp Cloud API:</strong> For inbound messaging transmission and automated session verification.</li>
          <li><strong>Google Gemini API:</strong> For server-side multimodal AI visual classification.</li>
          <li><strong>MapLibre GL & Esri / OpenStreetMap:</strong> For map tile rendering, satellite basemaps, and topographical relief.</li>
          <li><strong>Supabase:</strong> For database management and spatial GIS storage.</li>
        </ul>
        <p className="text-xs sm:text-sm text-[#5e5e5e]">
          Third-party services operate under their respective terms and privacy policies. Earth Talk is not liable for outages or policy shifts from external providers.
        </p>
      </section>

      {/* Section 10 */}
      <section id="section-10" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">10.</span> Service Availability, Limits & Volatility
        </h2>
        <p>
          Earth Talk is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We enforce reasonable rate limits on AI queries, image file sizes (up to 10MB per submission, avatars up to 1.5MB), and community actions to safeguard infrastructure. We reserve the right to modify, suspend, or discontinue features without liability.
        </p>
      </section>

      {/* Section 11 */}
      <section id="section-11" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">11.</span> Limitation of Liability & Warranty Disclaimers
        </h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED UNDER APPLICABLE LAW, EARTH TALK AND ITS CONTRIBUTORS, OPERATORS, AND AFFILIATES EXPRESSLY DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND ACCURACY OF SCIENTIFIC IDENTIFICATIONS.
        </p>
        <p>
          IN NO EVENT SHALL EARTH TALK BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM: (A) PERSONAL INJURY OR PHYSICAL ACCIDENTS SUSTAINED DURING FIELDWORK; (B) RELIANCE ON PRELIMINARY AI INTERPRETATIONS; (C) FINANCIAL OR MINING LOSSES; OR (D) DATA LOSS OR SYSTEM DOWNTIME.
        </p>
      </section>

      {/* Section 12 */}
      <section id="section-12" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">12.</span> Suspension, Moderation & Termination
        </h2>
        <p>
          Earth Talk provides community reporting mechanisms. Any content flagged for humanitarian safety, commercial deception, copyright infringement, or harassment may be hidden or permanently deleted by the Super Admin. We may revoke access tokens for contributors who breach these Terms.
        </p>
      </section>

      {/* Section 13 */}
      <section id="section-13" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">13.</span> Governing Law & Dispute Resolution
        </h2>
        <p>
          These Terms and any disputes arising from your use of Earth Talk shall be governed by and construed in accordance with the laws of the <strong>Republic of Rwanda</strong>, without regard to conflict of law principles. Any legal proceedings shall be subject to the exclusive jurisdiction of the competent courts located in Kigali, Rwanda.
        </p>
        <p className="text-xs text-[#5e5e5e] italic">
          [Operating Entity Placeholder: Earth Talk Community Geoscience Project / Authorized Non-Profit Entity]
        </p>
      </section>

      {/* Section 14 */}
      <section id="section-14" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">14.</span> Modifications to Terms
        </h2>
        <p>
          We may update these Terms from time to time to reflect evolving scientific standards or legal obligations. When revised, the &ldquo;Last Updated&rdquo; date at the top of this page will be amended. Continued use of Earth Talk constitutes acceptance of modified terms.
        </p>
      </section>

      {/* Section 15 */}
      <section id="section-15" className="scroll-mt-28 space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1f1f1f] flex items-center gap-2">
          <span className="font-mono text-[#0b57d0]">15.</span> Contact Information
        </h2>
        <p>For questions regarding these Terms, scientific policies, or community inquiries, please reach out to:</p>
        <div className="bg-[#f8fafd] border border-[#e3e3e3] rounded-xl p-4 text-xs sm:text-sm text-[#3c4043] space-y-1.5 not-prose">
          <div className="font-semibold text-[#1f1f1f]">Earth Talk Project Legal & Ethics Committee</div>
          <div>Email: <a href="mailto:privacy@earthtalk.org" className="text-[#0b57d0] hover:underline font-mono">privacy@earthtalk.org</a></div>
          <div>Location: Kigali, Rwanda [Physical Office Address / Postal Placeholder]</div>
          <div>Website: <a href="https://earthtalk.org" className="text-[#0b57d0] hover:underline font-mono">https://earthtalk.org</a></div>
        </div>
      </section>
    </LegalLayout>
  );
};
