import React from 'react';
import {  AlertCircle,  ShieldCheck,  ArrowLeft,  Cpu,  Award,  Map,  CheckCircle2,  Compass,  MessageSquarePlus,} from 'lucide-react';

interface AboutSectionProps {
  onOpenWhatsApp: () => void;
  onNavigate: (view: 'terms' | 'privacy' | 'explore') => void;
  onBackToApp: () => void;
}

export const HowItWorksSection: React.FC<AboutSectionProps> = ({ onOpenWhatsApp, onNavigate, onBackToApp }) => {
  const steps = [
    {
      num: '01',
      title: 'Send a Photograph on WhatsApp',
      desc: 'Take a clear photo or short video of a geological feature, rock, mineral, fossil, or landform in the field and message it to Earth Talk.',
      icon: Compass,
    },
    {
      num: '02',
      title: 'Session Verification',
      desc: 'A secure WhatsApp session confirmation is completed instantly without storing private phone numbers.',
      icon: ShieldCheck,
    },
    {
      num: '03',
      title: 'Multimodal AI Analysis',
      desc: 'The AI classifies what it was shown into a geoscience category and subcategory, then gives a cautious preliminary interpretation of what can actually be seen.',
      icon: Cpu,
    },
    {
      num: '04',
      title: 'Receive Geoscience Passport',
      desc: 'Receive immediate educational feedback and a unique public identifier for your observation.',
      icon: Award,
    },
    {
      num: '05',
      title: 'Safe Public Observation Map',
      desc: 'When voluntary consent is provided, the observation contributes to living citizen geoscience observation maps.',
      icon: Map,
    },
    {
      num: '06',
      title: 'Evidence, Not Assumption',
      desc: 'An observation stays unverified until a recorded expert review exists. Community agreement and AI confidence are never presented as scientific confirmation.',
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafd] text-[#1f1f1f] flex flex-col selection:bg-[#d3e3fd] selection:text-[#041e49]">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#e3e3e3] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[#e3e3e3] bg-white text-[13px] font-medium text-[#3c4043] hover:bg-[#f0f4f9] hover:text-[#1f1f1f] transition-colors shadow-2xs"
              title="Return to Earth Talk application"
            >
              <ArrowLeft className="w-4 h-4 text-[#5e5e5e]" />
              <span className="hidden sm:inline">Back to map</span>
            </button>
            <div className="h-5 w-[1px] bg-[#e3e3e3] hidden sm:block" />
            <div
              className="flex items-center gap-2.5 cursor-pointer group"
              onClick={onBackToApp}
            >
              <img
                src="/icon.png"
                alt="Earth Talk Logo"
                className="w-7 h-7 rounded-md object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="leading-tight">
                <span className="font-medium text-[15px] text-[#1f1f1f] tracking-tight group-hover:text-[#0b57d0] transition-colors">
                  Earth Talk
                </span>
                <span className="hidden md:inline-block ml-2 text-[11px] text-[#5e5e5e] font-normal">
                  How It Works
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 w-full space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <span className="text-xs font-mono uppercase tracking-widest text-[#0b57d0] font-semibold block">
            Citizen Science Workflow
          </span>
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#1f1f1f] tracking-tight">
            How Earth Talk Works
          </h1>
          <p className="text-[#5e5e5e] text-sm sm:text-base leading-relaxed">
            From your mobile camera in the field to a national geoscience observation map, here is the complete journey of a submission.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.num}
                className="bg-white p-6 rounded-2xl border border-[#e3e3e3] shadow-xs flex flex-col justify-between space-y-4 hover:border-[#0b57d0]/50 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-semibold text-[#0b57d0] bg-[#f0f4f9] px-2.5 py-1 rounded-md border border-[#e3e3e3]">
                      Step {s.num}
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-[#f0f4f9] text-[#0b57d0] flex items-center justify-center border border-[#e3e3e3]">
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-[#1f1f1f] text-base mb-2">{s.title}</h3>
                  <p className="text-[#5e5e5e] text-xs sm:text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export const AboutSection: React.FC<AboutSectionProps> = ({ onOpenWhatsApp, onNavigate, onBackToApp }) => {
  return (
    <div className="min-h-screen bg-[#f8fafd] text-[#1f1f1f] flex flex-col selection:bg-[#d3e3fd] selection:text-[#041e49]">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#e3e3e3] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[#e3e3e3] bg-white text-[13px] font-medium text-[#3c4043] hover:bg-[#f0f4f9] hover:text-[#1f1f1f] transition-colors shadow-2xs"
              title="Return to Earth Talk application"
            >
              <ArrowLeft className="w-4 h-4 text-[#5e5e5e]" />
              <span className="hidden sm:inline">Back to map</span>
            </button>
            <div className="h-5 w-[1px] bg-[#e3e3e3] hidden sm:block" />
            <div
              className="flex items-center gap-2.5 cursor-pointer group"
              onClick={onBackToApp}
            >
              <img
                src="/icon.png"
                alt="Earth Talk Logo"
                className="w-7 h-7 rounded-md object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="leading-tight">
                <span className="font-medium text-[15px] text-[#1f1f1f] tracking-tight group-hover:text-[#0b57d0] transition-colors">
                  Earth Talk
                </span>
                <span className="hidden md:inline-block ml-2 text-[11px] text-[#5e5e5e] font-normal">
                  About & Mission
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 w-full space-y-10">
        <div className="bg-white rounded-2xl border border-[#e3e3e3] p-8 sm:p-12 shadow-sm space-y-8">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-[#0b57d0] font-semibold block mb-2">
              Project Mission
            </span>
            <h1 className="text-3xl sm:text-4xl font-semibold text-[#1f1f1f] tracking-tight mb-4">
              About Earth Talk
            </h1>
            <p className="text-[#3c4043] text-base sm:text-lg leading-relaxed">
              <strong>Earth Talk</strong> is a WhatsApp-first GeoAI, GIS and community geoscience platform designed for discovery and public science. Discover Earth. Together. It enables anyone—students, educators, field workers, farmers, miners, and curious citizens—to submit photographs and videos of geological and geoscientific features, receive a preliminary educational interpretation, and contribute to an interactive geoscience map.
            </p>
          </div>

          {/* Scientific Notice Banner */}
          <div className="bg-[#f0f4f9] border border-[#d3e3fd] rounded-2xl p-6 text-[#1f1f1f] space-y-3">
            <div className="flex items-center gap-2 font-semibold text-[#041e49] text-base">
              <AlertCircle className="w-5 h-5 text-[#0b57d0]" />
              <span>Scientific Notice & Standards</span>
            </div>
            <p className="text-sm leading-relaxed text-[#3c4043]">
              Earth Talk provides <strong>preliminary AI-assisted visual interpretations</strong> from user-submitted photographs. A photograph alone is never sufficient for definitive laboratory determination.
            </p>
            <p className="text-sm leading-relaxed text-[#3c4043]">
              Public observations are <strong>not automatically official geological survey data</strong>. The system explicitly distinguishes observed visual characteristics from inferences and never guarantees mineral grades, ore presence, economic value, deposit size, engineering safety or hazard certification from photos alone.
            </p>
          </div>

          {/* Privacy Guarantee */}
          <div className="bg-white border border-[#e3e3e3] rounded-2xl p-6 space-y-3 shadow-2xs">
            <div className="flex items-center gap-2 font-semibold text-[#1f1f1f] text-base">
              <ShieldCheck className="w-5 h-5 text-[#137333]" />
              <span>Privacy-by-Design Architecture</span>
            </div>
            <ul className="text-sm text-[#3c4043] space-y-2 list-disc list-inside">
              <li><strong>No Phone Numbers Stored:</strong> WhatsApp sender telephone numbers are immediately hashed with salted HMAC-SHA256 and never saved in geological records.</li>
              <li><strong>Protected Coordinates:</strong> Private exact GPS coordinates are kept securely on the server. The public map defaults to generalized district representative coordinates.</li>
              <li><strong>Private by Default:</strong> Newly analyzed specimens are private by default and require deliberate publication consent to appear on the public map.</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};
