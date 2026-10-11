import React from 'react';
import { Camera, Send, Cpu, Award, Map, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';

interface AboutSectionProps {
  onOpenWhatsApp: () => void;
}

export const HowItWorksSection: React.FC<AboutSectionProps> = ({ onOpenWhatsApp }) => {
  const steps = [
    {
      num: '01',
      title: 'Photograph What You Found',
      desc: 'Take a clear photograph of a rock, mineral, fossil, rock layer, landform, spring, slope or other geological feature. Show texture, colour and fresh surfaces clearly.',
      icon: Camera,
    },
    {
      num: '02',
      title: 'Send via WhatsApp',
      desc: 'Send the photo or a short video directly to Earth Talk on WhatsApp without needing to download or install any mobile apps.',
      icon: Send,
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
      desc: 'Receive immediate educational feedback and a unique public identifier (e.g. RT-RW-000001) for your observation.',
      icon: Award,
    },
    {
      num: '05',
      title: 'Safe Public Observation Map',
      desc: 'When voluntary consent is provided, the observation contributes to Rwanda’s living citizen geoscience observation map.',
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
    <div className="max-w-5xl mx-auto py-10 px-4 sm:px-6">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="text-xs font-mono uppercase tracking-widest text-amber-700 font-semibold block mb-2">
          Citizen Science Workflow
        </span>
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight sm:text-4xl">
          How Earth Talk Works
        </h1>
        <p className="mt-3 text-stone-600 text-sm sm:text-base leading-relaxed">
          From your mobile camera in the field to a national geoscience observation map, here is the complete journey of a submission.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.num} className="bg-white p-6 rounded-xl border border-stone-200 shadow-xs relative flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-xs font-bold text-stone-400 bg-stone-100 px-2 py-0.5 rounded">
                    Step {s.num}
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <h3 className="font-semibold text-stone-900 text-base mb-2">{s.title}</h3>
                <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">{s.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-stone-900 text-white rounded-xl p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-xl font-bold mb-2">Found something interesting?</h3>
        <p className="text-stone-300 text-sm mb-6">
          Send a photo to Earth Talk right now on WhatsApp.
        </p>
        <button
          onClick={onOpenWhatsApp}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-md transition-colors shadow-sm"
        >
          Send a Photo on WhatsApp
        </button>
      </div>
    </div>
  );
};

export const AboutSection: React.FC<AboutSectionProps> = ({ onOpenWhatsApp }) => {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 space-y-10">
      <div>
        <span className="text-xs font-mono uppercase tracking-widest text-amber-700 font-semibold block mb-2">
          Project Mission
        </span>
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight sm:text-4xl mb-4">
          About Earth Talk
        </h1>
        <p className="text-stone-700 text-base sm:text-lg leading-relaxed">
          <strong>Earth Talk</strong> is a WhatsApp-first GeoAI, GIS and community geoscience platform designed for Rwanda. Discover Earth. Together. It enables anyone—students, educators, field workers, farmers, miners, and curious citizens—to submit photographs and videos of geological and geoscientific features, receive a preliminary educational interpretation, and contribute to an interactive geoscience map.
        </p>
      </div>

      {/* Scientific Notice Banner */}
      <div className="bg-amber-50/80 border border-amber-300/80 rounded-xl p-6 text-stone-800 space-y-3">
        <div className="flex items-center gap-2 font-bold text-amber-950 text-base">
          <AlertCircle className="w-5 h-5 text-amber-700" />
          <span>Scientific Notice & Standards</span>
        </div>
        <p className="text-sm leading-relaxed">
          Earth Talk provides <strong>preliminary AI-assisted visual interpretations</strong> from user-submitted photographs. A photograph alone is never sufficient for definitive laboratory determination.
        </p>
        <p className="text-sm leading-relaxed">
          Public observations are <strong>not automatically official geological survey data</strong>. The system explicitly distinguishes observed visual characteristics from inferences and never guarantees mineral grades, ore presence, economic value, deposit size, engineering safety or hazard certification from photos alone.
        </p>
        <p className="text-sm leading-relaxed">
          Earth Talk is a broad geoscience platform. <strong>Rock is one category, not the whole subject.</strong> Minerals, fossils, geological layers and structures, geomorphology, volcanic features, hydrogeology, mining and engineering-geology observations are all first-class.
        </p>
        <p className="text-sm leading-relaxed">
          No scientific validation dataset has been entered yet, so <strong>Earth Talk publishes no measured model accuracy</strong>. When that work is done it will be reported with its real sample size and its real uncertainty.
        </p>
      </div>

      {/* Privacy Guarantee */}
      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2 font-bold text-stone-900 text-base">
          <ShieldCheck className="w-5 h-5 text-emerald-700" />
          <span>Privacy-by-Design Architecture</span>
        </div>
        <ul className="text-sm text-stone-600 space-y-2 list-disc list-inside">
          <li><strong>No Phone Numbers Stored:</strong> WhatsApp sender telephone numbers are immediately hashed with salted HMAC-SHA256 and never saved in geological records.</li>
          <li><strong>Protected Coordinates:</strong> Private exact GPS coordinates are kept securely on the server. The public map defaults to generalized district representative coordinates.</li>
          <li><strong>Private by Default:</strong> Newly analyzed specimens are private by default and require deliberate publication consent to appear on the public map.</li>
        </ul>
      </div>

      {/* Contact & CTA */}
      <div className="border-t border-stone-200 pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-semibold text-stone-900 text-sm">Contribute to Rwanda Geoscience</h4>
          <p className="text-xs text-stone-600">Start discovering with your camera today.</p>
        </div>
        <button
          onClick={onOpenWhatsApp}
          className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-md text-sm font-medium transition-colors"
        >
          Send Photo or Video
        </button>
      </div>
    </div>
  );
};
